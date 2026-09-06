/**
 * Trees: documents, op log, members, invites, media.
 *
 * A tree is a GEDCOM document plus a version (the number of ops applied).
 * Clients push ops with the version they built on; the server replays them
 * on the current document in one transaction and rejects a stale base with
 * the ops the client is missing, so it can rebase and retry.
 */

import { Hono } from 'hono';
import { parseGedcom } from '../src/gedcom/parse';
import { serializeGedcom } from '../src/gedcom/serialize';
import type { OpEnvelope } from '../src/tree/ops';
import { replayOps } from '../src/tree/replay';
import type { Env, Role, User, Vars } from './env';
import { HttpError, now, randomId, randomToken, sha256 } from './util';

const MAX_DOC_BYTES = 25 * 1024 * 1024;
const MAX_OPS_PER_PUSH = 500;
const SNAPSHOT_EVERY = 100;
const INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_MEDIA_BYTES = 4 * 1024 * 1024;

interface TreeRow {
  id: string;
  name: string;
  owner_id: string;
  version: number;
  doc: string;
  people: number;
  created_at: number;
  updated_at: number;
}

function requireUser(user: User | null): User {
  if (!user) throw new HttpError(401, 'sign in required');
  return user;
}

async function roleOf(env: Env, treeId: string, userId: string): Promise<Role | null> {
  const row = await env.DB.prepare(`SELECT role FROM tree_members WHERE tree_id = ? AND user_id = ?`)
    .bind(treeId, userId)
    .first<{ role: Role }>();
  return row?.role ?? null;
}

async function requireRole(env: Env, treeId: string, user: User, allowed: Role[]): Promise<Role> {
  const role = await roleOf(env, treeId, user.id);
  if (!role) throw new HttpError(404, 'tree not found');
  if (!allowed.includes(role)) throw new HttpError(403, 'not allowed');
  return role;
}

export const trees = new Hono<{ Bindings: Env; Variables: Vars }>();

// ---------- List and create ----------

trees.get('/', async (c) => {
  const user = requireUser(c.get('user'));
  const rows = await c.env.DB.prepare(
    `SELECT t.id, t.name, t.version, t.people, t.updated_at, m.role FROM trees t JOIN tree_members m ON m.tree_id = t.id WHERE m.user_id = ? ORDER BY t.updated_at DESC`,
  )
    .bind(user.id)
    .all<{ id: string; name: string; version: number; people: number; updated_at: number; role: Role }>();
  return c.json({ trees: rows.results });
});

