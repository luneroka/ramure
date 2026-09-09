/**
 * Family accounts: a group of people who share the same trees. Each signs
 * in with their own email; membership in the account gives access to all
 * of its trees. Owners manage members and invite links.
 */

import { Hono } from 'hono';
import type { Env, User, Vars } from './env';
import { HttpError, maskEmail, now, randomId, randomToken, readJson, sha256 } from './util';

export type AccountRole = 'owner' | 'member' | 'viewer';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function requireUser(user: User | null): User {
  if (!user) throw new HttpError(401, 'sign in required');
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
  if (!role) throw new HttpError(404, 'account not found');
  if (!allowed.includes(role)) throw new HttpError(403, 'not allowed');
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
  const name =
    String(body.name ?? '')
      .trim()
      .slice(0, 80) || 'Famille';
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
  const name = String(body.name ?? '')
    .trim()
    .slice(0, 80);
  if (!name) throw new HttpError(400, 'name required');
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
  const members = rows.results.map((m) => (mine === 'owner' || m.id === user.id ? m : { ...m, email: maskEmail(m.email) }));
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
  if (body.role !== 'owner' && body.role !== 'member' && body.role !== 'viewer') throw new HttpError(400, 'bad role');
  if (target === user.id && body.role !== 'owner') {
    const owners = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM account_members WHERE account_id = ? AND role = 'owner'`)
      .bind(id)
      .first<{ n: number }>();
    if ((owners?.n ?? 0) <= 1) throw new HttpError(400, 'an account needs at least one owner');
  }
  await c.env.DB.prepare(`UPDATE account_members SET role = ? WHERE account_id = ? AND user_id = ?`).bind(body.role, id, target).run();
  return c.json({ ok: true });
});

accounts.delete('/:id/members/:userId', async (c) => {
  const user = requireUser(c.get('user'));
  const id = c.req.param('id');
  const target = c.req.param('userId');
  const role = await requireAccountRole(c.env, id, user, ['owner', 'member', 'viewer']);
  if (target !== user.id && role !== 'owner') throw new HttpError(403, 'not allowed');
  const targetRole = await accountRole(c.env, id, target);
  if (targetRole === 'owner') {
    const owners = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM account_members WHERE account_id = ? AND role = 'owner'`)
      .bind(id)
      .first<{ n: number }>();
    if ((owners?.n ?? 0) <= 1) throw new HttpError(400, 'the last owner cannot leave');
  }
  await c.env.DB.prepare(`DELETE FROM account_members WHERE account_id = ? AND user_id = ?`).bind(id, target).run();
  return c.json({ ok: true });
});

accounts.post('/:id/invites', async (c) => {
  const user = requireUser(c.get('user'));
  const id = c.req.param('id');
  await requireAccountRole(c.env, id, user, ['owner']);
  const body = await readJson<{ role?: string }>(c.req.raw, 4096);
  const role: AccountRole = body.role === 'viewer' ? 'viewer' : 'member';
  const token = randomToken();
  await c.env.DB.prepare(
    `INSERT INTO account_invites (token_hash, account_id, created_by, created_at, expires_at, role) VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(await sha256(token), id, user.id, now(), now() + INVITE_TTL_MS, role)
    .run();
  // Fragment, so the token never reaches a server log; the app reads it and posts it.
  return c.json({ link: `${c.env.APP_ORIGIN}/#invite=${encodeURIComponent(token)}`, expiresAt: now() + INVITE_TTL_MS, role }, 201);
});

accounts.get('/:id/invites', async (c) => {
  const user = requireUser(c.get('user'));
  const id = c.req.param('id');
  await requireAccountRole(c.env, id, user, ['owner']);
  const rows = await c.env.DB.prepare(
    `SELECT token_hash, created_at, expires_at, revoked_at, role FROM account_invites WHERE account_id = ? ORDER BY created_at DESC`,
  )
    .bind(id)
    .all<{ token_hash: string; created_at: number; expires_at: number; revoked_at: number | null; role: AccountRole }>();
  return c.json({
    invites: rows.results
      .filter((r) => !r.revoked_at && r.expires_at > now())
      .map((r) => ({ id: r.token_hash.slice(0, 12), createdAt: r.created_at, expiresAt: r.expires_at, role: r.role })),
  });
});

accounts.delete('/:id/invites/:inviteId', async (c) => {
  const user = requireUser(c.get('user'));
  const id = c.req.param('id');
  await requireAccountRole(c.env, id, user, ['owner']);
  await c.env.DB.prepare(`UPDATE account_invites SET revoked_at = ? WHERE account_id = ? AND token_hash LIKE ?`)
    .bind(now(), id, c.req.param('inviteId') + '%')
    .run();
  return c.json({ ok: true });
});

export const invites = new Hono<{ Bindings: Env; Variables: Vars }>();

invites.post('/info', async (c) => {
  const token = String((await readJson<{ token: string }>(c.req.raw, 2048)).token ?? '');
  if (!token || token.length > 200) throw new HttpError(400, 'bad token');
  const row = await c.env.DB.prepare(
    `SELECT i.account_id, i.expires_at, i.revoked_at, i.role, a.name FROM account_invites i JOIN accounts a ON a.id = i.account_id WHERE i.token_hash = ?`,
  )
    .bind(await sha256(token))
    .first<{ account_id: string; expires_at: number; revoked_at: number | null; role: AccountRole; name: string }>();
  if (!row || row.revoked_at || row.expires_at < now()) throw new HttpError(404, 'invite not valid');
  return c.json({ accountId: row.account_id, accountName: row.name, role: row.role });
});

invites.post('/accept', async (c) => {
  const user = requireUser(c.get('user'));
  const token = String((await readJson<{ token: string }>(c.req.raw, 2048)).token ?? '');
  if (!token || token.length > 200) throw new HttpError(400, 'bad token');
  const row = await c.env.DB.prepare(`SELECT account_id, expires_at, revoked_at, role FROM account_invites WHERE token_hash = ?`)
    .bind(await sha256(token))
    .first<{ account_id: string; expires_at: number; revoked_at: number | null; role: AccountRole }>();
  if (!row || row.revoked_at || row.expires_at < now()) throw new HttpError(404, 'invite not valid');
  const existing = await accountRole(c.env, row.account_id, user.id);
  if (!existing) {
    await c.env.DB.prepare(`INSERT INTO account_members (account_id, user_id, role, added_at) VALUES (?, ?, ?, ?)`)
      .bind(row.account_id, user.id, row.role, now())
      .run();
  }
  return c.json({ accountId: row.account_id, role: existing ?? row.role });
});
