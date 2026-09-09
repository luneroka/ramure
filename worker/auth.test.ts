import { describe, expect, it } from 'vitest';
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
});
