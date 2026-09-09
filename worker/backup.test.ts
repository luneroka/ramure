import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { backup, backupKey, BACKUP_PREFIX, KEEP_BACKUPS_MS } from './backup';
import { adminClient, Client, invite } from './test/helpers';

async function ownTree(email: string): Promise<{ c: Client; treeId: string }> {
  await invite(email);
  const c = new Client();
  await c.signIn(email);
  const acc = await c.call<{ id: string }>('POST', '/api/accounts', { name: 'B' });
  const tree = await c.call<{ id: string }>('POST', '/api/trees', {
    accountId: acc.body.id,
    name: 'Sauvegardé',
    gedcom: '0 HEAD\n1 GEDC\n2 VERS 5.5.1\n0 @I1@ INDI\n1 NAME Anne /B/\n0 TRLR',
  });
  return { c, treeId: tree.body.id };
}

describe('nightly backups', () => {
  it('writes one copy per day when the tree changed, keeps the newest, drops old ones', async () => {
    const { treeId } = await ownTree('backup1@example.org');
    const first = await backup(env);
    expect(first.written).toBeGreaterThanOrEqual(1);
    const today = await env.MEDIA.get(backupKey(treeId, Date.now()));
    expect(await today?.text()).toContain('Anne /B/');
    const latest = await env.MEDIA.head(`${BACKUP_PREFIX}${treeId}/latest`);
    expect(latest?.customMetadata?.version).toBe('0');
    // Nothing changed: nothing written for this tree.
    const again = await backup(env);
    expect(again.skipped).toBeGreaterThanOrEqual(1);
    // An old copy past the keep goes; today's stays.
    await env.MEDIA.put(`${BACKUP_PREFIX}${treeId}/2020-01-01.ged`, 'old');
    const later = await backup(env, Date.now() + 1000);
    expect(later.deleted).toBeGreaterThanOrEqual(1);
    expect(await env.MEDIA.head(`${BACKUP_PREFIX}${treeId}/2020-01-01.ged`)).toBeNull();
    expect(await env.MEDIA.head(backupKey(treeId, Date.now()))).not.toBeNull();
  });

  it('keeps the copies of a deleted tree for the season, then removes them', async () => {
    const { c, treeId } = await ownTree('backup2@example.org');
    await backup(env);
    expect((await c.call('DELETE', `/api/trees/${treeId}`)).status).toBe(200);
    await backup(env);
    expect(await env.MEDIA.head(`${BACKUP_PREFIX}${treeId}/latest`)).not.toBeNull();
    await backup(env, Date.now() + KEEP_BACKUPS_MS + 2 * 86400_000);
    expect(await env.MEDIA.head(`${BACKUP_PREFIX}${treeId}/latest`)).toBeNull();
  });

  it('lets the administrator list and download copies, nobody else', async () => {
    const { c, treeId } = await ownTree('backup3@example.org');
    await backup(env);
    expect((await c.call('GET', `/api/admin/backups/${treeId}`)).status).toBe(403);
    const admin = await adminClient();
    const list = await admin.call<{ backups: Array<{ day: string; size: number }> }>('GET', `/api/admin/backups/${treeId}`);
    expect(list.status).toBe(200);
    expect(list.body.backups).toHaveLength(1);
    const day = list.body.backups[0]!.day;
    const file = await admin.call<{ raw: string }>('GET', `/api/admin/backups/${treeId}/${day}`);
    expect(file.status).toBe(200);
    expect(file.body.raw).toContain('Anne /B/');
  });
});
