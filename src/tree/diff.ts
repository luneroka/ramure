/**
 * Record-level diff between two trees.
 *
 * Every edit shares untouched records with the previous tree, so the
 * records that changed are exactly the ones whose object identity differs.
 * The result is a `patchRecords` op that turns `after` back into `before`:
 * a generic, replayable inverse for any edit, which is how undo and redo
 * become ordinary ops that sync like everything else.
 *
 * A graft (records brought in from a GEDCOM file, see graft.ts) travels the
 * same way, as the records it sets, with one difference: it never removes.
 */

import type { Family, Individual, Lead, MediaObject, Repository, Source, Tree } from '../gedcom/model';
import { EditError } from './edit';

export interface RecordPatch {
  t: 'patchRecords';
  /** Records to set (value) or remove (null). */
  individuals: Record<string, Individual | null>;
  families: Record<string, Family | null>;
  media: Record<string, MediaObject | null>;
  /** Sources and repositories, when they changed. Absent from patches written before they were covered. */
  sources?: Record<string, Source | null>;
  repositories?: Record<string, Repository | null>;
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
  const sources = diffTable(from.sources, to.sources);
  const repositories = diffTable(from.repositories, to.repositories);
  const expect: Record<string, string> = {};
  for (const id of Object.keys(individuals)) expect[`I:${id}`] = fingerprint(from.individuals[id] ?? null);
  for (const id of Object.keys(families)) expect[`F:${id}`] = fingerprint(from.families[id] ?? null);
  for (const id of Object.keys(media)) expect[`M:${id}`] = fingerprint(from.media[id] ?? null);
  for (const id of Object.keys(sources)) expect[`S:${id}`] = fingerprint(from.sources[id] ?? null);
  for (const id of Object.keys(repositories)) expect[`R:${id}`] = fingerprint(from.repositories[id] ?? null);
  return {
    t: 'patchRecords',
    individuals,
    families,
    media,
    ...(Object.keys(sources).length ? { sources } : {}),
    ...(Object.keys(repositories).length ? { repositories } : {}),
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
    Object.keys(p.sources ?? {}).length === 0 &&
    Object.keys(p.repositories ?? {}).length === 0 &&
    p.resources === undefined &&
    p.documentIds === undefined
  );
}

/**
 * Keys that are not record ids, whatever a patch says.
 *
 * A patch table comes from a client, and `out[id] = value` on a plain object
 * invokes the `__proto__` setter rather than writing a property — which would
 * leave the table with an attacker-chosen prototype, so a lookup for an id that
 * does not exist could answer with a planted record. Object.prototype is never
 * touched and serialisation only ever walks own properties, so the reachable
 * harm is a corrupted document by someone who can already edit the tree. It is
 * still not a key anyone means, and the guard costs nothing.
 */
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function applyTable<T>(table: Record<string, T>, patch: Record<string, T | null>): Record<string, T> {
  const out = { ...table };
  for (const [id, value] of Object.entries(patch)) {
    if (RESERVED_KEYS.has(id)) continue;
    if (value === null) delete out[id];
    else out[id] = value;
  }
  return out;
}

/** The table an `expect` key points into: I, F, S, R, and media for the rest (M). */
function tableFor(tree: Tree, kind: string): Record<string, unknown> {
  return kind === 'I'
    ? tree.individuals
    : kind === 'F'
      ? tree.families
      : kind === 'S'
        ? tree.sources
        : kind === 'R'
          ? tree.repositories
          : tree.media;
}

export function applyRecordPatch(tree: Tree, p: RecordPatch): Tree {
  if (p.expect) {
    for (const [key, fp] of Object.entries(p.expect)) {
      const [kind, id] = [key.slice(0, 1), key.slice(2)];
      const current = tableFor(tree, kind)[id];
      if (fingerprint(current ?? null) !== fp) throw new EditError('record_changed', id);
    }
  }
  return repairLinks({
    ...tree,
    individuals: applyTable(tree.individuals, p.individuals),
    families: applyTable(tree.families, p.families),
    media: applyTable(tree.media, p.media),
    ...(p.sources ? { sources: applyTable(tree.sources, p.sources) } : {}),
    ...(p.repositories ? { repositories: applyTable(tree.repositories, p.repositories) } : {}),
    ...(p.resources ? { resources: p.resources } : {}),
    ...(p.documentIds ? { documentIds: p.documentIds } : {}),
  });
}

/** Records brought in from a GEDCOM file (graft.ts): new ones, and known ones with what they lacked. Never a removal. */
export interface GraftRecords {
  t: 'graft';
  /** The file's name, for the history and for the version kept before it. */
  file: string;
  individuals: Record<string, Individual>;
  families: Record<string, Family>;
  sources: Record<string, Source>;
  repositories: Record<string, Repository>;
  media: Record<string, MediaObject>;
  /** Each record it sets, as it was when the graft was planned; the graft is refused if any moved since. */
  expect: Record<string, string>;
}

export function applyGraft(tree: Tree, g: GraftRecords): Tree {
  const tables = [g.individuals, g.families, g.sources, g.repositories, g.media];
  for (const table of tables) {
    if (!table || typeof table !== 'object') throw new EditError('graft_removes');
    for (const [id, record] of Object.entries(table)) {
      // A graft only adds: a null here would be a removal, and a record filed under another id a dangling one.
      if (!record || typeof record !== 'object' || (record as { id?: unknown }).id !== id) throw new EditError('graft_removes', id);
    }
  }
  return applyRecordPatch(tree, {
    t: 'patchRecords',
    individuals: g.individuals,
    families: g.families,
    media: g.media,
    sources: g.sources,
    repositories: g.repositories,
    expect: g.expect,
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
