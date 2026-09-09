import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { codeHash, SESSION_IDLE_MS } from './auth';
import { app } from './index';
import { sha256 } from './util';
import { Client, invite } from './test/helpers';

describe('sessions', () => {
  it('closes every session of the person on « sign out everywhere »', async () => {
    await invite('multi@example.org');
    const phone = new Client();
    expect(await phone.signIn('multi@example.org')).toBe(200);
    const laptop = new Client();
    expect(await laptop.signIn('multi@example.org')).toBe(200);
    const r = await laptop.call<{ ok: boolean; closed: number }>('POST', '/api/auth/logout-all', {});
    expect(r.status).toBe(200);
    expect(r.body.closed).toBe(2);
    expect(laptop.jar.has('ramure_session')).toBe(false);
    const me = await phone.call<{ user: unknown }>('GET', '/api/auth/me');
    expect(me.body.user).toBeNull();
  });

  it('ends a session nobody used for a month, and records use at most hourly', async () => {
    await invite('idle@example.org');
    const c = new Client();
    expect(await c.signIn('idle@example.org')).toBe(200);
    const { results } = await env.DB.prepare(`SELECT s.id_hash FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.email = ?`)
      .bind('idle@example.org')
      .all<{ id_hash: string }>();
    const hash = results[0]!.id_hash;
    // Two hours ago: still valid, and this request refreshes the mark.
    await env.DB.prepare(`UPDATE sessions SET last_seen_at = ? WHERE id_hash = ?`)
      .bind(Date.now() - 2 * 3600_000, hash)
      .run();
    expect((await c.call<{ user: unknown }>('GET', '/api/auth/me')).body.user).not.toBeNull();
    const seen = await env.DB.prepare(`SELECT last_seen_at FROM sessions WHERE id_hash = ?`).bind(hash).first<{ last_seen_at: number }>();
    expect(Date.now() - seen!.last_seen_at).toBeLessThan(60_000);
    // Beyond the idle limit: over, and gone from the table.
    await env.DB.prepare(`UPDATE sessions SET last_seen_at = ? WHERE id_hash = ?`)
      .bind(Date.now() - SESSION_IDLE_MS - 1000, hash)
      .run();
    expect((await c.call<{ user: unknown }>('GET', '/api/auth/me')).body.user).toBeNull();
    expect(await env.DB.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE id_hash = ?`).bind(hash).first<{ n: number }>()).toMatchObject({
      n: 0,
    });
  });

  it('keys the code hash with the pepper when one is configured', async () => {
    const plain = await codeHash({ ...env, CODE_PEPPER: undefined }, 'a@example.org', '123456');
    const peppered = await codeHash({ ...env, CODE_PEPPER: 'secret' }, 'a@example.org', '123456');
    const other = await codeHash({ ...env, CODE_PEPPER: 'other' }, 'a@example.org', '123456');
    expect(plain).toHaveLength(64);
    expect(peppered).not.toBe(plain);
    expect(other).not.toBe(peppered);
  });
});

describe('members roster', () => {
  it('shows addresses to owners and masks them for everyone else', async () => {
    await invite('owner2@example.org');
    const owner = new Client();
    expect(await owner.signIn('owner2@example.org')).toBe(200);
    const acc = await owner.call<{ id: string }>('POST', '/api/accounts', { name: 'Masque' });
    const inv = await owner.call<{ link: string }>('POST', `/api/accounts/${acc.body.id}/invites`, {
      email: 'viewer2@example.org',
      role: 'viewer',
    });
    await invite('viewer2@example.org');
    const viewer = new Client();
    expect(await viewer.signIn('viewer2@example.org')).toBe(200);
    const token = decodeURIComponent(inv.body.link.split('#invite=')[1]!);
    expect((await viewer.call('POST', '/api/invites/accept', { token })).status).toBe(200);
    const forOwner = await owner.call<{ members: Array<{ email: string }> }>('GET', `/api/accounts/${acc.body.id}/members`);
    expect(forOwner.body.members.map((m) => m.email).sort()).toEqual(['owner2@example.org', 'viewer2@example.org']);
    const forViewer = await viewer.call<{ members: Array<{ email: string }> }>('GET', `/api/accounts/${acc.body.id}/members`);
    expect(forViewer.body.members.map((m) => m.email).sort()).toEqual(['o***@example.org', 'viewer2@example.org']);
  });
});

describe('the session cookie carries the __Host- prefix where the browser will take it', () => {
  /** An https deployment, which is the only place the prefix is valid. */
  const https = () => ({ ...env, APP_ORIGIN: 'https://ramure.example' });

  const post = (path: string, body: unknown, cookie: string, envOverride: Record<string, unknown>) =>
    app.request(
      `https://ramure.example${path}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://ramure.example',
          Cookie: cookie,
          'cf-connecting-ip': '198.51.100.7',
        },
        body: JSON.stringify(body),
      },
      envOverride as never,
    );

  it('sets the prefixed name with Secure on an https origin, reading the old signin cookie on the way', async () => {
    await invite('prefix@example.org');
    // Mail cannot be sent in a test and echo mode is localhost-only, so the link is planted the way
    // the request route would have: this exercises openSession under https, which is the point.
    const token = 'prefix-token-abcdefghijklmnop';
    const nonce = 'prefix-nonce-abcdefghijklmnop';
    await env.DB.prepare(`INSERT INTO magic_links (token_hash, email, expires_at, browser_hash) VALUES (?, ?, ?, ?)`)
      .bind(await sha256(token), 'prefix@example.org', Date.now() + 600_000, await sha256(nonce))
      .run();
    // The browser presents the *old* signin cookie name, as one mid-sign-in at deploy time would.
    const res = await post('/api/auth/verify', { token }, `ramure_signin=${nonce}`, https());
    expect(res.status).toBe(200);
    const setCookies = res.headers.getSetCookie().join('\n');
    expect(setCookies).toMatch(/__Host-ramure_session=/);
    expect(setCookies).toMatch(/Secure/);
    expect(setCookies).toMatch(/HttpOnly/);
    expect(setCookies).toMatch(/Path=\//);
    // A __Host- cookie must carry no Domain, or the browser refuses it.
    expect(setCookies).not.toMatch(/Domain=/i);
    // The unprefixed name is never written again.
    expect(setCookies).not.toMatch(/(^|\n)ramure_session=/);
  });

  it('still accepts a session opened before the rename, so nobody is signed out', async () => {
    await invite('legacy@example.org');
    const c = new Client();
    expect(await c.signIn('legacy@example.org')).toBe(200);
    const session = c.jar.get('ramure_session')!;
    // Same session, now reaching an https deployment under the old cookie name.
    const me = await app.request(
      'https://ramure.example/api/auth/me',
      { headers: { Cookie: `ramure_session=${session}`, 'cf-connecting-ip': '198.51.100.8' } },
      https() as never,
    );
    expect(me.status).toBe(200);
    expect((await me.json<{ user: { email: string } | null }>()).user?.email).toBe('legacy@example.org');
  });
});
