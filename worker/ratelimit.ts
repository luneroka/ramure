/**
 * Fixed-window counters in D1, keyed by what is being protected: enough to
 * stop scripts hammering the sign-in routes without a paid rate-limit product.
 */

import type { Env } from './env';
import { HttpError, now } from './util';

/** Count one hit; throw 429 once `limit` is passed within `windowMs`. */
export async function hit(env: Env, key: string, limit: number, windowMs: number): Promise<void> {
  const t = now();
  const row = await env.DB.prepare(`SELECT window_start, count FROM rate_limits WHERE key = ?`)
    .bind(key)
    .first<{ window_start: number; count: number }>();
  if (!row || t - row.window_start >= windowMs) {
    await env.DB.prepare(`INSERT OR REPLACE INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)`).bind(key, t).run();
    return;
  }
  if (row.count >= limit) throw new HttpError(429, 'too_many_requests');
  await env.DB.prepare(`UPDATE rate_limits SET count = count + 1 WHERE key = ?`).bind(key).run();
}

export function clientIp(req: Request): string {
  return req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}
