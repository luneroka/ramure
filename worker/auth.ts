/**
 * Sign-in by magic link, sessions in D1, cookie on the app's own origin.
 *
 * No passwords anywhere: a person types their email, receives a link valid
 * for 15 minutes, and the link opens a 90-day session. Tokens are stored
 * hashed, so a database leak does not hand out sessions.
 */

import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Env, User, Vars } from './env';
import { HttpError, normaliseEmail, now, randomId, randomToken, sha256 } from './util';

export const SESSION_COOKIE = 'ramure_session';
const LINK_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export async function userFromRequest(env: Env, cookie: string | undefined): Promise<User | null> {
  if (!cookie) return null;
  const hash = await sha256(cookie);
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ? AND s.expires_at > ?`,
  )
    .bind(hash, now())
    .first<User>();
  return row ?? null;
}

async function sendMagicLink(env: Env, email: string, link: string): Promise<void> {
  if (!env.RESEND_API_KEY) {
    if (env.DEV_ECHO_LINKS === '1') return; // returned to the caller instead
    throw new HttpError(500, 'mail not configured');
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: [email],
      subject: 'Votre lien de connexion Ramure',
      text: `Bonjour,\n\nVoici votre lien pour ouvrir Ramure (valable 15 minutes) :\n${link}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
    }),
  });
  if (!res.ok) throw new HttpError(502, 'mail delivery failed');
}

export const auth = new Hono<{ Bindings: Env; Variables: Vars }>();

auth.get('/me', (c) => c.json({ user: c.get('user') }));

auth.post('/request', async (c) => {
  const body = await c.req.json<{ email?: string }>().catch(() => ({}) as { email?: string });
  const email = normaliseEmail(body.email);
  const token = randomToken();
  await c.env.DB.prepare(`INSERT INTO magic_links (token_hash, email, expires_at) VALUES (?, ?, ?)`)
    .bind(await sha256(token), email, now() + LINK_TTL_MS)
    .run();
  const link = `${c.env.APP_ORIGIN}/api/auth/verify?token=${encodeURIComponent(token)}`;
  await sendMagicLink(c.env, email, link);
  return c.json({ ok: true, ...(c.env.DEV_ECHO_LINKS === '1' && !c.env.RESEND_API_KEY ? { link } : {}) });
});

auth.get('/verify', async (c) => {
  const token = c.req.query('token') ?? '';
  const hash = await sha256(token);
  const row = await c.env.DB.prepare(`SELECT email, expires_at, used_at FROM magic_links WHERE token_hash = ?`)
    .bind(hash)
    .first<{ email: string; expires_at: number; used_at: number | null }>();
  if (!row || row.used_at || row.expires_at < now()) return c.redirect(`${c.env.APP_ORIGIN}/?signin=expired`);
  await c.env.DB.prepare(`UPDATE magic_links SET used_at = ? WHERE token_hash = ?`).bind(now(), hash).run();

  let user = await c.env.DB.prepare(`SELECT id, email, name FROM users WHERE email = ?`).bind(row.email).first<User>();
  if (!user) {
    user = { id: randomId('U'), email: row.email, name: null };
    await c.env.DB.prepare(`INSERT INTO users (id, email, name, created_at) VALUES (?, ?, NULL, ?)`).bind(user.id, user.email, now()).run();
  }
  const session = randomToken();
  await c.env.DB.prepare(`INSERT INTO sessions (id_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`)
    .bind(await sha256(session), user.id, now(), now() + SESSION_TTL_MS)
    .run();
  const secure = c.env.APP_ORIGIN.startsWith('https://');
  setCookie(c, SESSION_COOKIE, session, { httpOnly: true, secure, sameSite: 'Lax', path: '/', maxAge: SESSION_TTL_MS / 1000 });
  return c.redirect(`${c.env.APP_ORIGIN}/?signin=ok`);
});

auth.post('/logout', async (c) => {
  const cookie = getCookie(c, SESSION_COOKIE);
  if (cookie)
    await c.env.DB.prepare(`DELETE FROM sessions WHERE id_hash = ?`)
      .bind(await sha256(cookie))
      .run();
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

auth.patch('/me', async (c) => {
  const user = c.get('user');
  if (!user) throw new HttpError(401, 'sign in required');
  const body = await c.req.json<{ name?: string }>();
  const name = String(body.name ?? '')
    .trim()
    .slice(0, 80);
  await c.env.DB.prepare(`UPDATE users SET name = ? WHERE id = ?`)
    .bind(name || null, user.id)
    .run();
  return c.json({ user: { ...user, name: name || null } });
});
