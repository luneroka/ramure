/**
 * Nightly copies of every tree's document in R2, one file per day and per
 * tree, kept for a season. The document is the GEDCOM text itself, so a
 * copy is readable anywhere, with or without Ramure.
 */

import type { Env } from './env';
import { now } from './util';

const DAY = 24 * 60 * 60 * 1000;
/** Daily copies older than this go; the newest copy of a tree is always kept. */
export const KEEP_BACKUPS_MS = 30 * DAY;
export const BACKUP_PREFIX = 'backups/';

export interface BackupReport {
  written: number;
  skipped: number;
  deleted: number;
}

const dayOf = (t: number): string => new Date(t).toISOString().slice(0, 10);
export const backupKey = (treeId: string, t: number): string => `${BACKUP_PREFIX}${treeId}/${dayOf(t)}.ged`;

/** Write today's copy of each tree that changed since its last copy; drop copies past their keep. */
export async function backup(env: Env, at = now()): Promise<BackupReport> {
  const report: BackupReport = { written: 0, skipped: 0, deleted: 0 };
  const trees = await env.DB.prepare(`SELECT id, name, version, doc FROM trees`).all<{
    id: string;
    name: string;
    version: number;
    doc: string;
  }>();
  for (const t of trees.results) {
    const latest = await env.MEDIA.head(`${BACKUP_PREFIX}${t.id}/latest`);
    const lastVersion = Number(latest?.customMetadata?.version ?? -1);
    if (lastVersion === t.version) {
      report.skipped++;
    } else {
      const meta = {
        customMetadata: { version: String(t.version), name: t.name },
        httpMetadata: { contentType: 'text/plain; charset=utf-8' },
      };
      await env.MEDIA.put(backupKey(t.id, at), t.doc, meta);
      await env.MEDIA.put(`${BACKUP_PREFIX}${t.id}/latest`, t.doc, meta);
      report.written++;
    }
    // Retention: dated copies older than the keep, never the only one.
    const copies: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await env.MEDIA.list({ prefix: `${BACKUP_PREFIX}${t.id}/`, cursor });
      for (const o of page.objects) if (o.key.endsWith('.ged')) copies.push(o.key);
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    copies.sort();
    const cutoff = dayOf(at - KEEP_BACKUPS_MS);
    const old = copies.slice(0, -1).filter((k) => k.slice(-14, -4) < cutoff);
    if (old.length) {
      await env.MEDIA.delete(old);
      report.deleted += old.length;
    }
  }
  // Trees that no longer exist keep their copies for the same season, then go entirely.
  const known = new Set(trees.results.map((t) => t.id));
  const top = await env.MEDIA.list({ prefix: BACKUP_PREFIX, delimiter: '/' });
  for (const prefix of top.delimitedPrefixes) {
    const treeId = prefix.slice(BACKUP_PREFIX.length, -1);
    if (known.has(treeId)) continue;
    const page = await env.MEDIA.list({ prefix });
    const cutoff = dayOf(at - KEEP_BACKUPS_MS);
    const dated = page.objects.filter((o) => o.key.endsWith('.ged')).map((o) => o.key);
    const old = dated.filter((k) => k.slice(-14, -4) < cutoff);
    const gone = old.length === dated.length ? page.objects.map((o) => o.key) : old;
    if (gone.length) {
      await env.MEDIA.delete(gone);
      report.deleted += old.length;
    }
  }
  return report;
}

/** The dated copies of one tree, newest first. */
export async function listBackups(env: Env, treeId: string): Promise<Array<{ day: string; size: number }>> {
  const out: Array<{ day: string; size: number }> = [];
  let cursor: string | undefined;
  do {
    const page = await env.MEDIA.list({ prefix: `${BACKUP_PREFIX}${treeId}/`, cursor });
    for (const o of page.objects) if (o.key.endsWith('.ged')) out.push({ day: o.key.slice(-14, -4), size: o.size });
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return out.sort((a, b) => (a.day < b.day ? 1 : -1));
}
