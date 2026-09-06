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
import { HttpError, now, randomId } from './util';

const MAX_DOC_BYTES = 25 * 1024 * 1024;
const MAX_OPS_PER_PUSH = 500;
const SNAPSHOT_EVERY = 100;
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

import { requireAccountRole, requireUser } from './accounts';

/** A tree's role derives from the account that owns it: account owners own, members edit. */
async function roleOf(env: Env, treeId: string, userId: string): Promise<Role | null> {
  const row = await env.DB.prepare(
    `SELECT m.role FROM trees t JOIN account_members m ON m.account_id = t.account_id WHERE t.id = ? AND m.user_id = ?`,
  )
    .bind(treeId, userId)
    .first<{ role: 'owner' | 'member' }>();
  if (!row) return null;
  return row.role === 'owner' ? 'owner' : 'editor';
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
  const accountId = c.req.query('account');
  if (!accountId) throw new HttpError(400, 'account required');
  const role = await requireAccountRole(c.env, accountId, user, ['owner', 'member']);
  const rows = await c.env.DB.prepare(
    `SELECT id, name, version, people, updated_at FROM trees WHERE account_id = ? ORDER BY updated_at DESC`,
  )
    .bind(accountId)
    .all<{ id: string; name: string; version: number; people: number; updated_at: number }>();
  return c.json({ trees: rows.results.map((r) => ({ ...r, role: role === 'owner' ? 'owner' : 'editor' })) });
});

trees.post('/', async (c) => {
  const user = requireUser(c.get('user'));
  const body = await c.req.json<{ accountId?: string; name?: string; gedcom?: string }>();
  const accountId = String(body.accountId ?? '');
  const accRole = await requireAccountRole(c.env, accountId, user, ['owner', 'member']);
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
  await c.env.DB.prepare(
    `INSERT INTO trees (id, name, owner_id, account_id, version, doc, people, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)`,
  )
    .bind(id, name, user.id, accountId, doc, Object.keys(tree.individuals).length, ts, ts)
    .run();
  return c.json({ id, name, version: 0, role: (accRole === 'owner' ? 'owner' : 'editor') as Role }, 201);
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
    `SELECT s.id, s.version, s.created_at, s.label, u.name AS by_name, u.email AS by_email FROM tree_snapshots s LEFT JOIN users u ON u.id = s.created_by WHERE s.tree_id = ? ORDER BY s.created_at DESC LIMIT 100`,
  )
    .bind(id)
    .all<{ id: string; version: number; created_at: number; label: string | null; by_name: string | null; by_email: string | null }>();
  return c.json({
    snapshots: rows.results.map((r) => ({
      id: r.id,
      version: r.version,
      created_at: r.created_at,
      label: r.label,
      by: r.by_name || r.by_email || null,
    })),
  });
});

/** Save a named version of the current document. */
trees.post('/:id/snapshots', async (c) => {
  const user = requireUser(c.get('user'));
  const id = c.req.param('id');
  await requireRole(c.env, id, user, ['owner', 'editor']);
  const body = await c.req.json<{ label?: string }>().catch(() => ({}) as { label?: string });
  const label =
    String(body.label ?? '')
      .trim()
      .slice(0, 120) || null;
  const row = await c.env.DB.prepare(`SELECT version, doc FROM trees WHERE id = ?`).bind(id).first<{ version: number; doc: string }>();
  if (!row) throw new HttpError(404, 'tree not found');
  const sid = randomId('S');
  const ts = now();
  await c.env.DB.prepare(
    `INSERT INTO tree_snapshots (id, tree_id, version, doc, created_at, label, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(sid, id, row.version, row.doc, ts, label, user.id)
    .run();
  return c.json({ id: sid, version: row.version, created_at: ts, label }, 201);
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
