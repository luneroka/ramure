import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { app } from './index';
import { adminClient, Client, invite } from './test/helpers';

describe('closed door', () => {
  it('refuses an address nobody invited, with no mail and no code', async () => {
    const c = new Client();
    const r = await c.call('POST', '/api/auth/request', { email: 'stranger@example.org' });
    expect(r.status).toBe(403);
    const me = await c.call<{ user: unknown }>('GET', '/api/auth/me');
    expect(me.body.user).toBeNull();
  });

  it('lets an invited address in once, then as a user for good', async () => {
    await invite('guest@example.org');
    const c = new Client();
    expect(await c.signIn('guest@example.org')).toBe(200);
    const me = await c.call<{ user: { email: string; isAdmin: boolean } }>('GET', '/api/auth/me');
    expect(me.body.user.email).toBe('guest@example.org');
    expect(me.body.user.isAdmin).toBe(false);
    // The invitation is spent, but the user exists now: a second device signs in without a new invitation.
    const d = new Client();
    expect(await d.signIn('guest@example.org')).toBe(200);
  });

  it('makes the configured address the administrator on first sign-in', async () => {
    await invite('admin@example.org');
    const c = new Client();
    expect(await c.signIn('admin@example.org')).toBe(200);
    const me = await c.call<{ user: { isAdmin: boolean } }>('GET', '/api/auth/me');
    expect(me.body.user.isAdmin).toBe(true);
  });

  it('rejects a wrong code, and a right code only once', async () => {
    await invite('once@example.org');
    const c = new Client();
    const r = await c.call<{ code: string }>('POST', '/api/auth/request', { email: 'once@example.org' });
    expect((await c.call('POST', '/api/auth/code', { email: 'once@example.org', code: '000000' })).status).toBe(400);
    expect((await c.call('POST', '/api/auth/code', { email: 'once@example.org', code: r.body.code })).status).toBe(200);
    // Spent, and from a browser that never asked: refused either way.
    expect((await new Client().call('POST', '/api/auth/code', { email: 'once@example.org', code: r.body.code })).status).toBe(403);
    expect((await c.call('POST', '/api/auth/code', { email: 'once@example.org', code: r.body.code })).status).toBe(403);
  });
});

describe('administration', () => {
  it('is closed to ordinary users', async () => {
    await invite('plain@example.org');
    const c = new Client();
    await c.signIn('plain@example.org');
    expect((await c.call('GET', '/api/admin/overview')).status).toBe(403);
    expect((await c.call('POST', '/api/admin/invites', { email: 'x@example.org' })).status).toBe(403);
  });

  it('invites an address, which can then sign in; invitations can be revoked', async () => {
    const a = await adminClient();
    const inv = await a.call<{ id: string; email: string }>('POST', '/api/admin/invites', { email: 'Newcomer@Example.org' });
    expect(inv.status).toBe(201);
    expect(inv.body.email).toBe('newcomer@example.org');
    const overview = await a.call<{ invites: Array<{ email: string }> }>('GET', '/api/admin/overview');
    expect(overview.body.invites.some((i) => i.email === 'newcomer@example.org')).toBe(true);
    expect((await a.call('DELETE', `/api/admin/invites/${inv.body.id}`)).status).toBe(200);
    expect(await new Client().signIn('newcomer@example.org')).toBe(403);
    const again = await a.call<{ id: string }>('POST', '/api/admin/invites', { email: 'newcomer@example.org' });
    expect(again.status).toBe(201);
    expect(await new Client().signIn('newcomer@example.org')).toBe(200);
    expect((await a.call('POST', '/api/admin/invites', { email: 'newcomer@example.org' })).status).toBe(409);
  });

  it('deletes a user on approval: sole-owner accounts and trees go, shared accounts stay', async () => {
    const a = await adminClient();
    await invite('leaver@example.org');
    const u = new Client();
    await u.signIn('leaver@example.org');
    const acc = await u.call<{ id: string }>('POST', '/api/accounts', { name: 'Famille Test' });
    const accountId = acc.body.id;
    const tree = await u.call<{ id: string }>('POST', '/api/trees', {
      accountId,
      name: 'Arbre',
      gedcom: '0 HEAD\n1 GEDC\n2 VERS 5.5.1\n0 @I1@ INDI\n1 NAME A /B/\n0 TRLR',
    });
    expect(tree.status).toBe(201);
    expect((await u.call('POST', '/api/auth/deletion-request', { note: 'merci' })).status).toBe(200);
    const me = await u.call<{ user: { deletionRequestedAt: number | null } }>('GET', '/api/auth/me');
    expect(me.body.user.deletionRequestedAt).not.toBeNull();
    const users = await a.call<{ users: Array<{ email: string; deletion_note: string | null }> }>('GET', '/api/admin/overview');
    expect(users.body.users.find((x) => x.email === 'leaver@example.org')?.deletion_note).toBe('merci');
    const leaverId = (await a.call<{ users: Array<{ id: string; email: string }> }>('GET', '/api/admin/overview')).body.users.find(
      (x) => x.email === 'leaver@example.org',
    )!.id;
    const approved = await a.call<{ accountsDeleted: number }>('POST', `/api/admin/deletions/${leaverId}/approve`);
    expect(approved.status).toBe(200);
    expect(approved.body.accountsDeleted).toBe(1);
    // Gone: the session, the user, the account and its tree.
    expect((await u.call<{ user: unknown }>('GET', '/api/auth/me')).body.user).toBeNull();
    expect(await new Client().signIn('leaver@example.org')).toBe(403);
    expect((await a.call('GET', `/api/trees/${tree.body.id}`)).status).toBe(404);
  });
});

