/**
 * What the browser reports when it breaks: a message, a stack, the app
 * version and the page. Enough to fix a bug, too little to identify a
 * person beyond the signed-in account (when there is one).
 */

import { Hono } from 'hono';
import type { Env, Vars } from './env';
import { clientIp, hit } from './ratelimit';
import { HttpError, now, randomId, readJson } from './util';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_WINDOW = 20;
export const KEEP_ERRORS_MS = 30 * 24 * 60 * 60 * 1000;

const clip = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.slice(0, max) : null);

export const errors = new Hono<{ Bindings: Env; Variables: Vars }>();

errors.post('/', async (c) => {
  await hit(c.env, `errors:${clientIp(c.req.raw)}`, MAX_PER_WINDOW, WINDOW_MS);
  const body = await readJson<{ kind?: unknown; message?: unknown; stack?: unknown; url?: unknown; version?: unknown }>(c.req.raw, 16_384);
  const message = clip(body.message, 500);
  if (!message) throw new HttpError(400, 'message required');
  const kind = clip(body.kind, 40) ?? 'error';
  const user = c.get('user');
  await c.env.DB.prepare(
    `INSERT INTO client_errors (id, at, user_id, version, kind, message, stack, url, agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      randomId('E'),
      now(),
      user?.id ?? null,
      clip(body.version, 40),
      kind,
      message,
      clip(body.stack, 4000),
      clip(body.url, 300),
      clip(c.req.header('user-agent'), 200),
    )
    .run();
  return c.json({ ok: true }, 201);
});
