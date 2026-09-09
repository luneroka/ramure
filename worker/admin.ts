/**
 * Application administration: who may sign in, and deletion requests.
 * Only users flagged is_admin (the operator) reach these routes.
 */

import { Hono, type Context } from 'hono';
import type { Env, User, Vars } from './env';
import { BACKUP_PREFIX, listBackups } from './backup';
import { configProblems } from './config';
import { sendMail } from './mail';
import { HttpError, normaliseEmail, now, randomId, readJson } from './util';

export const APP_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function isAdmin(env: Env, userId: string): Promise<boolean> {
  const row = await env.DB.prepare(`SELECT is_admin FROM users WHERE id = ?`).bind(userId).first<{ is_admin: number }>();
  return !!row?.is_admin;
}

async function requireAdmin(env: Env, user: User | null): Promise<User> {
  if (!user) throw new HttpError(401, 'sign_in_required');
  if (!(await isAdmin(env, user.id))) throw new HttpError(403, 'administrator_only');
  return user;
}

/** An address may sign in when it already belongs to a user or holds a live invitation. */
export async function mayEnter(env: Env, email: string): Promise<{ allowed: boolean; inviteId?: string }> {
  const user = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(email).first<{ id: string }>();
  if (user) return { allowed: true };
  const inv = await env.DB.prepare(
    `SELECT id FROM app_invites WHERE email = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(email, now())
    .first<{ id: string }>();
  if (inv) return { allowed: true, inviteId: inv.id };
  // An account owner's invitation to this address opens the door too: the family vouches for its own.
  const fam = await env.DB.prepare(
    `SELECT token_hash FROM account_invites WHERE email = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ? LIMIT 1`,
  )
    .bind(email, now())
    .first<{ token_hash: string }>();
  return fam ? { allowed: true } : { allowed: false };
}

/** Called once a user record exists for an invited address: the invitation is spent. */
export async function consumeInvite(env: Env, email: string): Promise<void> {
  await env.DB.prepare(`UPDATE app_invites SET used_at = ? WHERE email = ? AND used_at IS NULL`).bind(now(), email).run();
}

export const admin = new Hono<{ Bindings: Env; Variables: Vars }>();

admin.get('/overview', async (c) => {
  await requireAdmin(c.env, c.get('user'));
  const users = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.created_at, u.is_admin,
            (SELECT COUNT(*) FROM account_members m WHERE m.user_id = u.id) AS accounts,
            d.requested_at AS deletion_requested_at, d.note AS deletion_note
       FROM users u LEFT JOIN deletion_requests d ON d.user_id = u.id ORDER BY u.created_at`,
  ).all<{
    id: string;
    email: string;
    name: string | null;
    created_at: number;
    is_admin: number;
    accounts: number;
    deletion_requested_at: number | null;
    deletion_note: string | null;
  }>();
  const invites = await c.env.DB.prepare(
    `SELECT id, email, created_at, expires_at FROM app_invites WHERE used_at IS NULL AND revoked_at IS NULL AND expires_at > ? ORDER BY created_at DESC`,
  )
    .bind(now())
    .all<{ id: string; email: string; created_at: number; expires_at: number }>();
  const accounts = await c.env.DB.prepare(
    `SELECT a.id, a.name, a.created_at,
            (SELECT COUNT(*) FROM account_members m WHERE m.account_id = a.id) AS members,
            (SELECT COUNT(*) FROM trees t WHERE t.account_id = a.id) AS trees,
            (SELECT COALESCE(SUM(md.size), 0) FROM media md JOIN trees t ON t.id = md.tree_id WHERE t.account_id = a.id AND md.deleted_at IS NULL) AS bytes
       FROM accounts a ORDER BY a.created_at`,
  ).all<{ id: string; name: string; created_at: number; members: number; trees: number; bytes: number }>();
  const requests = await c.env.DB.prepare(`SELECT id, email, message, requested_at FROM access_requests ORDER BY requested_at DESC`).all<{
    id: string;
    email: string;
    message: string | null;
    requested_at: number;
  }>();
  const trees = await c.env.DB.prepare(
    `SELECT t.id, t.name, t.version, t.people, t.updated_at, a.name AS account_name FROM trees t LEFT JOIN accounts a ON a.id = t.account_id ORDER BY t.updated_at DESC`,
  ).all<{ id: string; name: string; version: number; people: number; updated_at: number; account_name: string | null }>();
  return c.json({
    users: users.results,
    invites: invites.results,
    accounts: accounts.results,
    requests: requests.results,
    trees: trees.results,
    // Named here and nowhere else: the operator is the one who can fix them.
    config: configProblems(c.env),
  });
});

