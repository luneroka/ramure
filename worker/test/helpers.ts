/** Drive the Hono app in-process: JSON calls with a cookie jar, and a sign-in that goes through the real code path. */

import { env } from 'cloudflare:test';
import { app } from '../index';

export class Client {
  /** A small cookie jar: several cookies, replaced by name, dropped when expired by the server. */
  jar = new Map<string, string>();
  /** Each client is its own address, so the per-address limits never leak between tests. */
  ip = `203.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  get cookie(): string {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async call<T = Record<string, unknown>>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T }> {
    const res = await app.request(
      `http://localhost${path}`,
      {
        method,
        headers: {
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(this.cookie ? { Cookie: this.cookie } : {}),
          Origin: 'http://localhost',
          'cf-connecting-ip': this.ip,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      },
      env,
    );
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(';');
      const [name, value] = pair!.split('=');
      const gone = attrs.some((a: string) => /max-age=0/i.test(a.trim()));
      if (gone || !value) this.jar.delete(name!.trim());
      else this.jar.set(name!.trim(), value);
    }
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { raw: text };
    }
    return { status: res.status, body: parsed as T };
  }

  /** Request a code (echoed in test) and use it. Returns the /request status when it is refused. */
  async signIn(email: string): Promise<number> {
    const r = await this.call<{ code?: string }>('POST', '/api/auth/request', { email });
    if (r.status !== 200 || !r.body.code) return r.status;
    const v = await this.call('POST', '/api/auth/code', { email, code: r.body.code });
    return v.status;
  }
}

/**
 * One administrator session per test file, opened through the real sign-in path.
 *
 * The module state resets with each file, so every file that needs the
 * administrator signs in again — and an address may only request three sign-in
 * mails per quarter hour, which three files hit exactly. The suite therefore
 * sat on the boundary and went red whenever ordering or a retry tipped it over.
 * Clearing this address's live links first removes the coupling without
 * bypassing the sign-in this helper exists to exercise.
 */
let adminSession: Client | null = null;
export async function adminClient(): Promise<Client> {
  if (adminSession) {
    const me = await adminSession.call<{ user: unknown }>('GET', '/api/auth/me');
    if (me.body.user) return adminSession;
  }
  await invite('admin@example.org');
  await env.DB.prepare(`DELETE FROM magic_links WHERE email = ?`).bind('admin@example.org').run();
  const c = new Client();
  const status = await c.signIn('admin@example.org');
  if (status !== 200) throw new Error(`admin sign-in failed: ${status}`);
  adminSession = c;
  return c;
}

/** Let an address in directly, the way the admin's invitation does, without going through mail. */
export async function invite(email: string): Promise<void> {
  await env.DB.prepare(`INSERT INTO app_invites (id, email, created_by, created_at, expires_at) VALUES (?, ?, 'test', ?, ?)`)
    .bind(`V${Math.random().toString(36).slice(2, 10)}`, email, Date.now(), Date.now() + 86400000)
    .run();
}
