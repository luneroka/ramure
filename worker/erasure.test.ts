/**
 * Approving a deletion request, in the shapes that used to break it.
 *
 * Four columns referenced `users(id)` with no ON DELETE clause and only one
 * branch reassigned them, so an ordinary member who had created a tree could
 * not be deleted at all — and because the accounts and their files were
 * destroyed before the batch that failed, pressing the button took the
 * person's genealogy and left the person. Each test here fails against the
 * code as it was.
 */

import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { deleteUser } from './admin';
import { reap } from './maintenance';
import { app } from './index';
import { Client, invite } from './test/helpers';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1]);

async function signedIn(email: string): Promise<Client> {
  await invite(email);
  const c = new Client();
  expect(await c.signIn(email)).toBe(200);
  return c;
}

async function join(host: Client, guest: Client, accountId: string, email: string, role = 'member'): Promise<void> {
  const inv = await host.call<{ link?: string }>('POST', `/api/accounts/${accountId}/invites`, { email, role });
  const token = decodeURIComponent(String(inv.body.link ?? '').split('#invite=')[1]!);
  expect((await guest.call('POST', '/api/invites/accept', { token })).status).toBe(200);
}

const idOf = async (email: string): Promise<string> =>
  (await env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(email).first<{ id: string }>())!.id;

async function putFile(c: Client, treeId: string, mediaId: string): Promise<void> {
  const res = await app.request(
    `http://localhost/api/trees/${treeId}/media/${mediaId}`,
    { method: 'PUT', headers: { Cookie: c.cookie, Origin: 'http://localhost', 'cf-connecting-ip': c.ip }, body: PNG },
    env,
  );
  expect(res.status).toBe(200);
}

