/**
 * Sign-in by magic link, sessions in D1, cookie on the app's own origin.
 *
 * No passwords anywhere: a person types their email, receives a link valid
 * for 15 minutes, and the link opens a 90-day session. Tokens are stored
 * hashed, so a database leak does not hand out sessions.
 */

import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Env, User, Vars } from './env';
import { cleanText, hmac, HttpError, normaliseEmail, now, randomId, randomToken, readJson, sha256 } from './util';
import { echoMode, sendMail } from './mail';
import { requireCodePepper } from './config';
import { clientIp, hit } from './ratelimit';
import { consumeInvite, isAdmin, mayEnter } from './admin';

export const SESSION_COOKIE = 'ramure_session';
/** Set when a sign-in is requested; the link or code only works from the browser that holds it. */
export const SIGNIN_COOKIE = 'ramure_signin';

/**
 * Cookie names carry the `__Host-` prefix wherever the browser will accept it.
 *
 * `workers.dev` is on the Public Suffix List, which makes `ramure.workers.dev`
 * the registrable domain and every Worker under it — production and staging
 * among them — siblings. A sibling can set a `Domain=ramure.workers.dev`
 * cookie that this origin would then receive. Only our own Workers live there,
 * so this is hardening rather than a hole, but the prefix makes a cookie of
 * this name structurally impossible to set from anywhere but this exact origin.
 *
 * The prefix requires the `Secure` attribute, which is only set on an https
 * origin, so development and the tests keep the plain names. Reads accept
 * either, which is what lets a session opened before this change carry on: the
 * old name is never written again and dies with its ninety-day cookie.
 */
const isSecure = (env: Env): boolean => env.APP_ORIGIN.startsWith('https://');
const cookieName = (env: Env, base: string): string => (isSecure(env) ? `__Host-${base}` : base);

/** The value under either name, prefixed first: during the changeover a browser may hold both. */
function readCookie(c: Context<{ Bindings: Env; Variables: Vars }>, base: string): string | undefined {
  return getCookie(c, `__Host-${base}`) ?? getCookie(c, base);
}

/** The session cookie this request carries, under either name. Used by the middleware in index.ts. */
export function sessionCookie(c: Context<{ Bindings: Env; Variables: Vars }>): string | undefined {
  return readCookie(c, SESSION_COOKIE);
}

/**
 * Clear both names, so signing out cannot leave the other one behind.
 *
 * The prefixed one only where it could have been set: a `__Host-` cookie is
 * invalid without `Secure`, and Hono refuses to write one rather than emitting
 * a header a browser would drop.
 */
function clearCookie(c: Context<{ Bindings: Env; Variables: Vars }>, base: string): void {
  if (isSecure(c.env)) deleteCookie(c, `__Host-${base}`, { path: '/', secure: true });
  deleteCookie(c, base, { path: '/' });
}
const WINDOW_MS = 15 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
/**
 * Asking for access is the only unauthenticated route that makes the app send
 * mail to a fixed address — the operator's. The per-address freshness check
 * below does nothing against a caller varying the address, so the limit is per
 * client and, because a distributed flood would outrun that, overall as well.
 * Nobody legitimately asks for access twice in an hour.
 */
const ACCESS_REQUESTS_PER_IP = 5;
const ACCESS_REQUESTS_OVERALL_PER_HOUR = 50;
const MAX_FAILED_CODES = 10;
const LINK_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
/** A session unused for this long is over, whatever its absolute expiry. */
export const SESSION_IDLE_MS = 30 * 24 * 60 * 60 * 1000;
const TOUCH_EVERY_MS = 60 * 60 * 1000;