trees.post('/', async (c) => {
  const user = requireUser(c.get('user'));
  const body = await c.req.json<{ name?: string; gedcom?: string }>();
  const name =
    String(body.name ?? '')
      .trim()
      .slice(0, 120) || 'Arbre';
  const gedcom = String(body.gedcom ?? '');
  if (gedcom.length > MAX_DOC_BYTES) throw new HttpError(413, 'tree too large');
  // Normalise through the parser so the stored document is always Ramure's own serialisation.
  const tree = parseGedcom(gedcom);
  const doc = serializeGedcom(tree);
  const id = randomId('T');
  const ts = now();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO trees (id, name, owner_id, version, doc, people, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, ?, ?)`,
    ).bind(id, name, user.id, doc, Object.keys(tree.individuals).length, ts, ts),
    c.env.DB.prepare(`INSERT INTO tree_members (tree_id, user_id, role, added_at) VALUES (?, ?, 'owner', ?)`).bind(id, user.id, ts),
  ]);
  return c.json({ id, name, version: 0, role: 'owner' as Role }, 201);
});

// ---------- One tree ----------

trees.get('/:id', async (c) => {
  const user = requireUser(c.get('user'));
  const id = c.req.param('id');
  const role = await requireRole(c.env, id, user, ['owner', 'editor', 'viewer']);
  const row = await c.env.DB.prepare(`SELECT id, name, owner_id, version, doc, people, created_at, updated_at FROM trees WHERE id = ?`)
    .bind(id)
    .first<TreeRow>();
  if (!row) throw new HttpError(404, 'tree not found');
  return c.json({ id: row.id, name: row.name, version: row.version, doc: row.doc, people: row.people, role, updatedAt: row.updated_at });
});

trees.patch('/:id', async (c) => {
  const user = requireUser(c.get('user'));
  const id = c.req.param('id');
  await requireRole(c.env, id, user, ['owner']);
  const body = await c.req.json<{ name?: string }>();
  const name = String(body.name ?? '')
    .trim()
    .slice(0, 120);
  if (!name) throw new HttpError(400, 'name required');
  await c.env.DB.prepare(`UPDATE trees SET name = ?, updated_at = ? WHERE id = ?`).bind(name, now(), id).run();
  return c.json({ ok: true });
});

trees.delete('/:id', async (c) => {
  const user = requireUser(c.get('user'));
  const id = c.req.param('id');
  await requireRole(c.env, id, user, ['owner']);
  const media = await c.env.DB.prepare(`SELECT id FROM media WHERE tree_id = ?`).bind(id).all<{ id: string }>();
  await Promise.all(media.results.map((m) => c.env.MEDIA.delete(`trees/${id}/media/${m.id}`)));
  await c.env.DB.prepare(`DELETE FROM trees WHERE id = ?`).bind(id).run();
  return c.json({ ok: true });
});

// ---------- Ops: pull and push ----------

trees.get('/:id/ops', async (c) => {
  const user = requireUser(c.get('user'));
  const id = c.req.param('id');
  await requireRole(c.env, id, user, ['owner', 'editor', 'viewer']);
  const since = Number(c.req.query('since') ?? 0);
  const rows = await c.env.DB.prepare(
    `SELECT seq, op_id, actor_id, ts, op FROM tree_ops WHERE tree_id = ? AND seq > ? ORDER BY seq LIMIT 1000`,
  )
    .bind(id, since)
    .all<{ seq: number; op_id: string; actor_id: string; ts: number; op: string }>();
  const version = await c.env.DB.prepare(`SELECT version FROM trees WHERE id = ?`).bind(id).first<{ version: number }>();
  return c.json({
    version: version?.version ?? 0,
    ops: rows.results.map((r) => ({ seq: r.seq, envelope: { id: r.op_id, ts: r.ts, actor: r.actor_id, op: JSON.parse(r.op) } })),
  });
});

trees.post('/:id/ops', async (c) => {
  const user = requireUser(c.get('user'));
  const id = c.req.param('id');
  await requireRole(c.env, id, user, ['owner', 'editor']);
  const body = await c.req.json<{ baseVersion?: number; ops?: OpEnvelope[] }>();
  const baseVersion = Number(body.baseVersion ?? -1);
  const envelopes = Array.isArray(body.ops) ? body.ops : [];
  if (envelopes.length === 0) throw new HttpError(400, 'no ops');
  if (envelopes.length > MAX_OPS_PER_PUSH) throw new HttpError(413, 'too many ops');

  const row = await c.env.DB.prepare(`SELECT id, version, doc FROM trees WHERE id = ?`)
    .bind(id)
    .first<Pick<TreeRow, 'id' | 'version' | 'doc'>>();
  if (!row) throw new HttpError(404, 'tree not found');
  if (baseVersion !== row.version) {
    // Stale base: hand back what the client is missing so it can rebase.
    const missing = await c.env.DB.prepare(
      `SELECT seq, op_id, actor_id, ts, op FROM tree_ops WHERE tree_id = ? AND seq > ? ORDER BY seq LIMIT 1000`,
    )
      .bind(id, Math.max(0, baseVersion))
      .all<{ seq: number; op_id: string; actor_id: string; ts: number; op: string }>();
    return c.json(
      {
        error: 'stale base',
        version: row.version,
        ops: missing.results.map((r) => ({ seq: r.seq, envelope: { id: r.op_id, ts: r.ts, actor: r.actor_id, op: JSON.parse(r.op) } })),
      },
      409,
    );
  }

  // Skip ops already applied (a retry after a lost response).
  const known = await c.env.DB.prepare(`SELECT op_id FROM tree_ops WHERE tree_id = ? AND op_id IN (${envelopes.map(() => '?').join(',')})`)
    .bind(id, ...envelopes.map((e) => e.id))
    .all<{ op_id: string }>();
  const knownIds = new Set(known.results.map((r) => r.op_id));
  const fresh = envelopes.filter((e) => !knownIds.has(e.id)).map((e) => ({ ...e, actor: user.id, ts: Number(e.ts) || now() }));

  const tree = parseGedcom(row.doc);
  const result = replayOps(tree, fresh);
  const doc = serializeGedcom(result.tree);
  if (doc.length > MAX_DOC_BYTES) throw new HttpError(413, 'tree too large');
  const newVersion = row.version + result.applied.length;
  const ts = now();
  const statements = [
    c.env.DB.prepare(`UPDATE trees SET version = ?, doc = ?, people = ?, updated_at = ? WHERE id = ? AND version = ?`).bind(
      newVersion,
      doc,
      Object.keys(result.tree.individuals).length,
      ts,
      id,
      row.version,
    ),
    ...result.applied.map((e, i) =>
      c.env.DB.prepare(`INSERT INTO tree_ops (tree_id, seq, op_id, actor_id, ts, op) VALUES (?, ?, ?, ?, ?, ?)`).bind(
        id,
        row.version + i + 1,
        e.id,
        user.id,
        e.ts,
        JSON.stringify(e.op),
      ),
    ),
  ];
  if (Math.floor(newVersion / SNAPSHOT_EVERY) > Math.floor(row.version / SNAPSHOT_EVERY)) {
    statements.push(
      c.env.DB.prepare(`INSERT INTO tree_snapshots (id, tree_id, version, doc, created_at) VALUES (?, ?, ?, ?, ?)`).bind(
        randomId('S'),
        id,
        newVersion,
        doc,
        ts,
      ),
    );
  }
  const results = await c.env.DB.batch(statements);
  // D1 batches run in a transaction; the version guard on the UPDATE catches a race with another push.
  if ((results[0]?.meta.changes ?? 0) !== 1) throw new HttpError(409, 'concurrent update, retry');
  return c.json({
    version: newVersion,
    applied: result.applied.map((e) => e.id),
    rejected: result.rejected.map((r) => ({ id: r.envelope.id, reason: r.reason })),
  });
});

trees.get('/:id/snapshots', async (c) => {
  const user = requireUser(c.get('user'));
  const id = c.req.param('id');
  await requireRole(c.env, id, user, ['owner', 'editor', 'viewer']);
  const rows = await c.env.DB.prepare(
    `SELECT id, version, created_at FROM tree_snapshots WHERE tree_id = ? ORDER BY created_at DESC LIMIT 50`,
  )
    .bind(id)
    .all<{ id: string; version: number; created_at: number }>();
  return c.json({ snapshots: rows.results });
});

trees.get('/:id/snapshots/:sid', async (c) => {
  const user = requireUser(c.get('user'));
  const id = c.req.param('id');
  await requireRole(c.env, id, user, ['owner', 'editor', 'viewer']);
  const row = await c.env.DB.prepare(`SELECT doc, version, created_at FROM tree_snapshots WHERE id = ? AND tree_id = ?`)
    .bind(c.req.param('sid'), id)
    .first<{ doc: string; version: number; created_at: number }>();
  if (!row) throw new HttpError(404, 'snapshot not found');
  return c.json(row);
});

// ---------- Members and invites ----------

trees.get('/:id/members', async (c) => {
  const user = requireUser(c.get('user'));
  const id = c.req.param('id');
  await requireRole(c.env, id, user, ['owner', 'editor', 'viewer']);
  const rows = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.name, m.role, m.added_at FROM tree_members m JOIN users u ON u.id = m.user_id WHERE m.tree_id = ? ORDER BY m.added_at`,
  )
    .bind(id)
    .all<{ id: string; email: string; name: string | null; role: Role; added_at: number }>();
  return c.json({ members: rows.results });
});