/** Create and mail an invitation for an address; any pending access request for it is settled. */
async function inviteAddress(
  c: Context<{ Bindings: Env; Variables: Vars }>,
  me: User,
  email: string,
): Promise<{ id: string; expiresAt: number }> {
  const existing = await c.env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(email).first<{ id: string }>();
  if (existing) throw new HttpError(409, 'already_a_user');
  const id = randomId('V');
  await c.env.DB.prepare(`UPDATE app_invites SET revoked_at = ? WHERE email = ? AND used_at IS NULL AND revoked_at IS NULL`)
    .bind(now(), email)
    .run();
  await c.env.DB.prepare(`INSERT INTO app_invites (id, email, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(id, email, me.id, now(), now() + APP_INVITE_TTL_MS)
    .run();
  const from = me.name || me.email;
  await sendMail(
    c.env,
    c.req.url,
    email,
    `${from} vous invite sur Ramure`,
    [
      'Bonjour,',
      '',
      `${from} vous invite à rejoindre Ramure, un espace privé pour construire votre arbre généalogique en famille.`,
      '',
      `Rendez-vous sur ${c.env.APP_ORIGIN} et demandez votre code de connexion avec cette adresse (${email}).`,
      'Aucun mot de passe : un code à six chiffres vous est envoyé à chaque connexion.',
      '',
      'Cette invitation est valable sept jours.',
    ].join('\n'),
  );
  await c.env.DB.prepare(`DELETE FROM access_requests WHERE email = ?`).bind(email).run();
  return { id, expiresAt: now() + APP_INVITE_TTL_MS };
}

/** What browsers reported lately, newest first. */
admin.get('/errors', async (c) => {
  await requireAdmin(c.env, c.get('user'));
  const rows = await c.env.DB.prepare(
    `SELECT e.id, e.at, e.version, e.kind, e.message, e.stack, e.url, e.agent, u.email FROM client_errors e LEFT JOIN users u ON u.id = e.user_id ORDER BY e.at DESC LIMIT 100`,
  ).all<{
    id: string;
    at: number;
    version: string | null;
    kind: string;
    message: string;
    stack: string | null;
    url: string | null;
    agent: string | null;
    email: string | null;
  }>();
  return c.json({ errors: rows.results });
});

admin.delete('/errors', async (c) => {
  await requireAdmin(c.env, c.get('user'));
  const r = await c.env.DB.prepare(`DELETE FROM client_errors`).run();
  return c.json({ ok: true, deleted: r.meta.changes ?? 0 });
});

/** The nightly copies of a tree, for the operator's eyes. */
admin.get('/backups/:treeId', async (c) => {
  await requireAdmin(c.env, c.get('user'));
  const treeId = c.req.param('treeId');
  if (!/^[A-Za-z0-9]{1,20}$/.test(treeId)) throw new HttpError(400, 'bad_id');
  return c.json({ backups: await listBackups(c.env, treeId) });
});

/** One copy as a GEDCOM file. */
admin.get('/backups/:treeId/:day', async (c) => {
  await requireAdmin(c.env, c.get('user'));
  const treeId = c.req.param('treeId'),
    day = c.req.param('day');
  if (!/^[A-Za-z0-9]{1,20}$/.test(treeId) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new HttpError(400, 'bad_id');
  const obj = await c.env.MEDIA.get(`${BACKUP_PREFIX}${treeId}/${day}.ged`);
  if (!obj) throw new HttpError(404, 'no_copy');
  return new Response(obj.body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${treeId}-${day}.ged"`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
});

admin.post('/invites', async (c) => {
  const me = await requireAdmin(c.env, c.get('user'));
  const body = await readJson<{ email?: string }>(c.req.raw, 4096);
  const email = normaliseEmail(body.email);
  const r = await inviteAddress(c, me, email);
  return c.json({ id: r.id, email, expiresAt: r.expiresAt }, 201);
});