export async function userFromRequest(env: Env, cookie: string | undefined): Promise<User | null> {
  if (!cookie) return null;
  const hash = await sha256(cookie);
  const t = now();
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.name, COALESCE(s.last_seen_at, s.created_at) AS seen
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ? AND s.expires_at > ?`,
  )
    .bind(hash, t)
    .first<User & { seen: number }>();
  if (!row) return null;
  if (row.seen < t - SESSION_IDLE_MS) {
    await env.DB.prepare(`DELETE FROM sessions WHERE id_hash = ?`).bind(hash).run();
    return null;
  }
  if (row.seen < t - TOUCH_EVERY_MS) await env.DB.prepare(`UPDATE sessions SET last_seen_at = ? WHERE id_hash = ?`).bind(t, hash).run();
  return { id: row.id, email: row.email, name: row.name };
}

/**
 * The stored form of a sign-in code: keyed by the pepper when the deployment
 * has one. In production it must have one — see `requireCodePepper`, which
 * turns a silently weaker hash into a loud refusal.
 */
export const codeHash = (env: Env, email: string, code: string): Promise<string> => {
  requireCodePepper(env);
  return hmac(env.CODE_PEPPER, `${email}:${code}`);
};

/** Six digits, shown as « 483 921 » in the mail and typed on the sign-in page when a link cannot be opened. */
function randomCode(): string {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return String(n[0]! % 1000000).padStart(6, '0');
}

const pretty = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

async function sendMagicLink(env: Env, requestUrl: string, email: string, link: string, code: string): Promise<void> {
  await sendMail(
    env,
    requestUrl,
    email,
    `${pretty(code)} est votre code de connexion Ramure`,
    [
      'Bonjour,',
      '',
      `Votre code de connexion Ramure : ${pretty(code)}`,
      'Saisissez-le sur la page de connexion, il reste valable 15 minutes.',
      '',
      'Vous pouvez aussi ouvrir ce lien directement :',
      link,
      '',
      "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
    ].join('\n'),
  );
}

/** Find or create the user for this email and open a 90-day session cookie. */
async function openSession(c: Context<{ Bindings: Env; Variables: Vars }>, email: string): Promise<void> {
  let user = await c.env.DB.prepare(`SELECT id, email, name FROM users WHERE email = ?`).bind(email).first<User>();
  if (!user) {
    // A first sign-in needs a live invitation (the request step already checked; a stale link is refused here too).
    if (!(await mayEnter(c.env, email)).allowed) throw new HttpError(403, 'invitation_required');
    user = { id: randomId('U'), email, name: null };
    await c.env.DB.prepare(`INSERT INTO users (id, email, name, created_at, is_admin) VALUES (?, ?, NULL, ?, 0)`)
      .bind(user.id, user.email, now())
      .run();
    await consumeInvite(c.env, email);
  }
  if (c.env.ADMIN_EMAIL && normaliseEmail(c.env.ADMIN_EMAIL) === email) {
    // The flag follows the setting: changing ADMIN_EMAIL moves the role rather than adding a
    // second administrator who keeps it for ever because nothing ever took it away.
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE users SET is_admin = 1 WHERE id = ?`).bind(user.id),
      c.env.DB.prepare(`UPDATE users SET is_admin = 0 WHERE id != ?`).bind(user.id),
    ]);
  }
  const session = randomToken();
  await c.env.DB.prepare(`INSERT INTO sessions (id_hash, user_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(await sha256(session), user.id, now(), now() + SESSION_TTL_MS, now())
    .run();
  setCookie(c, cookieName(c.env, SESSION_COOKIE), session, {
    httpOnly: true,
    secure: isSecure(c.env),
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export const auth = new Hono<{ Bindings: Env; Variables: Vars }>();

auth.get('/me', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ user: null });
  const [adminFlag, del] = await Promise.all([
    isAdmin(c.env, user.id),
    c.env.DB.prepare(`SELECT requested_at FROM deletion_requests WHERE user_id = ?`).bind(user.id).first<{ requested_at: number }>(),
  ]);
  return c.json({ user: { ...user, isAdmin: adminFlag, deletionRequestedAt: del?.requested_at ?? null } });
});

auth.post('/request', async (c) => {
  const body = await readJson<{ email?: string }>(c.req.raw, 2048);
  const email = normaliseEmail(body.email);
  await hit(c.env, `req:ip:${clientIp(c.req.raw)}`, 20, WINDOW_MS);
  // Closed door: only existing users and invited addresses get a mail. Same answer either way for outsiders.
  if (!(await mayEnter(c.env, email)).allowed) throw new HttpError(403, 'invitation_required');
  // At most three links per address per quarter hour: keeps a mistyped form or a bot from burning the mail quota.
  const recent = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM magic_links WHERE email = ? AND expires_at > ?`)
    .bind(email, now())
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= 3) throw new HttpError(429, 'too_many_requests');
  const token = randomToken();
  const code = randomCode();
  // The browser that asks gets a nonce; the link and the code are only honoured alongside it.
  const nonce = readCookie(c, SIGNIN_COOKIE) || randomToken();
  setCookie(c, cookieName(c.env, SIGNIN_COOKIE), nonce, {
    httpOnly: true,
    secure: isSecure(c.env),
    sameSite: 'Lax',
    path: '/',
    maxAge: LINK_TTL_MS / 1000,
  });
  await c.env.DB.prepare(`INSERT INTO magic_links (token_hash, email, expires_at, code_hash, browser_hash) VALUES (?, ?, ?, ?, ?)`)
    .bind(await sha256(token), email, now() + LINK_TTL_MS, await codeHash(c.env, email, code), await sha256(nonce))
    .run();
  // The token travels in the fragment: it never reaches a server or a log, and opening the page has no effect by itself.
  const link = `${c.env.APP_ORIGIN}/#signin=${encodeURIComponent(token)}`;
  await sendMagicLink(c.env, c.req.url, email, link, code);
  return c.json({ ok: true, ...(echoMode(c.env, c.req.url) ? { link, code } : {}) });
});