trees.patch('/:id/members/:userId', async (c) => {
  const user = requireUser(c.get('user'));
  const id = c.req.param('id');
  await requireRole(c.env, id, user, ['owner']);
  const target = c.req.param('userId');
  const body = await c.req.json<{ role?: Role }>();
  if (target === user.id) throw new HttpError(400, 'cannot change your own role');
  if (body.role !== 'editor' && body.role !== 'viewer') throw new HttpError(400, 'role must be editor or viewer');
  await c.env.DB.prepare(`UPDATE tree_members SET role = ? WHERE tree_id = ? AND user_id = ? AND role != 'owner'`)
    .bind(body.role, id, target)
    .run();
  return c.json({ ok: true });
});

trees.delete('/:id/members/:userId', async (c) => {
  const user = requireUser(c.get('user'));
  const id = c.req.param('id');
  const target = c.req.param('userId');
  const role = await requireRole(c.env, id, user, ['owner', 'editor', 'viewer']);
  // Owners remove anyone but themselves; anyone can leave.
  if (target !== user.id && role !== 'owner') throw new HttpError(403, 'not allowed');
  if (target === user.id && role === 'owner') throw new HttpError(400, 'owner cannot leave; delete the tree instead');
  await c.env.DB.prepare(`DELETE FROM tree_members WHERE tree_id = ? AND user_id = ? AND role != 'owner'`).bind(id, target).run();
  return c.json({ ok: true });
});