describe('access requests', () => {
  it('records a request from anyone, tells nothing back, and the admin can turn it into an invitation', async () => {
    const c = new Client();
    expect((await c.call('POST', '/api/auth/access-request', { email: 'Hopeful@Example.org', message: 'cousin de Yoann' })).status).toBe(
      200,
    );
    // Still no way in.
    expect(await new Client().signIn('hopeful@example.org')).toBe(403);
    const a = await adminClient();
    const ov = await a.call<{ requests: Array<{ id: string; email: string; message: string | null }> }>('GET', '/api/admin/overview');
    const req = ov.body.requests.find((r) => r.email === 'hopeful@example.org');
    expect(req?.message).toBe('cousin de Yoann');
    expect((await a.call('POST', `/api/admin/access-requests/${req!.id}/invite`, {})).status).toBe(201);
    expect(await new Client().signIn('hopeful@example.org')).toBe(200);
    const after = await a.call<{ requests: Array<{ email: string }> }>('GET', '/api/admin/overview');
    expect(after.body.requests.some((r) => r.email === 'hopeful@example.org')).toBe(false);
  });

  it('stops one caller flooding the operator with mail by varying the address', async () => {
    // The per-address freshness check does nothing here: every request names a new address, and
    // each one both writes a row and mails the operator. Only the per-client limit stops it.
    const c = new Client();
    const codes: number[] = [];
    for (let i = 0; i < 7; i++)
      codes.push((await c.call('POST', '/api/auth/access-request', { email: `flood${i}@example.org`, message: 'x' })).status);
    expect(codes.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(codes.slice(5)).toEqual([429, 429]);
    const rows = await env.DB.prepare(`SELECT COUNT(*) AS n FROM access_requests WHERE email LIKE 'flood%'`).first<{ n: number }>();
    expect(rows?.n).toBe(5);
  });

  it('moves the administrator role when ADMIN_EMAIL changes rather than handing out a second one', async () => {
    // The flag was only ever set, never cleared, so changing the setting added an administrator
    // and the old one kept the role for good.
    const a = await adminClient();
    const meBefore = await a.call<{ user: { id: string; isAdmin: boolean } }>('GET', '/api/auth/me');
    expect(meBefore.body.user.isAdmin).toBe(true);
    await invite('successor@example.org');
    const successor = new Client();
    expect(await successor.signIn('successor@example.org')).toBe(200);
    expect((await successor.call<{ user: { isAdmin: boolean } }>('GET', '/api/auth/me')).body.user.isAdmin).toBe(false);
    // The operator changes the setting and the new administrator signs in.
    const asSuccessor = new Client();
    await env.DB.prepare(`DELETE FROM magic_links WHERE email = ?`).bind('successor@example.org').run();
    const r = await asSuccessor.call<{ code?: string }>('POST', '/api/auth/request', { email: 'successor@example.org' });
    const verified = await app.request(
      'http://localhost/api/auth/code',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
          Cookie: asSuccessor.cookie,
          'cf-connecting-ip': asSuccessor.ip,
        },
        body: JSON.stringify({ email: 'successor@example.org', code: r.body.code }),
      },
      { ...env, ADMIN_EMAIL: 'successor@example.org' } as never,
    );
    expect(verified.status).toBe(200);
    const flags = await env.DB.prepare(`SELECT email, is_admin FROM users WHERE email IN (?, ?)`)
      .bind('admin@example.org', 'successor@example.org')
      .all<{ email: string; is_admin: number }>();
    expect(flags.results.find((u) => u.email === 'successor@example.org')?.is_admin).toBe(1);
    expect(flags.results.find((u) => u.email === 'admin@example.org')?.is_admin).toBe(0);
    // Put it back, so the shared administrator session the other files use still works.
    await env.DB.prepare(`UPDATE users SET is_admin = 1 WHERE email = ?`).bind('admin@example.org').run();
    await env.DB.prepare(`UPDATE users SET is_admin = 0 WHERE email = ?`).bind('successor@example.org').run();
  });

  it('keeps control characters out of the fields that end up in a mail subject', async () => {
    await invite('control@example.org');
    const c = new Client();
    expect(await c.signIn('control@example.org')).toBe(200);
    const named = await c.call<{ user: { name: string } }>('PATCH', '/api/auth/me', {
      name: 'Bob\r\nBcc: victim@example.org\u0000',
    });
    expect(named.body.user.name).toBe('Bob Bcc: victim@example.org');
    expect([...named.body.user.name].every((ch) => ch >= ' ')).toBe(true);
    // An account name reaches a subject too — « rejoindre "X" ».
    const acc = await c.call<{ name: string }>('POST', '/api/accounts', { name: 'Famille\nDupont' });
    expect(acc.body.name).toBe('Famille Dupont');
    // A multi-line field keeps its newlines and loses everything else.
    expect((await c.call('POST', '/api/auth/deletion-request', { note: 'ligne un\nligne deux\u0007' })).status).toBe(200);
    const note = await env.DB.prepare(`SELECT note FROM deletion_requests d JOIN users u ON u.id = d.user_id WHERE u.email = ?`)
      .bind('control@example.org')
      .first<{ note: string }>();
    expect(note?.note).toBe('ligne un\nligne deux');
  });
});
