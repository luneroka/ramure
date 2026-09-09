import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { app } from './index';
import { Client, invite } from './test/helpers';

describe('sign-in bound to the browser that asked', () => {
  it('mails a fragment link; the app posts it from the same browser and gets a session', async () => {
    await invite('link@example.org');
    const c = new Client();
    const r = await c.call<{ link: string }>('POST', '/api/auth/request', { email: 'link@example.org' });
    expect(r.status).toBe(200);
    expect(r.body.link).toMatch(/^http:\/\/localhost\/#signin=/);
    expect(c.jar.has('ramure_signin')).toBe(true);
    const token = decodeURIComponent(r.body.link.split('#signin=')[1]!);
    // Opening the page does nothing by itself: only the POST signs in.
    expect((await c.call('GET', '/api/auth/me')).body).toEqual({ user: null });
    expect((await c.call('POST', '/api/auth/verify', { token })).status).toBe(200);
    expect(c.jar.has('ramure_session')).toBe(true);
    expect(c.jar.has('ramure_signin')).toBe(false);
    expect((await c.call<{ user: { email: string } }>('GET', '/api/auth/me')).body.user.email).toBe('link@example.org');
    // Single use.
    expect((await c.call('POST', '/api/auth/verify', { token })).status).toBe(400);
  });

  it('refuses the link and the code from a browser that did not ask', async () => {
    await invite('bound@example.org');
    const asker = new Client();
    const r = await asker.call<{ link: string; code: string }>('POST', '/api/auth/request', { email: 'bound@example.org' });
    const token = decodeURIComponent(r.body.link.split('#signin=')[1]!);
    const other = new Client();
    expect((await other.call('POST', '/api/auth/verify', { token })).status).toBe(403);
    expect((await other.call('POST', '/api/auth/code', { email: 'bound@example.org', code: r.body.code })).status).toBe(403);
    // The asker still can, with the code.
    expect((await asker.call('POST', '/api/auth/code', { email: 'bound@example.org', code: r.body.code })).status).toBe(200);
  });

  it('sends an old-style link into the fragment flow', async () => {
    const res = await app.request('http://localhost/api/auth/verify?token=abc', {}, env);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('http://localhost/#signin=abc');
  });

  it('locks an address after ten wrong codes, across new requests', async () => {
    await invite('lock@example.org');
    const c = new Client();
    await c.call('POST', '/api/auth/request', { email: 'lock@example.org' });
    for (let i = 0; i < 5; i++)
      expect((await c.call('POST', '/api/auth/code', { email: 'lock@example.org', code: '111111' })).status).toBe(400);
    // A fresh link does not reset the count.
    await c.call('POST', '/api/auth/request', { email: 'lock@example.org' });
    for (let i = 0; i < 5; i++)
      expect((await c.call('POST', '/api/auth/code', { email: 'lock@example.org', code: '222222' })).status).toBe(400);
    expect((await c.call('POST', '/api/auth/code', { email: 'lock@example.org', code: '333333' })).status).toBe(429);
  });

  it('limits sign-in requests per client address', async () => {
    const c = new Client();
    c.ip = '198.51.100.9';
    let last = 0;
    for (let i = 0; i < 21; i++) last = (await c.call('POST', '/api/auth/request', { email: `n${i}@example.org` })).status;
    expect(last).toBe(429);
    const other = new Client();
    other.ip = '198.51.100.10';
    expect((await other.call('POST', '/api/auth/request', { email: 'stranger2@example.org' })).status).toBe(403);
  });
});

describe('family invitations', () => {
  it('carry the token in the fragment and are read and accepted through POST bodies', async () => {
    await invite('host@example.org');
    const host = new Client();
    await host.signIn('host@example.org');
    const acc = await host.call<{ id: string }>('POST', '/api/accounts', { name: 'Hôtes' });
    const inv = await host.call<{ link: string; expiresAt: number }>('POST', `/api/accounts/${acc.body.id}/invites`, { role: 'viewer' });
    expect(inv.body.link).toContain('/#invite=');
    expect(inv.body.expiresAt - Date.now()).toBeLessThanOrEqual(7 * 86400000 + 1000);
    const token = decodeURIComponent(inv.body.link.split('#invite=')[1]!);
    const info = await new Client().call<{ accountName: string; role: string }>('POST', '/api/invites/info', { token });
    expect(info.status).toBe(200);
    expect(info.body).toMatchObject({ accountName: 'Hôtes', role: 'viewer' });
    expect((await app.request(`http://localhost/api/invites/${encodeURIComponent(token)}`, {}, env)).status).toBe(404);
    await invite('guest2@example.org');
    const g = new Client();
    await g.signIn('guest2@example.org');
    expect((await g.call<{ role: string }>('POST', '/api/invites/accept', { token })).body.role).toBe('viewer');
  });
});
