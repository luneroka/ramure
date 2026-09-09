/**
 * Family accounts: a group of people who share the same trees. Each signs
 * in with their own email; membership in the account gives access to all
 * of its trees. Owners manage members and invite links.
 */

import { Hono } from 'hono';
import type { Env, User, Vars } from './env';
import { echoMode, sendMail } from './mail';
import { cleanText, emailFor, HttpError, normaliseEmail, now, randomId, randomToken, readJson, sha256 } from './util';
import { hit } from './ratelimit';

export type AccountRole = 'owner' | 'member' | 'viewer';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * Inviting sends mail to an address the caller chooses, from the domain that
 * also carries everyone's sign-in codes — and any signed-in person can create
 * an account and become its owner. Far past what a family needs, so a runaway
 * script is stopped long before the sending reputation is.
 */
const INVITES_PER_ACCOUNT_PER_DAY = 10;
const INVITES_PER_USER_PER_DAY = 20;
/** An invitation id is the first 12 characters of its token hash: lower-case hex, nothing else. */
const INVITE_ID_RE = /^[0-9a-f]{12}$/;

export function requireUser(user: User | null): User {
  if (!user) throw new HttpError(401, 'sign_in_required');
  return user;
}

export async function accountRole(env: Env, accountId: string, userId: string): Promise<AccountRole | null> {
  const row = await env.DB.prepare(`SELECT role FROM account_members WHERE account_id = ? AND user_id = ?`)
    .bind(accountId, userId)
    .first<{ role: AccountRole }>();
  return row?.role ?? null;
}

export async function requireAccountRole(env: Env, accountId: string, user: User, allowed: AccountRole[]): Promise<AccountRole> {
  const role = await accountRole(env, accountId, user.id);
  if (!role) throw new HttpError(404, 'account_not_found');
  if (!allowed.includes(role)) throw new HttpError(403, 'not_allowed');
  return role;
}

export const accounts = new Hono<{ Bindings: Env; Variables: Vars }>();

accounts.get('/', async (c) => {
  const user = requireUser(c.get('user'));
  const rows = await c.env.DB.prepare(
    `SELECT a.id, a.name, m.role, (SELECT COUNT(*) FROM account_members x WHERE x.account_id = a.id) AS members, (SELECT COUNT(*) FROM trees t WHERE t.account_id = a.id) AS trees
     FROM accounts a JOIN account_members m ON m.account_id = a.id WHERE m.user_id = ? ORDER BY a.created_at`,
  )
    .bind(user.id)
    .all<{ id: string; name: string; role: AccountRole; members: number; trees: number }>();
  return c.json({ accounts: rows.results });
});

accounts.post('/', async (c) => {
  const user = requireUser(c.get('user'));
  const body = await readJson<{ name?: string }>(c.req.raw, 4096);
  const name = cleanText(body.name, 80) || 'Famille';
  const id = randomId('A');
  const ts = now();
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO accounts (id, name, created_by, created_at) VALUES (?, ?, ?, ?)`).bind(id, name, user.id, ts),
    c.env.DB.prepare(`INSERT INTO account_members (account_id, user_id, role, added_at) VALUES (?, ?, 'owner', ?)`).bind(id, user.id, ts),
  ]);
  return c.json({ id, name, role: 'owner' as AccountRole }, 201);
});

accounts.patch('/:id', async (c) => {
  const user = requireUser(c.get('user'));
  const id = c.req.param('id');
  await requireAccountRole(c.env, id, user, ['owner']);
  const body = await readJson<{ name?: string }>(c.req.raw, 4096);
  const name = cleanText(body.name, 80);
  if (!name) throw new HttpError(400, 'name_required');
  await c.env.DB.prepare(`UPDATE accounts SET name = ? WHERE id = ?`).bind(name, id).run();
  return c.json({ ok: true });
});

accounts.get('/:id/members', async (c) => {
  const user = requireUser(c.get('user'));
  const id = c.req.param('id');
  const mine = await requireAccountRole(c.env, id, user, ['owner', 'member', 'viewer']);
  const rows = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.name, m.role, m.added_at FROM account_members m JOIN users u ON u.id = m.user_id WHERE m.account_id = ? ORDER BY m.added_at`,
  )
    .bind(id)
    .all<{ id: string; email: string; name: string | null; role: AccountRole; added_at: number }>();
  // Owners manage the roster and see addresses; everyone else sees names and masked addresses.
  const members = rows.results.map((m) => ({ ...m, email: emailFor(m.email, { isOwner: mine === 'owner', isSelf: m.id === user.id }) }));
  return c.json({ members });
});