/** The code from the mail, typed on the sign-in page. Five tries per link. */
auth.post('/code', async (c) => {
  const body = await readJson<{ email?: string; code?: string }>(c.req.raw, 2048);
  const email = normaliseEmail(body.email);
  const code = String(body.code ?? '').replace(/\D/g, '');
  if (code.length !== 6) throw new HttpError(400, 'bad_code');
  await hit(c.env, `code:ip:${clientIp(c.req.raw)}`, 30, WINDOW_MS);
  const nonce = readCookie(c, SIGNIN_COOKIE);
  if (!nonce) throw new HttpError(403, 'other_device');
  const browserHash = await sha256(nonce);
  // Failures count across every live link for the address, so a new request does not reset them.
  const failed = await c.env.DB.prepare(`SELECT COALESCE(SUM(attempts), 0) AS n FROM magic_links WHERE email = ? AND expires_at > ?`)
    .bind(email, now())
    .first<{ n: number }>();
  if ((failed?.n ?? 0) >= MAX_FAILED_CODES) throw new HttpError(429, 'too_many_attempts');
  const rows = await c.env.DB.prepare(
    `SELECT token_hash, code_hash, browser_hash FROM magic_links WHERE email = ? AND used_at IS NULL AND expires_at > ? AND code_hash IS NOT NULL ORDER BY expires_at DESC`,
  )
    .bind(email, now())
    .all<{ token_hash: string; code_hash: string; browser_hash: string | null }>();
  const mine = rows.results.filter((r) => r.browser_hash === browserHash);
  // A live link for this address but not for this browser is "other device"; none at all is simply expired.
  if (!mine.length) throw new HttpError(rows.results.length ? 403 : 400, rows.results.length ? 'other_device' : 'code_expired');
  const expected = await codeHash(c.env, email, code);
  const match = mine.find((r) => r.code_hash === expected);
  if (!match) {
    await c.env.DB.prepare(`UPDATE magic_links SET attempts = attempts + 1 WHERE token_hash = ?`).bind(mine[0]!.token_hash).run();
    throw new HttpError(400, 'wrong_code');
  }
  await c.env.DB.prepare(`UPDATE magic_links SET used_at = ? WHERE token_hash = ?`).bind(now(), match.token_hash).run();
  await openSession(c, email);
  clearCookie(c, SIGNIN_COOKIE);
  return c.json({ ok: true });
});

/** Links mailed before this flow existed carried the token in the query: send them into the fragment flow. */
auth.get('/verify', (c) => {
  const token = c.req.query('token') ?? '';
  return c.redirect(`${c.env.APP_ORIGIN}/#signin=${encodeURIComponent(token)}`);
});

/** The app posts the token from the link; only the browser that asked for it may use it. */
auth.post('/verify', async (c) => {
  const body = await readJson<{ token: string }>(c.req.raw, 2048);
  const token = String(body.token ?? '');
  if (!token || token.length > 200) throw new HttpError(400, 'bad_token');
  await hit(c.env, `verify:ip:${clientIp(c.req.raw)}`, 30, WINDOW_MS);
  const hash = await sha256(token);
  const row = await c.env.DB.prepare(`SELECT email, expires_at, used_at, browser_hash FROM magic_links WHERE token_hash = ?`)
    .bind(hash)
    .first<{ email: string; expires_at: number; used_at: number | null; browser_hash: string | null }>();
  if (!row || row.used_at || row.expires_at < now()) throw new HttpError(400, 'link_expired');
  const nonce = readCookie(c, SIGNIN_COOKIE);
  if (!nonce || (await sha256(nonce)) !== row.browser_hash) throw new HttpError(403, 'other_device');
  await c.env.DB.prepare(`UPDATE magic_links SET used_at = ? WHERE token_hash = ?`).bind(now(), hash).run();
  await openSession(c, row.email);
  clearCookie(c, SIGNIN_COOKIE);
  return c.json({ ok: true });
});

