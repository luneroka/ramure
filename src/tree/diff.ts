/**
 * Record-level diff between two trees.
 *
 * Every edit shares untouched records with the previous tree, so the
 * records that changed are exactly the ones whose object identity differs.
 * The result is a `patchRecords` op that turns `after` back into `before`:
 * a generic, replayable inverse for any edit, which is how undo and redo
 * become ordinary ops that sync like everything else.
 */

import type { Family, Individual, Lead, MediaObject, Tree } from '../gedcom/model';

export interface RecordPatch {
  t: 'patchRecords';
  /** Records to set (value) or remove (null). */
  individuals: Record<string, Individual | null>;
  families: Record<string, Family | null>;
  media: Record<string, MediaObject | null>;
  /** Tree-wide resources, when they changed. */
  resources?: Lead[];
  documentIds?: string[];
}

function diffTable<T>(from: Record<string, T>, to: Record<string, T>): Record<string, T | null> {
  const out: Record<string, T | null> = {};
  for (const id of Object.keys(to)) if (from[id] !== to[id]) out[id] = to[id]!;
  for (const id of Object.keys(from)) if (!(id in to)) out[id] = null;
  return out;
}

/** The patch that transforms `from` into `to`. */
export function diffTrees(from: Tree, to: Tree): RecordPatch {
  return {
    t: 'patchRecords',
    individuals: diffTable(from.individuals, to.individuals),
    families: diffTable(from.families, to.families),
    media: diffTable(from.media, to.media),
    ...(from.resources !== to.resources ? { resources: to.resources } : {}),
    ...(from.documentIds !== to.documentIds ? { documentIds: to.documentIds } : {}),
  };
}

export function isEmptyPatch(p: RecordPatch): boolean {
  return (
    Object.keys(p.individuals).length === 0 &&
    Object.keys(p.families).length === 0 &&
    Object.keys(p.media).length === 0 &&
    p.resources === undefined &&
    p.documentIds === undefined
  );
}

function applyTable<T>(table: Record<string, T>, patch: Record<string, T | null>): Record<string, T> {
  const out = { ...table };
  for (const [id, value] of Object.entries(patch)) {
    if (value === null) delete out[id];
    else out[id] = value;
  }
  return out;
}

export function applyRecordPatch(tree: Tree, p: RecordPatch): Tree {
  return {
    ...tree,
    individuals: applyTable(tree.individuals, p.individuals),
    families: applyTable(tree.families, p.families),
    media: applyTable(tree.media, p.media),
    ...(p.resources ? { resources: p.resources } : {}),
    ...(p.documentIds ? { documentIds: p.documentIds } : {}),
  };
}
