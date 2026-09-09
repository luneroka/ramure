import { describe, expect, it } from 'vitest';
import { Client, invite } from './test/helpers';

async function owner(email: string): Promise<{ c: Client; accountId: string }> {
  await invite(email);
  const c = new Client();
  expect(await c.signIn(email)).toBe(200);
  const acc = await c.call<{ id: string }>('POST', '/api/accounts', { name: 'Vernay' });
  return { c, accountId: acc.body.id };
}

describe('invitations by an account owner', () => {
  it('opens the door for the invited address, which joins with the mailed link and nobody else can use', async () => {
    const { c, accountId } = await owner('owner-inv@example.org');
    const r = await c.call<{ email: string; role: string; link?: string }>('POST', `/api/accounts/${accountId}/invites`, {
      email: 'Cousin@Example.org',
      role: 'member',
    });
    expect(r.status).toBe(201);
    expect(r.body.email).toBe('cousin@example.org');
    expect(r.body.link).toMatch(/#invite=/);
    const token = decodeURIComponent(r.body.link!.split('#invite=')[1]!);
    // The invitation alone lets the cousin sign in: no invitation from the application administrator.
    const cousin = new Client();
    expect(await cousin.signIn('cousin@example.org')).toBe(200);
    const info = await cousin.call<{ accountName: string; email: string }>('POST', '/api/invites/info', { token });
    expect(info.body).toMatchObject({ accountName: 'Vernay', email: 'cousin@example.org' });
    // Someone else holding the link is refused.
    await invite('intruder@example.org');
    const intruder = new Client();
    expect(await intruder.signIn('intruder@example.org')).toBe(200);
    expect((await intruder.call('POST', '/api/invites/accept', { token })).status).toBe(403);
    // The cousin joins; the invitation is spent and leaves the list.
    expect((await cousin.call('POST', '/api/invites/accept', { token })).status).toBe(200);
    const list = await c.call<{ invites: Array<{ email: string }> }>('GET', `/api/accounts/${accountId}/invites`);
    expect(list.body.invites.find((i) => i.email === 'cousin@example.org')).toBeUndefined();
    const members = await c.call<{ members: Array<{ email: string; role: string }> }>('GET', `/api/accounts/${accountId}/members`);
    expect(members.body.members.find((m) => m.email === 'cousin@example.org')?.role).toBe('member');
    // Inviting a member again is refused.
    expect((await c.call('POST', `/api/accounts/${accountId}/invites`, { email: 'cousin@example.org' })).status).toBe(409);
  });

  it('closes the door again when the owner revokes the invitation before it is used', async () => {
    const { c, accountId } = await owner('owner-rev@example.org');
    const r = await c.call<{ id: string }>('POST', `/api/accounts/${accountId}/invites`, { email: 'late@example.org', role: 'viewer' });
    expect(r.status).toBe(201);
    expect((await c.call('DELETE', `/api/accounts/${accountId}/invites/${r.body.id}`)).status).toBe(200);
    const late = new Client();
    expect(await late.signIn('late@example.org')).toBe(403);
  });
});
