/**
 * Who may see a real address, and who sees a masked one.
 *
 * The rule — owners see addresses, everyone else sees « j***@example.org » —
 * was enforced on the member roster and nowhere else, so the snapshot list
 * handed a read-only relative the real address of everyone who had ever saved
 * a version. Both surfaces go through `emailFor` now; these tests are what
 * stops a third one drifting again.
 */

import { describe, expect, it } from 'vitest';
import { Client, invite } from './test/helpers';
import { emailFor, maskEmail } from './util';

/** An owner, a viewer who joined their account, and a tree with a saved version. */
async function family(): Promise<{ owner: Client; viewer: Client; accountId: string; treeId: string }> {
  await invite('chef@example.org');
  await invite('lecteur@example.org');
  const owner = new Client();
  expect(await owner.signIn('chef@example.org')).toBe(200);
  const viewer = new Client();
  expect(await viewer.signIn('lecteur@example.org')).toBe(200);
  const acc = await owner.call<{ id: string }>('POST', '/api/accounts', { name: 'Masque' });
  const inv = await owner.call<{ link?: string }>('POST', `/api/accounts/${acc.body.id}/invites`, {
    email: 'lecteur@example.org',
    role: 'viewer',
  });
  const token = decodeURIComponent(String(inv.body.link ?? '').split('#invite=')[1]!);
  expect((await viewer.call('POST', '/api/invites/accept', { token })).status).toBe(200);
  const tree = await owner.call<{ id: string }>('POST', '/api/trees', { accountId: acc.body.id, name: 'Arbre', gedcom: '' });
  expect((await owner.call('POST', `/api/trees/${tree.body.id}/snapshots`, { label: 'Référence' })).status).toBe(201);
  return { owner, viewer, accountId: acc.body.id, treeId: tree.body.id };
}

describe('addresses are shown only to those who may see them', () => {
  it('masks the version author for a viewer, exactly as the roster does', async () => {
    const { viewer, accountId, treeId } = await family();
    const snapshots = await viewer.call<{ snapshots: Array<{ by: string | null }> }>('GET', `/api/trees/${treeId}/snapshots`);
    expect(snapshots.body.snapshots[0]!.by).toBe('c***@example.org');
    // The same viewer, the same account, the same person: the two surfaces now agree.
    const roster = await viewer.call<{ members: Array<{ email: string }> }>('GET', `/api/accounts/${accountId}/members`);
    expect(roster.body.members.map((m) => m.email).sort()).toEqual(['c***@example.org', 'lecteur@example.org']);
  });

  it('shows the owner the real address, in both places', async () => {
    const { owner, accountId, treeId } = await family();
    const snapshots = await owner.call<{ snapshots: Array<{ by: string | null }> }>('GET', `/api/trees/${treeId}/snapshots`);
    expect(snapshots.body.snapshots[0]!.by).toBe('chef@example.org');
    const roster = await owner.call<{ members: Array<{ email: string }> }>('GET', `/api/accounts/${accountId}/members`);
    expect(roster.body.members.map((m) => m.email).sort()).toEqual(['chef@example.org', 'lecteur@example.org']);
  });

  it('prefers a display name over any address once one is set', async () => {
    const { owner, viewer, treeId } = await family();
    expect((await owner.call('PATCH', '/api/auth/me', { name: 'Chef de famille' })).status).toBe(200);
    await owner.call('POST', `/api/trees/${treeId}/snapshots`, { label: 'Deuxième' });
    const snapshots = await viewer.call<{ snapshots: Array<{ by: string | null }> }>('GET', `/api/trees/${treeId}/snapshots`);
    expect(snapshots.body.snapshots[0]!.by).toBe('Chef de famille');
  });

  it('emailFor: an owner or the person themselves sees it whole, nobody else does', () => {
    expect(emailFor('jean@example.org', { isOwner: true, isSelf: false })).toBe('jean@example.org');
    expect(emailFor('jean@example.org', { isOwner: false, isSelf: true })).toBe('jean@example.org');
    expect(emailFor('jean@example.org', { isOwner: false, isSelf: false })).toBe('j***@example.org');
    expect(maskEmail('jean@example.org')).toBe('j***@example.org');
  });
});
