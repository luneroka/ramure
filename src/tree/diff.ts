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
import { EditError } from './edit';

export interface RecordPatch {
  t: 'patchRecords';
  /** Records to set (value) or remove (null). */
  individuals: Record<string, Individual | null>;
  families: Record<string, Family | null>;
  media: Record<string, MediaObject | null>;
  /** Tree-wide resources, when they changed. */
  resources?: Lead[];
  documentIds?: string[];
  /** What each touched record looked like before, as a fingerprint; the patch is refused if any moved since. */
  expect?: Record<string, string>;
}

/** A small stable fingerprint of a record: enough to notice that someone else changed it. */
export function fingerprint(value: unknown): string {
  const text = JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v,
  );
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + text.length.toString(36);
}

function diffTable<T>(from: Record<string, T>, to: Record<string, T>): Record<string, T | null> {
  const out: Record<string, T | null> = {};
  for (const id of Object.keys(to)) if (from[id] !== to[id]) out[id] = to[id]!;
  for (const id of Object.keys(from)) if (!(id in to)) out[id] = null;
  return out;
}

/** The patch that transforms `from` into `to`, expecting the records to still be as in `from`. */
export function diffTrees(from: Tree, to: Tree): RecordPatch {
  const individuals = diffTable(from.individuals, to.individuals);
  const families = diffTable(from.families, to.families);
  const media = diffTable(from.media, to.media);
  const expect: Record<string, string> = {};
  for (const id of Object.keys(individuals)) expect[`I:${id}`] = fingerprint(from.individuals[id] ?? null);
  for (const id of Object.keys(families)) expect[`F:${id}`] = fingerprint(from.families[id] ?? null);
  for (const id of Object.keys(media)) expect[`M:${id}`] = fingerprint(from.media[id] ?? null);
  return {
    t: 'patchRecords',
    individuals,
    families,
    media,
    expect,
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
  if (p.expect) {
    for (const [key, fp] of Object.entries(p.expect)) {
      const [kind, id] = [key.slice(0, 1), key.slice(2)];
      const current = kind === 'I' ? tree.individuals[id] : kind === 'F' ? tree.families[id] : tree.media[id];
      if (fingerprint(current ?? null) !== fp) throw new EditError('record_changed', id);
    }
  }
  return repairLinks({
    ...tree,
    individuals: applyTable(tree.individuals, p.individuals),
    families: applyTable(tree.families, p.families),
    media: applyTable(tree.media, p.media),
    ...(p.resources ? { resources: p.resources } : {}),
    ...(p.documentIds ? { documentIds: p.documentIds } : {}),
  });
}

/** Drop links to records that no longer exist, so a patch never leaves a family pointing at nobody. */
export function repairLinks(tree: Tree): Tree {
  let individuals = tree.individuals;
  let families = tree.families;
  for (const fam of Object.values(tree.families)) {
    const childIds = fam.childIds.filter((c) => tree.individuals[c]);
    const husbandId = fam.husbandId && tree.individuals[fam.husbandId] ? fam.husbandId : undefined;
    const wifeId = fam.wifeId && tree.individuals[fam.wifeId] ? fam.wifeId : undefined;
    if (childIds.length !== fam.childIds.length || husbandId !== fam.husbandId || wifeId !== fam.wifeId) {
      const next: Family = { ...fam, childIds };
      if (husbandId) next.husbandId = husbandId;
      else delete next.husbandId;
      if (wifeId) next.wifeId = wifeId;
      else delete next.wifeId;
      families = { ...families, [fam.id]: next };
    }
  }
  for (const ind of Object.values(tree.individuals)) {
    const childOf = ind.childOf.filter((l) => families[l.familyId]);
    const partnerIn = ind.partnerIn.filter((f) => families[f]);
    if (childOf.length !== ind.childOf.length || partnerIn.length !== ind.partnerIn.length) {
      individuals = { ...individuals, [ind.id]: { ...ind, childOf, partnerIn } };
    }
  }
  return individuals === tree.individuals && families === tree.families ? tree : { ...tree, individuals, families };
}