/** Storage used by the account's trees: every file in R2, per tree. */
accounts.get('/:id/storage', async (c) => {
  const user = requireUser(c.get('user'));
  const id = c.req.param('id');
  await requireAccountRole(c.env, id, user, ['owner', 'member', 'viewer']);
  const rows = await c.env.DB.prepare(
    `SELECT t.id, t.name, COUNT(m.id) AS files, COALESCE(SUM(m.size), 0) AS bytes
       FROM trees t LEFT JOIN media m ON m.tree_id = t.id AND m.deleted_at IS NULL
      WHERE t.account_id = ? GROUP BY t.id ORDER BY bytes DESC`,
  )
    .bind(id)
    .all<{ id: string; name: string; files: number; bytes: number }>();
  const trees = rows.results;
  return c.json({
    bytes: trees.reduce((n, r) => n + r.bytes, 0),
    files: trees.reduce((n, r) => n + r.files, 0),
    trees,
  });
});

accounts.patch('/:id/members/:userId', async (c) => {
  const user = requireUser(c.get('user'));
  const id = c.req.param('id');
  await requireAccountRole(c.env, id, user, ['owner']);
  const target = c.req.param('userId');
  const body = await readJson<{ role?: AccountRole }>(c.req.raw, 4096);
  if (body.role !== 'owner' && body.role !== 'member' && body.role !== 'viewer') throw new HttpError(400, 'bad_role');
  if (target === user.id && body.role !== 'owner') {
    const owners = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM account_members WHERE account_id = ? AND role = 'owner'`)
      .bind(id)
      .first<{ n: number }>();
    if ((owners?.n ?? 0) <= 1) throw new HttpError(400, 'account_needs_an_owner');
  }
  await c.env.DB.prepare(`UPDATE account_members SET role = ? WHERE account_id = ? AND user_id = ?`).bind(body.role, id, target).run();
  return c.json({ ok: true });
});

accounts.delete('/:id/members/:userId', async (c) => {
  const user = requireUser(c.get('user'));
  const id = c.req.param('id');
  const target = c.req.param('userId');
  const role = await requireAccountRole(c.env, id, user, ['owner', 'member', 'viewer']);
  if (target !== user.id && role !== 'owner') throw new HttpError(403, 'not_allowed');
  const targetRole = await accountRole(c.env, id, target);
  if (targetRole === 'owner') {
    const owners = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM account_members WHERE account_id = ? AND role = 'owner'`)
      .bind(id)
      .first<{ n: number }>();
    if ((owners?.n ?? 0) <= 1) throw new HttpError(400, 'last_owner_cannot_leave');
  }
  await c.env.DB.prepare(`DELETE FROM account_members WHERE account_id = ? AND user_id = ?`).bind(id, target).run();
  return c.json({ ok: true });
});

