/**
 * Ramure API on Cloudflare Workers. The same Worker serves the built app
 * (static assets) and /api/*.
 */

import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { auth, SESSION_COOKIE, userFromRequest } from './auth';
import type { Env, Vars } from './env';
import { accounts, invites } from './accounts';
import { trees } from './trees';
import { HttpError } from './util';

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

app.use('/api/*', async (c, next) => {
  c.set('user', await userFromRequest(c.env, getCookie(c, SESSION_COOKIE)));
  // Same-origin only: the app and the API share a host, so cross-site requests are refused.
  const origin = c.req.header('origin');
  if (origin && c.req.method !== 'GET' && origin !== c.env.APP_ORIGIN && origin !== new URL(c.req.url).origin)
    throw new HttpError(403, 'cross-site request');
  await next();
});

app.get('/api/health', (c) => c.json({ ok: true, ts: Date.now() }));
app.route('/api/auth', auth);
app.route('/api/accounts', accounts);
app.route('/api/trees', trees);
app.route('/api/invites', invites);

app.notFound((c) => c.json({ error: 'not found' }, 404));
app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message, ...(err.extra ?? {}) }, err.status as 400);
  console.error(err);
  return c.json({ error: 'server error' }, 500);
});

export default app;
