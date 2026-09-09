/**
 * What the browser reports when it breaks: a message, a stack, the app
 * version and the page. Enough to fix a bug, too little to identify a
 * person beyond the signed-in account (when there is one).
 *
 * **This route is unauthenticated on purpose, and should stay that way.** The
 * reports worth having most come from a browser that broke before or during
 * sign-in — a boot failure, a bad service-worker update, a crash on the login
 * screen — and there is no session to check at that moment. Requiring one
 * would blind the operator to exactly the class of bug that leaves somebody
 * unable to get in. Nothing here is worth stealing either: it is write-only,
 * reads back to an administrator alone, and is purged after thirty days.
 *
 * What that costs is two guards that would otherwise be the client's job. The
 * URL fragment is stripped here as well as in the browser, because a sign-in
 * token lives in the fragment and a browser is not the only thing that can
 * post to this route. And the per-client limit is paired with an overall one,
 * because 20 per quarter hour per address means nothing across many addresses.
 */

import { Hono } from 'hono';
import type { Env, Vars } from './env';
import { clientIp, hit } from './ratelimit';
import { HttpError, now, randomId, readJson } from './util';

const WINDOW_MS = 15 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 20;
const MAX_OVERALL_PER_HOUR = 200;
export const KEEP_ERRORS_MS = 30 * 24 * 60 * 60 * 1000;

const clip = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.slice(0, max) : null);

/** The page, without its fragment: a sign-in token travels there and must not be stored. */
const clipUrl = (v: unknown, max: number): string | null => {
  const raw = clip(v, max * 4);
  return raw === null ? null : (clip(raw.replace(/#.*$/s, '#…'), max) ?? null);
};

export const errors = new Hono<{ Bindings: Env; Variables: Vars }>();

errors.post('/', async (c) => {
  await hit(c.env, `errors:${clientIp(c.req.raw)}`, MAX_PER_WINDOW, WINDOW_MS);
  await hit(c.env, 'errors:all', MAX_OVERALL_PER_HOUR, HOUR_MS);
  const body = await readJson<{ kind?: unknown; message?: unknown; stack?: unknown; url?: unknown; version?: unknown }>(c.req.raw, 16_384);
  const message = clip(body.message, 500);
  if (!message) throw new HttpError(400, 'message_required');
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
      clipUrl(body.url, 300),
      clip(c.req.header('user-agent'), 200),
    )
    .run();
  return c.json({ ok: true }, 201);
});