admin.post('/access-requests/:id/invite', async (c) => {
  const me = await requireAdmin(c.env, c.get('user'));
  const row = await c.env.DB.prepare(`SELECT email FROM access_requests WHERE id = ?`).bind(c.req.param('id')).first<{ email: string }>();
  if (!row) throw new HttpError(404, 'no_request');
  const r = await inviteAddress(c, me, row.email);
  return c.json({ id: r.id, email: row.email, expiresAt: r.expiresAt }, 201);
});

admin.delete('/access-requests/:id', async (c) => {
  await requireAdmin(c.env, c.get('user'));
  await c.env.DB.prepare(`DELETE FROM access_requests WHERE id = ?`).bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

admin.delete('/invites/:id', async (c) => {
  await requireAdmin(c.env, c.get('user'));
  const id = c.req.param('id');
  if (!/^[A-Za-z0-9]{1,20}$/.test(id)) throw new HttpError(400, 'bad_id');
  await c.env.DB.prepare(`UPDATE app_invites SET revoked_at = ? WHERE id = ? AND used_at IS NULL`).bind(now(), id).run();
  return c.json({ ok: true });
});

/**
 * Remove a user entirely: their sessions and memberships, the accounts they
 * were the sole owner of with everything in them, and every row that names
 * them.
 *
 * The order here is the whole of the correctness, and it used to be wrong in
 * two compounding ways.
 *
 * Four columns reference `users(id)` with no ON DELETE clause — `trees.owner_id`,
 * `accounts.created_by`, `account_invites.created_by`, and two more in tables
 * dropped by migration 0012 — and only one branch ever reassigned them: the one
 * where the person co-owned an account with somebody else. Two ordinary
 * situations fell outside it. A member may create a tree, which records them as
 * its owner in an account that outlives them; and an owner who created an
 * account may later be demoted, leaving `created_by` pointing at them. Either
 * way the final batch hit `FOREIGN KEY constraint failed` and the person was
 * not deleted.
 *
 * And the failure was not clean, because the destructive work ran first. The
 * accounts and their files were already gone by the time the batch threw, so
 * approving a deletion request destroyed the person's own genealogy — with no
 * snapshot, since the account went with it — and left them signed in, with the
 * request still queued inviting a second press of the same button.
 *
 * So now: everything is worked out before anything is written, every reference
 * is reassigned or removed inside the *same* batch that deletes the person, and
 * R2 comes last. A crash after the batch leaves files that nothing points at,
 * which `reap` sweeps nightly — the one failure mode worth having.
 */
export async function deleteUser(env: Env, userId: string): Promise<{ accountsDeleted: number }> {
  const user = await env.DB.prepare(`SELECT email FROM users WHERE id = ?`).bind(userId).first<{ email: string }>();
  if (!user) return { accountsDeleted: 0 };

  /** An owner of this account who is not the person being deleted, or null when there is none. */
  const survivingOwner = async (accountId: string): Promise<string | null> => {
    const row = await env.DB.prepare(`SELECT user_id FROM account_members WHERE account_id = ? AND role = 'owner' AND user_id != ? LIMIT 1`)
      .bind(accountId, userId)
      .first<{ user_id: string }>();
    return row?.user_id ?? null;
  };

  // Which accounts go, and which live on under somebody else.
  const owned = await env.DB.prepare(`SELECT account_id FROM account_members WHERE user_id = ? AND role = 'owner'`)
    .bind(userId)
    .all<{ account_id: string }>();
  const doomed: string[] = [];
  const heirs = new Map<string, string>();
  for (const { account_id } of owned.results) {
    const heir = await survivingOwner(account_id);
    if (heir) heirs.set(account_id, heir);
    else doomed.push(account_id);
  }

  // Files of the doomed accounts' trees, listed now while the rows still exist.
  const doomedTrees: string[] = [];
  for (const accountId of doomed) {
    const trees = await env.DB.prepare(`SELECT id FROM trees WHERE account_id = ?`).bind(accountId).all<{ id: string }>();
    doomedTrees.push(...trees.results.map((t) => t.id));
  }

  // Everything this person is named by that a surviving account keeps. The heir is worked out
  // per account rather than in a subquery so that "there is nobody to hand this to" is an error
  // with a name, and not a NOT NULL violation buried inside a batch.
  const reassign: D1PreparedStatement[] = [];
  const trees = await env.DB.prepare(`SELECT id, account_id FROM trees WHERE owner_id = ?`)
    .bind(userId)
    .all<{ id: string; account_id: string | null }>();
  for (const t of trees.results) {
    if (!t.account_id || doomed.includes(t.account_id)) continue;
    const heir = heirs.get(t.account_id) ?? (await survivingOwner(t.account_id));
    if (!heir) throw new Error(`cannot delete ${userId}: tree ${t.id} has no other owner to inherit it`);
    reassign.push(env.DB.prepare(`UPDATE trees SET owner_id = ? WHERE id = ?`).bind(heir, t.id));
  }
  const madeAccounts = await env.DB.prepare(`SELECT id FROM accounts WHERE created_by = ?`).bind(userId).all<{ id: string }>();
  for (const a of madeAccounts.results) {
    if (doomed.includes(a.id)) continue;
    const heir = heirs.get(a.id) ?? (await survivingOwner(a.id));
    if (!heir) throw new Error(`cannot delete ${userId}: account ${a.id} has no other owner to inherit it`);
    reassign.push(env.DB.prepare(`UPDATE accounts SET created_by = ? WHERE id = ?`).bind(heir, a.id));
  }
  const sentInvites = await env.DB.prepare(`SELECT token_hash, account_id FROM account_invites WHERE created_by = ?`)
    .bind(userId)
    .all<{ token_hash: string; account_id: string }>();
  for (const inv of sentInvites.results) {
    if (doomed.includes(inv.account_id)) continue;
    const heir = heirs.get(inv.account_id) ?? (await survivingOwner(inv.account_id));
    // An invitation is not worth failing a deletion over: with nobody to attribute it to, it goes.
    reassign.push(
      heir
        ? env.DB.prepare(`UPDATE account_invites SET created_by = ? WHERE token_hash = ?`).bind(heir, inv.token_hash)
        : env.DB.prepare(`DELETE FROM account_invites WHERE token_hash = ?`).bind(inv.token_hash),
    );
  }

  // One batch: either this person is gone, or nothing moved.
  await env.DB.batch([
    ...doomed.map((id) => env.DB.prepare(`DELETE FROM accounts WHERE id = ?`).bind(id)),
    ...reassign,
    // Rows that carry the address itself. The op log keeps `actor_id`, and snapshots keep
    // `created_by`: those are the family's edit history, and the id no longer resolves to anybody.
    env.DB.prepare(`DELETE FROM magic_links WHERE email = ?`).bind(user.email),
    env.DB.prepare(`DELETE FROM access_requests WHERE email = ?`).bind(user.email),
    env.DB.prepare(`DELETE FROM client_errors WHERE user_id = ?`).bind(userId),
    env.DB.prepare(`DELETE FROM account_members WHERE user_id = ?`).bind(userId),
    env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(userId),
    env.DB.prepare(`DELETE FROM deletion_requests WHERE user_id = ?`).bind(userId),
    env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(userId),
  ]);

  // Only now, with the rows committed, the files.
  for (const treeId of doomedTrees) {
    let cursor: string | undefined;
    do {
      const page = await env.MEDIA.list({ prefix: `trees/${treeId}/media/`, cursor });
      if (page.objects.length) await env.MEDIA.delete(page.objects.map((o) => o.key));
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  }
  return { accountsDeleted: doomed.length };
}

admin.post('/deletions/:userId/approve', async (c) => {
  const me = await requireAdmin(c.env, c.get('user'));
  const userId = c.req.param('userId');
  if (userId === me.id) throw new HttpError(400, 'cannot_delete_yourself');
  const req = await c.env.DB.prepare(`SELECT user_id FROM deletion_requests WHERE user_id = ?`).bind(userId).first();
  if (!req) throw new HttpError(404, 'no_request');
  const result = await deleteUser(c.env, userId);
  return c.json({ ok: true, ...result });
});

admin.post('/deletions/:userId/decline', async (c) => {
  await requireAdmin(c.env, c.get('user'));
  await c.env.DB.prepare(`DELETE FROM deletion_requests WHERE user_id = ?`).bind(c.req.param('userId')).run();
  return c.json({ ok: true });
});
