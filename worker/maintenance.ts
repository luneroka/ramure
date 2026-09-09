/**
 * Nightly housekeeping: files nobody references any more, snapshots past
 * their keep, and rows that only mattered for a quarter of an hour.
 */

import { parseGedcom } from '../src/gedcom/parse';
import { RAMURE_MEDIA_SCHEME } from '../src/tree/edit';
import { SESSION_IDLE_MS } from './auth';
import { KEEP_ERRORS_MS } from './errors';
import type { Env } from './env';
import { now } from './util';

const DAY = 24 * 60 * 60 * 1000;
/** A deleted or never-referenced file is kept this long before the reaper takes it. */
export const MEDIA_GRACE_MS = 30 * DAY;
/** Automatic snapshots kept per tree (the unlabelled ones every 100 ops). */
export const KEEP_AUTO_SNAPSHOTS = 20;
/** Guard snapshots (« Avant suppression… ») are kept this long; named versions are kept for good. */
export const KEEP_GUARD_MS = 90 * DAY;
/**
 * An access request is deleted when it becomes an invitation or is declined, so
 * the ones that would otherwise stay for ever belong to people who were refused
 * or never answered — an address and 600 characters of free text about someone
 * with no relationship to the service at all. Ninety days is generous for
 * « somebody asked and we have not decided ».
 */
export const KEEP_ACCESS_REQUESTS_MS = 90 * DAY;

export interface ReapReport {
  filesDeleted: number;
  snapshotsDeleted: number;
  rowsPurged: number;
  /** Files under a tree that no longer exists at all. */
  orphansDeleted: number;
}

/**
 * Files belonging to trees that are gone.
 *
 * `deleteUser` and `DELETE /api/trees/:id` both write their D1 rows before
 * touching R2, on purpose: a crash in between must leave files nothing points
 * at rather than rows pointing at files that are gone. That is only the better
 * failure if something eventually collects them, and the per-tree sweep above
 * cannot — it walks the `trees` table, so a tree with no row is never visited.
 * This is the same shape as the orphaned-backup sweep in backup.ts.
 */
async function reapOrphanedMedia(env: Env): Promise<number> {
  const known = new Set((await env.DB.prepare(`SELECT id FROM trees`).all<{ id: string }>()).results.map((t) => t.id));
  let deleted = 0;
  let cursor: string | undefined;
  do {
    const page = await env.MEDIA.list({ prefix: 'trees/', delimiter: '/', cursor });
    for (const prefix of page.delimitedPrefixes) {
      const treeId = prefix.slice('trees/'.length, -1);
      if (known.has(treeId)) continue;
      let inner: string | undefined;
      do {
        const files = await env.MEDIA.list({ prefix, cursor: inner });
        if (files.objects.length) {
          await env.MEDIA.delete(files.objects.map((o) => o.key));
          deleted += files.objects.length;
        }
        inner = files.truncated ? files.cursor : undefined;
      } while (inner);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return deleted;
}

/** Media ids a document still points at. */
function referencedMedia(doc: string): Set<string> {
  const tree = parseGedcom(doc);
  const ids = new Set<string>(Object.keys(tree.media));
  for (const m of Object.values(tree.media)) if (m.file.startsWith(RAMURE_MEDIA_SCHEME)) ids.add(m.file.slice(RAMURE_MEDIA_SCHEME.length));
  return ids;
}

export async function reap(env: Env, at = now()): Promise<ReapReport> {
  const report: ReapReport = { filesDeleted: 0, snapshotsDeleted: 0, rowsPurged: 0, orphansDeleted: 0 };
  const trees = await env.DB.prepare(`SELECT id, doc FROM trees`).all<{ id: string; doc: string }>();
  for (const t of trees.results) {
    // Files: deleted long enough ago, or never referenced and older than the grace, and not in the document today.
    const candidates = await env.DB.prepare(
      `SELECT id FROM media WHERE tree_id = ? AND ((deleted_at IS NOT NULL AND deleted_at < ?) OR (deleted_at IS NULL AND created_at < ?))`,
    )
      .bind(t.id, at - MEDIA_GRACE_MS, at - MEDIA_GRACE_MS)
      .all<{ id: string }>();
    if (candidates.results.length) {
      const referenced = referencedMedia(t.doc);
      const gone = candidates.results.map((r) => r.id).filter((id) => !referenced.has(id));
      if (gone.length) {
        await env.MEDIA.delete(gone.map((id) => `trees/${t.id}/media/${id}`));
        for (const id of gone) await env.DB.prepare(`DELETE FROM media WHERE id = ? AND tree_id = ?`).bind(id, t.id).run();
        report.filesDeleted += gone.length;
      }
    }
    // A file brought back by an undo is referenced again: clear its deletion mark.
    const marked = await env.DB.prepare(`SELECT id FROM media WHERE tree_id = ? AND deleted_at IS NOT NULL`)
      .bind(t.id)
      .all<{ id: string }>();
    if (marked.results.length) {
      const referenced = referencedMedia(t.doc);
      for (const r of marked.results)
        if (referenced.has(r.id)) await env.DB.prepare(`UPDATE media SET deleted_at = NULL WHERE id = ?`).bind(r.id).run();
    }
    // Snapshots: keep the last N automatic ones, guards for a season, named versions always.
    const autos = await env.DB.prepare(
      `SELECT id FROM tree_snapshots WHERE tree_id = ? AND label IS NULL ORDER BY version DESC, created_at DESC`,
    )
      .bind(t.id)
      .all<{ id: string }>();
    for (const s of autos.results.slice(KEEP_AUTO_SNAPSHOTS)) {
      await env.DB.prepare(`DELETE FROM tree_snapshots WHERE id = ?`).bind(s.id).run();
      report.snapshotsDeleted++;
    }
    const guards = await env.DB.prepare(`DELETE FROM tree_snapshots WHERE tree_id = ? AND label LIKE 'Avant %' AND created_at < ?`)
      .bind(t.id, at - KEEP_GUARD_MS)
      .run();
    report.snapshotsDeleted += guards.meta.changes ?? 0;
  }
  // Short-lived rows.
  for (const sql of [
    `DELETE FROM magic_links WHERE expires_at < ?`,
    `DELETE FROM sessions WHERE expires_at < ?`,
    `DELETE FROM rate_limits WHERE window_start < ?`,
    `DELETE FROM account_invites WHERE expires_at < ?`,
    `DELETE FROM app_invites WHERE expires_at < ? AND used_at IS NULL`,
  ]) {
    const r = await env.DB.prepare(sql)
      .bind(at - DAY)
      .run();
    report.rowsPurged += r.meta.changes ?? 0;
  }
  // Sessions nobody used for a month are over even before their absolute expiry.
  const idle = await env.DB.prepare(`DELETE FROM sessions WHERE COALESCE(last_seen_at, created_at) < ?`)
    .bind(at - SESSION_IDLE_MS)
    .run();
  report.rowsPurged += idle.meta.changes ?? 0;
  const errs = await env.DB.prepare(`DELETE FROM client_errors WHERE at < ?`)
    .bind(at - KEEP_ERRORS_MS)
    .run();
  report.rowsPurged += errs.meta.changes ?? 0;
  const asked = await env.DB.prepare(`DELETE FROM access_requests WHERE requested_at < ?`)
    .bind(at - KEEP_ACCESS_REQUESTS_MS)
    .run();
  report.rowsPurged += asked.meta.changes ?? 0;
  report.orphansDeleted = await reapOrphanedMedia(env);
  return report;
}
