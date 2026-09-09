import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { app } from './index';
import { KEEP_AUTO_SNAPSHOTS, MEDIA_GRACE_MS, reap } from './maintenance';
import { Client, invite } from './test/helpers';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1]);

async function treeWithFile(email: string, mediaId: string, referenced: boolean) {
  await invite(email);
  const c = new Client();
  await c.signIn(email);
  const acc = await c.call<{ id: string }>('POST', '/api/accounts', { name: 'F' });
  const obje = referenced ? `\n0 @${mediaId}@ OBJE\n1 FILE ramure:${mediaId}\n2 FORM png\n1 _KIND photo` : '';
  const tree = await c.call<{ id: string }>('POST', '/api/trees', {
    accountId: acc.body.id,
    name: 'T',
    gedcom: `0 HEAD\n1 GEDC\n2 VERS 5.5.1\n0 @I1@ INDI\n1 NAME A /B/${referenced ? `\n1 OBJE @${mediaId}@` : ''}${obje}\n0 TRLR`,
  });
  const put = await app.request(
    `http://localhost/api/trees/${tree.body.id}/media/${mediaId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png', Cookie: c.cookie, Origin: 'http://localhost', 'cf-connecting-ip': c.ip },
      body: PNG,
    },
    env,
  );
  expect(put.status).toBe(200);
  return { c, treeId: tree.body.id };
}

describe('nightly maintenance', () => {
  it('keeps a deleted file until the grace passes, then removes it; a referenced file is never taken', async () => {
    const { c, treeId } = await treeWithFile('reap1@example.org', 'Mkeep', true);
    const other = await treeWithFile('reap2@example.org', 'Mgone', false);
    // Delete both through the API: marked, still served.
    expect((await c.call('DELETE', `/api/trees/${treeId}/media/Mkeep`)).status).toBe(200);
    expect((await other.c.call('DELETE', `/api/trees/${other.treeId}/media/Mgone`)).status).toBe(200);
    expect((await app.request(`http://localhost/api/trees/${treeId}/media/Mkeep`, { headers: { Cookie: c.cookie } }, env)).status).toBe(
      200,
    );
    // Tonight: nothing is old enough.
    const tonight = await reap(env);
    expect(tonight.filesDeleted).toBe(0);
    // A month later: the unreferenced one goes, the referenced one is unmarked and stays.
    // Storage is shared across test files: other unreferenced uploads may go too; ours are what we check.
    const later = await reap(env, Date.now() + MEDIA_GRACE_MS + 1000);
    expect(later.filesDeleted).toBeGreaterThanOrEqual(1);
    expect(
      (await app.request(`http://localhost/api/trees/${other.treeId}/media/Mgone`, { headers: { Cookie: other.c.cookie } }, env)).status,
    ).toBe(404);
    expect((await app.request(`http://localhost/api/trees/${treeId}/media/Mkeep`, { headers: { Cookie: c.cookie } }, env)).status).toBe(
      200,
    );
    const row = await env.DB.prepare(`SELECT deleted_at FROM media WHERE id = 'Mkeep'`).first<{ deleted_at: number | null }>();
    expect(row?.deleted_at).toBeNull();
  });

  it('keeps only the last automatic snapshots and named versions', async () => {
    const { treeId } = await treeWithFile('reap3@example.org', 'Msnap', false);
    for (let i = 0; i < KEEP_AUTO_SNAPSHOTS + 5; i++)
      await env.DB.prepare(`INSERT INTO tree_snapshots (id, tree_id, version, doc, created_at, label) VALUES (?, ?, ?, 'x', ?, NULL)`)
        .bind(`S${i}`, treeId, i, Date.now() - i)
        .run();
    await env.DB.prepare(
      `INSERT INTO tree_snapshots (id, tree_id, version, doc, created_at, label, created_by) VALUES ('Snamed', ?, 1, 'x', ?, 'Avant Noël', 'u')`,
    )
      .bind(treeId, Date.now())
      .run();
    const r = await reap(env);
    expect(r.snapshotsDeleted).toBe(5);
    const left = await env.DB.prepare(`SELECT COUNT(*) AS n FROM tree_snapshots WHERE tree_id = ?`).bind(treeId).first<{ n: number }>();
    expect(left?.n).toBe(KEEP_AUTO_SNAPSHOTS + 1);
  });
});