/** Invite an address to the account: the mail carries the link, and the address may sign in from then on. */
accounts.post('/:id/invites', async (c) => {
  const user = requireUser(c.get('user'));
  const id = c.req.param('id');
  await requireAccountRole(c.env, id, user, ['owner']);
  await hit(c.env, `invite:acct:${id}`, INVITES_PER_ACCOUNT_PER_DAY, DAY_MS);
  await hit(c.env, `invite:user:${user.id}`, INVITES_PER_USER_PER_DAY, DAY_MS);
  const body = await readJson<{ email?: string; role?: string }>(c.req.raw, 4096);
  const email = normaliseEmail(body.email);
  const role: AccountRole = body.role === 'viewer' ? 'viewer' : 'member';
  const account = await c.env.DB.prepare(`SELECT name FROM accounts WHERE id = ?`).bind(id).first<{ name: string }>();
  if (!account) throw new HttpError(404, 'account_not_found');
  const already = await c.env.DB.prepare(
    `SELECT m.user_id FROM account_members m JOIN users u ON u.id = m.user_id WHERE m.account_id = ? AND u.email = ?`,
  )
    .bind(id, email)
    .first();
  if (already) throw new HttpError(409, 'already_a_member');
  // One live invitation per address and account: a new one replaces the previous.
  await c.env.DB.prepare(
    `UPDATE account_invites SET revoked_at = ? WHERE account_id = ? AND email = ? AND used_at IS NULL AND revoked_at IS NULL`,
  )
    .bind(now(), id, email)
    .run();
  const token = randomToken();
  const expiresAt = now() + INVITE_TTL_MS;
  await c.env.DB.prepare(
    `INSERT INTO account_invites (token_hash, account_id, created_by, created_at, expires_at, role, email) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(await sha256(token), id, user.id, now(), expiresAt, role, email)
    .run();
  // Fragment, so the token never reaches a server log; the app reads it and posts it.
  const link = `${c.env.APP_ORIGIN}/#invite=${encodeURIComponent(token)}`;
  const from = user.name || user.email;
  await sendMail(
    c.env,
    c.req.url,
    email,
    `${from} vous invite à rejoindre « ${account.name} » sur Ramure`,
    [
      'Bonjour,',
      '',
      `${from} vous invite à rejoindre l'arbre généalogique « ${account.name} » sur Ramure${role === 'viewer' ? ' (en lecture seule)' : ''}.`,
      '',
      'Ouvrez ce lien, puis connectez-vous avec cette adresse :',
      link,
      '',
      'Aucun mot de passe : un code à six chiffres vous est envoyé à chaque connexion.',
      'Cette invitation est valable trente jours.',
    ].join('\n'),
  );
  return c.json({ id: (await sha256(token)).slice(0, 12), email, expiresAt, role, ...(echoMode(c.env, c.req.url) ? { link } : {}) }, 201);
});

accounts.get('/:id/invites', async (c) => {
  const user = requireUser(c.get('user'));
  const id = c.req.param('id');
  await requireAccountRole(c.env, id, user, ['owner']);
  const rows = await c.env.DB.prepare(
    `SELECT token_hash, created_at, expires_at, revoked_at, used_at, role, email FROM account_invites WHERE account_id = ? ORDER BY created_at DESC`,
  )
    .bind(id)
    .all<{
      token_hash: string;
      created_at: number;
      expires_at: number;
      revoked_at: number | null;
      used_at: number | null;
      role: AccountRole;
      email: string | null;
    }>();
  return c.json({
    invites: rows.results
      .filter((r) => !r.revoked_at && !r.used_at && r.expires_at > now())
      .map((r) => ({ id: r.token_hash.slice(0, 12), email: r.email, createdAt: r.created_at, expiresAt: r.expires_at, role: r.role })),
  });
});

accounts.delete('/:id/invites/:inviteId', async (c) => {
  const user = requireUser(c.get('user'));
  const id = c.req.param('id');
  await requireAccountRole(c.env, id, user, ['owner']);
  // A prefix match, so the value reaches a LIKE pattern: `%` here would revoke every invitation
  // of the account at once. Bound to the shape the list hands out and nothing else.
  const inviteId = c.req.param('inviteId');
  if (!INVITE_ID_RE.test(inviteId)) throw new HttpError(400, 'bad_id', { field: 'invite id' });
  await c.env.DB.prepare(`UPDATE account_invites SET revoked_at = ? WHERE account_id = ? AND token_hash LIKE ?`)
    .bind(now(), id, inviteId + '%')
    .run();
  return c.json({ ok: true });
});

export const invites = new Hono<{ Bindings: Env; Variables: Vars }>();

invites.post('/info', async (c) => {
  const token = String((await readJson<{ token: string }>(c.req.raw, 2048)).token ?? '');
  if (!token || token.length > 200) throw new HttpError(400, 'bad_token');
  const row = await c.env.DB.prepare(
    `SELECT i.account_id, i.expires_at, i.revoked_at, i.used_at, i.role, i.email, a.name FROM account_invites i JOIN accounts a ON a.id = i.account_id WHERE i.token_hash = ?`,
  )
    .bind(await sha256(token))
    .first<{
      account_id: string;
      expires_at: number;
      revoked_at: number | null;
      used_at: number | null;
      role: AccountRole;
      email: string | null;
      name: string;
    }>();
  if (!row || row.revoked_at || row.used_at || row.expires_at < now()) throw new HttpError(404, 'invite_not_valid');
  return c.json({ accountId: row.account_id, accountName: row.name, role: row.role, email: row.email });
});

invites.post('/accept', async (c) => {
  const user = requireUser(c.get('user'));
  const token = String((await readJson<{ token: string }>(c.req.raw, 2048)).token ?? '');
  if (!token || token.length > 200) throw new HttpError(400, 'bad_token');
  const hash = await sha256(token);
  const row = await c.env.DB.prepare(
    `SELECT account_id, expires_at, revoked_at, used_at, role, email FROM account_invites WHERE token_hash = ?`,
  )
    .bind(hash)
    .first<{
      account_id: string;
      expires_at: number;
      revoked_at: number | null;
      used_at: number | null;
      role: AccountRole;
      email: string | null;
    }>();
  if (!row || row.revoked_at || row.used_at || row.expires_at < now()) throw new HttpError(404, 'invite_not_valid');
  // An addressed invitation is for that address only.
  if (row.email && row.email !== user.email) throw new HttpError(403, 'invite_for_another_address');
  const existing = await accountRole(c.env, row.account_id, user.id);
  if (!existing) {
    await c.env.DB.prepare(`INSERT INTO account_members (account_id, user_id, role, added_at) VALUES (?, ?, ?, ?)`)
      .bind(row.account_id, user.id, row.role, now())
      .run();
  }
  // Spent either way. No route makes an invitation without an address any more — `normaliseEmail`
  // throws first — but the condition that used to be here read as "reusable for seven days by
  // anyone holding the link", which is not something to leave lying in the accept path.
  await c.env.DB.prepare(`UPDATE account_invites SET used_at = ? WHERE token_hash = ?`).bind(now(), hash).run();
  return c.json({ accountId: row.account_id, role: existing ?? row.role });
});