trees.post('/:id/invites', async (c) => {
  const user = requireUser(c.get('user'));
  const id = c.req.param('id');
  await requireRole(c.env, id, user, ['owner']);
  const body = await c.req.json<{ role?: Role }>().catch(() => ({}) as { role?: Role });
  const role: Role = body.role === 'viewer' ? 'viewer' : 'editor';
  const token = randomToken();
  await c.env.DB.prepare(`INSERT INTO invites (token_hash, tree_id, role, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(await sha256(token), id, role, user.id, now(), now() + INVITE_TTL_MS)
    .run();
  return c.json({ link: `${c.env.APP_ORIGIN}/?invite=${encodeURIComponent(token)}`, role, expiresAt: now() + INVITE_TTL_MS }, 201);
});

trees.get('/:id/invites', async (c) => {
  const user = requireUser(c.get('user'));
  const id = c.req.param('id');
  await requireRole(c.env, id, user, ['owner']);
  const rows = await c.env.DB.prepare(
    `SELECT token_hash, role, created_at, expires_at, revoked_at FROM invites WHERE tree_id = ? ORDER BY created_at DESC`,
  )
    .bind(id)
    .all<{ token_hash: string; role: Role; created_at: number; expires_at: number; revoked_at: number | null }>();
  return c.json({
    invites: rows.results.map((r) => ({
      id: r.token_hash.slice(0, 12),
      role: r.role,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      revoked: !!r.revoked_at,
    })),
  });
});

trees.delete('/:id/invites/:inviteId', async (c) => {
  const user = requireUser(c.get('user'));
  const id = c.req.param('id');
  await requireRole(c.env, id, user, ['owner']);
  await c.env.DB.prepare(`UPDATE invites SET revoked_at = ? WHERE tree_id = ? AND token_hash LIKE ?`)
    .bind(now(), id, c.req.param('inviteId') + '%')
    .run();
  return c.json({ ok: true });
});

// ---------- Media (portraits) in R2 ----------

trees.put('/:id/media/:mediaId', async (c) => {
  const user = requireUser(c.get('user'));
  const id = c.req.param('id');
  await requireRole(c.env, id, user, ['owner', 'editor']);
  const mediaId = c.req.param('mediaId');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(mediaId)) throw new HttpError(400, 'bad media id');
  const type = c.req.header('content-type') ?? 'application/octet-stream';
  if (!type.startsWith('image/')) throw new HttpError(415, 'images only');
  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength > MAX_MEDIA_BYTES) throw new HttpError(413, 'image too large');
  await c.env.MEDIA.put(`trees/${id}/media/${mediaId}`, bytes, { httpMetadata: { contentType: type } });
  await c.env.DB.prepare(
    `INSERT OR REPLACE INTO media (id, tree_id, uploaded_by, content_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(mediaId, id, user.id, type, bytes.byteLength, now())
    .run();
  return c.json({ ok: true });
});

trees.get('/:id/media/:mediaId', async (c) => {
  const user = requireUser(c.get('user'));
  const id = c.req.param('id');
  await requireRole(c.env, id, user, ['owner', 'editor', 'viewer']);
  const obj = await c.env.MEDIA.get(`trees/${id}/media/${c.req.param('mediaId')}`);
  if (!obj) throw new HttpError(404, 'media not found');
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
});

trees.delete('/:id/media/:mediaId', async (c) => {
  const user = requireUser(c.get('user'));
  const id = c.req.param('id');
  await requireRole(c.env, id, user, ['owner', 'editor']);
  await c.env.MEDIA.delete(`trees/${id}/media/${c.req.param('mediaId')}`);
  await c.env.DB.prepare(`DELETE FROM media WHERE id = ? AND tree_id = ?`).bind(c.req.param('mediaId'), id).run();
  return c.json({ ok: true });
});

// ---------- Invite acceptance lives outside /trees ----------

export const invites = new Hono<{ Bindings: Env; Variables: Vars }>();

invites.get('/:token', async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT i.tree_id, i.role, i.expires_at, i.revoked_at, t.name FROM invites i JOIN trees t ON t.id = i.tree_id WHERE i.token_hash = ?`,
  )
    .bind(await sha256(c.req.param('token')))
    .first<{ tree_id: string; role: Role; expires_at: number; revoked_at: number | null; name: string }>();
  if (!row || row.revoked_at || row.expires_at < now()) throw new HttpError(404, 'invite not valid');
  return c.json({ treeId: row.tree_id, treeName: row.name, role: row.role });
});

invites.post('/:token/accept', async (c) => {
  const user = requireUser(c.get('user'));
  const row = await c.env.DB.prepare(`SELECT tree_id, role, expires_at, revoked_at FROM invites WHERE token_hash = ?`)
    .bind(await sha256(c.req.param('token')))
    .first<{ tree_id: string; role: Role; expires_at: number; revoked_at: number | null }>();
  if (!row || row.revoked_at || row.expires_at < now()) throw new HttpError(404, 'invite not valid');
  const existing = await roleOf(c.env, row.tree_id, user.id);
  if (!existing) {
    await c.env.DB.prepare(`INSERT INTO tree_members (tree_id, user_id, role, added_at) VALUES (?, ?, ?, ?)`)
      .bind(row.tree_id, user.id, row.role, now())
      .run();
  }
  return c.json({ treeId: row.tree_id, role: existing ?? row.role });
});
