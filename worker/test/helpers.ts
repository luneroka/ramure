/** Drive the Hono app in-process: JSON calls with a cookie jar, and a sign-in that goes through the real code path. */

import { env } from 'cloudflare:test';
import app from '../index';

export class Client {
  cookie = '';

  async call<T = Record<string, unknown>>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T }> {
    const res = await app.request(
      `http://localhost${path}`,
      {
        method,
        headers: {
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(this.cookie ? { Cookie: this.cookie } : {}),
          Origin: 'http://localhost',
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      },
      env,
    );
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0]!;
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

/** Let an address in directly, the way the admin's invitation does, without going through mail. */
export async function invite(email: string): Promise<void> {
  await env.DB.prepare(`INSERT INTO app_invites (id, email, created_by, created_at, expires_at) VALUES (?, ?, 'test', ?, ?)`)
    .bind(`V${Math.random().toString(36).slice(2, 10)}`, email, Date.now(), Date.now() + 86400000)
    .run();
}
