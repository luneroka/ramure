/**
 * Ramure API on Cloudflare Workers. The same Worker serves the built app
 * (static assets) and /api/*.
 */

import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { secureHeaders } from 'hono/secure-headers';
import { auth, SESSION_COOKIE, userFromRequest } from './auth';
import type { Env, Vars } from './env';
import { accounts, invites } from './accounts';
import { trees } from './trees';
import { admin } from './admin';
import { backup } from './backup';
import { errors } from './errors';
import { reap } from './maintenance';
import { configProblems, logConfigProblems } from './config';
import { HttpError } from './util';

/** The Hono app itself, for tests that drive it in-process. */
export const app = new Hono<{ Bindings: Env; Variables: Vars }>();

app.use('/api/*', secureHeaders({ crossOriginResourcePolicy: 'same-origin', referrerPolicy: 'strict-origin-when-cross-origin' }));
app.use('/api/*', async (c, next) => {
  // A misconfigured deployment says so in the logs on its first request, rather than
  // waiting for someone to notice that mail never arrives.
  logConfigProblems(c.env);
  // Same-origin only, checked before anything costs a query: the app and the API share a host.
  const origin = c.req.header('origin');
  if (origin && c.req.method !== 'GET' && origin !== c.env.APP_ORIGIN && origin !== new URL(c.req.url).origin)
    throw new HttpError(403, 'cross-site request');
  c.set('user', await userFromRequest(c.env, getCookie(c, SESSION_COOKIE)));
  await next();
});

/**
 * Liveness, plus a one-word verdict on this deployment's configuration so a
 * deploy can be checked from outside. Only the verdict: the settings at fault
 * are named on the administration page, never to anonymous callers.
 */
app.get('/api/health', (c) => {
  const problems = configProblems(c.env);
  const config = problems.some((p) => p.severity === 'fatal') ? 'misconfigured' : problems.length ? 'degraded' : 'ok';
  return c.json({ ok: true, ts: Date.now(), config });
});
app.route('/api/auth', auth);
app.route('/api/accounts', accounts);
app.route('/api/trees', trees);
app.route('/api/invites', invites);
app.route('/api/admin', admin);
app.route('/api/errors', errors);

app.notFound((c) => c.json({ error: 'not found' }, 404));
app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message, ...(err.extra ?? {}) }, err.status as 400);
  console.error(err);
  return c.json({ error: 'server error' }, 500);
});

export default {
  fetch: app.fetch,
  /** The nightly cron from wrangler.toml. */
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(backup(env).then(() => reap(env)));
  },
};