auth.post('/logout', async (c) => {
  const cookie = readCookie(c, SESSION_COOKIE);
  if (cookie)
    await c.env.DB.prepare(`DELETE FROM sessions WHERE id_hash = ?`)
      .bind(await sha256(cookie))
      .run();
  clearCookie(c, SESSION_COOKIE);
  return c.json({ ok: true });
});

/** Close every session of the signed-in person, this one included. */
auth.post('/logout-all', async (c) => {
  const user = c.get('user');
  if (!user) throw new HttpError(401, 'sign_in_required');
  const r = await c.env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(user.id).run();
  clearCookie(c, SESSION_COOKIE);
  return c.json({ ok: true, closed: r.meta.changes ?? 0 });
});

auth.patch('/me', async (c) => {
  const user = c.get('user');
  if (!user) throw new HttpError(401, 'sign_in_required');
  const body = await readJson<{ name?: string }>(c.req.raw, 2048);
  const name = cleanText(body.name, 80);
  await c.env.DB.prepare(`UPDATE users SET name = ? WHERE id = ?`)
    .bind(name || null, user.id)
    .run();
  return c.json({ user: { ...user, name: name || null } });
});

/** Anyone may ask for an invitation; the administrator hears about it by mail and decides. Same answer whatever the address. */
auth.post('/access-request', async (c) => {
  await hit(c.env, `access:ip:${clientIp(c.req.raw)}`, ACCESS_REQUESTS_PER_IP, WINDOW_MS);
  await hit(c.env, 'access:all', ACCESS_REQUESTS_OVERALL_PER_HOUR, HOUR_MS);
  const body = await readJson<{ email: string; message: string }>(c.req.raw, 4096);
  const email = normaliseEmail(body.email);
  const message = cleanText(body.message, 600, { multiline: true });
  const known = await c.env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(email).first();
  const recent = await c.env.DB.prepare(`SELECT requested_at FROM access_requests WHERE email = ?`)
    .bind(email)
    .first<{ requested_at: number }>();
  const fresh = recent && now() - recent.requested_at < 24 * 60 * 60 * 1000;
  if (!known && !fresh) {
    await c.env.DB.prepare(`INSERT OR REPLACE INTO access_requests (id, email, message, requested_at) VALUES (?, ?, ?, ?)`)
      .bind(randomId('Q'), email, message || null, now())
      .run();
    if (c.env.ADMIN_EMAIL) {
      await sendMail(
        c.env,
        c.req.url,
        c.env.ADMIN_EMAIL,
        `Demande d’accès à Ramure : ${email}`,
        [
          `${email} demande un accès à Ramure.`,
          '',
          message ? `Message : ${message}` : '(sans message)',
          '',
          `Décidez depuis ${c.env.APP_ORIGIN}/#/administration`,
        ].join('\n'),
      ).catch(() => undefined);
    }
  }
  return c.json({ ok: true });
});

/** Users do not delete their own account: they ask, and the administrator approves. */
auth.post('/deletion-request', async (c) => {
  const user = c.get('user');
  if (!user) throw new HttpError(401, 'sign_in_required');
  const body = await readJson<{ note?: string }>(c.req.raw, 2048);
  const note = cleanText(body.note, 500, { multiline: true });
  await c.env.DB.prepare(`INSERT OR REPLACE INTO deletion_requests (user_id, requested_at, note) VALUES (?, ?, ?)`)
    .bind(user.id, now(), note || null)
    .run();
  return c.json({ ok: true, requestedAt: now() });
});

auth.delete('/deletion-request', async (c) => {
  const user = c.get('user');
  if (!user) throw new HttpError(401, 'sign_in_required');
  await c.env.DB.prepare(`DELETE FROM deletion_requests WHERE user_id = ?`).bind(user.id).run();
  return c.json({ ok: true });
});