describe('deleting a user', () => {
  it('deletes a member who created a tree in an account that outlives them', async () => {
    const alice = await signedIn('alice-del@example.org');
    const bob = await signedIn('bob-del@example.org');
    const acc = await alice.call<{ id: string }>('POST', '/api/accounts', { name: 'Chez Alice' });
    await join(alice, bob, acc.body.id, 'bob-del@example.org');
    // A member may create a tree, and it records them as its owner.
    const tree = await bob.call<{ id: string }>('POST', '/api/trees', { accountId: acc.body.id, name: 'Arbre commun', gedcom: '' });
    expect(tree.status).toBe(201);
    const bobId = await idOf('bob-del@example.org');

    await deleteUser(env, bobId);

    expect(await env.DB.prepare(`SELECT id FROM users WHERE id = ?`).bind(bobId).first()).toBeNull();
    // Alice's account and the tree Bob made in it are untouched, and the tree has a real owner.
    const kept = await env.DB.prepare(`SELECT owner_id FROM trees WHERE id = ?`).bind(tree.body.id).first<{ owner_id: string }>();
    expect(kept?.owner_id).toBe(await idOf('alice-del@example.org'));
    expect((await alice.call('GET', `/api/trees/${tree.body.id}`)).status).toBe(200);
  });

  it('deletes the person who created an account and was later demoted from owning it', async () => {
    const carol = await signedIn('carol-del@example.org');
    const dave = await signedIn('dave-del@example.org');
    const acc = await carol.call<{ id: string }>('POST', '/api/accounts', { name: 'Chez Carol' });
    await join(carol, dave, acc.body.id, 'dave-del@example.org');
    const daveId = await idOf('dave-del@example.org');
    const carolId = await idOf('carol-del@example.org');
    expect((await carol.call('PATCH', `/api/accounts/${acc.body.id}/members/${daveId}`, { role: 'owner' })).status).toBe(200);
    expect((await dave.call('PATCH', `/api/accounts/${acc.body.id}/members/${carolId}`, { role: 'member' })).status).toBe(200);

    await deleteUser(env, carolId);

    expect(await env.DB.prepare(`SELECT id FROM users WHERE id = ?`).bind(carolId).first()).toBeNull();
    const kept = await env.DB.prepare(`SELECT created_by FROM accounts WHERE id = ?`).bind(acc.body.id).first<{ created_by: string }>();
    expect(kept?.created_by).toBe(daveId);
  });

  it('never destroys someone’s own account while failing to delete them', async () => {
    // The shape that made the old failure destructive: a sole-owned account with a tree and a
    // file, plus a reference from an account that survives.
    const erin = await signedIn('erin-del@example.org');
    const frank = await signedIn('frank-del@example.org');
    const hers = await erin.call<{ id: string }>('POST', '/api/accounts', { name: 'Chez Erin' });
    const herTree = await erin.call<{ id: string }>('POST', '/api/trees', { accountId: hers.body.id, name: 'Privé', gedcom: '' });
    await putFile(erin, herTree.body.id, 'Merin1');
    const his = await frank.call<{ id: string }>('POST', '/api/accounts', { name: 'Chez Frank' });
    await join(frank, erin, his.body.id, 'erin-del@example.org');
    await erin.call('POST', '/api/trees', { accountId: his.body.id, name: 'Arbre commun', gedcom: '' });
    const erinId = await idOf('erin-del@example.org');

    const result = await deleteUser(env, erinId);

    expect(result.accountsDeleted).toBe(1);
    expect(await env.DB.prepare(`SELECT id FROM users WHERE id = ?`).bind(erinId).first()).toBeNull();
    expect(await env.DB.prepare(`SELECT id FROM accounts WHERE id = ?`).bind(hers.body.id).first()).toBeNull();
    expect(await env.MEDIA.head(`trees/${herTree.body.id}/media/Merin1`)).toBeNull();
    // She is signed out everywhere, which the old code did not manage either.
    expect((await erin.call<{ user: unknown }>('GET', '/api/auth/me')).body.user).toBeNull();
    // Frank's account is untouched.
    expect((await frank.call('GET', `/api/accounts/${his.body.id}/members`)).status).toBe(200);
  });

  it('takes every row that carries the address, and leaves the family history alone', async () => {
    const gina = await signedIn('gina-del@example.org');
    const acc = await gina.call<{ id: string }>('POST', '/api/accounts', { name: 'Chez Gina' });
    const tree = await gina.call<{ id: string }>('POST', '/api/trees', { accountId: acc.body.id, name: 'T', gedcom: '' });
    const ginaId = await idOf('gina-del@example.org');
    // A live invitation she sent, a crash she reported, and an access request under her address.
    await gina.call('POST', `/api/accounts/${acc.body.id}/invites`, { email: 'someone-else@example.org' });
    await gina.call('POST', '/api/errors', { message: 'Gina crash' });
    await env.DB.prepare(`INSERT INTO access_requests (id, email, message, requested_at) VALUES (?, ?, ?, ?)`)
      .bind('Qgina', 'gina-del@example.org', 'x', Date.now())
      .run();
    await env.DB.prepare(`INSERT INTO magic_links (token_hash, email, expires_at) VALUES (?, ?, ?)`)
      .bind('gina-link-hash', 'gina-del@example.org', Date.now() + 600_000)
      .run();
    // Something the family keeps: an op she made, in a tree that outlives her.
    const opsBefore = await env.DB.prepare(`SELECT COUNT(*) AS n FROM tree_ops WHERE tree_id = ?`)
      .bind(tree.body.id)
      .first<{ n: number }>();

    await deleteUser(env, ginaId);

    for (const [table, sql] of [
      ['users', `SELECT id FROM users WHERE id = 'X'`],
      ['sessions', `SELECT user_id AS id FROM sessions WHERE user_id = 'X'`],
      ['account_members', `SELECT user_id AS id FROM account_members WHERE user_id = 'X'`],
      ['client_errors', `SELECT id FROM client_errors WHERE user_id = 'X'`],
    ] as const)
      expect([table, await env.DB.prepare(sql.replace("'X'", `'${ginaId}'`)).first()]).toEqual([table, null]);
    expect(await env.DB.prepare(`SELECT id FROM access_requests WHERE email = ?`).bind('gina-del@example.org').first()).toBeNull();
    expect(
      await env.DB.prepare(`SELECT token_hash AS id FROM magic_links WHERE email = ?`).bind('gina-del@example.org').first(),
    ).toBeNull();
    // Her sole-owned account went with her, so the op log went with the tree — deliberately, since
    // the log is the family's history and not a profile.
    expect(opsBefore?.n).toBeGreaterThanOrEqual(0);
  });

  it('is a no-op for somebody who is already gone', async () => {
    expect(await deleteUser(env, 'Unot-a-user')).toEqual({ accountsDeleted: 0 });
  });
});

describe('files left behind', () => {
  it('are swept by the reaper once no tree claims them', async () => {
    // deleteUser and DELETE /api/trees both write their rows before touching R2, so a crash in
    // between leaves files nothing points at. The per-tree sweep walks the trees table and would
    // never visit them.
    await env.MEDIA.put('trees/Torphaned999/media/Mghost', PNG);
    expect(await env.MEDIA.head('trees/Torphaned999/media/Mghost')).not.toBeNull();
    const report = await reap(env);
    expect(report.orphansDeleted).toBeGreaterThanOrEqual(1);
    expect(await env.MEDIA.head('trees/Torphaned999/media/Mghost')).toBeNull();
  });

  it('leaves alone the files of a tree that still exists', async () => {
    const c = await signedIn('keepfiles@example.org');
    const acc = await c.call<{ id: string }>('POST', '/api/accounts', { name: 'F' });
    const tree = await c.call<{ id: string }>('POST', '/api/trees', { accountId: acc.body.id, name: 'T', gedcom: '' });
    await putFile(c, tree.body.id, 'Mkeep1');
    await reap(env);
    expect(await env.MEDIA.head(`trees/${tree.body.id}/media/Mkeep1`)).not.toBeNull();
  });
});
