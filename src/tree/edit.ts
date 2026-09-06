/**
 * Editing operations on a Tree. Every function is pure: it returns a new Tree
 * that shares untouched records with the old one, so undo/redo is a stack of
 * Tree references and nothing is ever mutated in place.
 */

import {
  newEvent,
  newFamily,
  newIndividual,
  type Event,
  type EventType,
  type Family,
  type Individual,
  type Lead,
  type MediaObject,
  type Name,
  type Sex,
  type Tree,
} from '../gedcom/model';
import { newId } from './ids';

export interface EditResult {
  tree: Tree;
  /** Id of the record the user will most likely want to look at next. */
  focusId?: string;
}

/** Ids for records an operation may create. Callers that need replayable operations allocate them up front. */
export interface NewIds {
  person?: string;
  family?: string;
}

// ---------- Small immutable helpers ----------

export function nextId(tree: Tree, prefix: 'I' | 'F' | 'S' | 'R' | 'M'): string {
  const table =
    prefix === 'I'
      ? tree.individuals
      : prefix === 'F'
        ? tree.families
        : prefix === 'S'
          ? tree.sources
          : prefix === 'R'
            ? tree.repositories
            : tree.media;
  let max = 0;
  for (const id of Object.keys(table)) {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${max + 1}`;
}

function withIndividual(tree: Tree, ind: Individual): Tree {
  return { ...tree, individuals: { ...tree.individuals, [ind.id]: ind } };
}

function withFamily(tree: Tree, fam: Family): Tree {
  return { ...tree, families: { ...tree.families, [fam.id]: fam } };
}

function withoutIndividual(tree: Tree, id: string): Tree {
  const individuals = { ...tree.individuals };
  delete individuals[id];
  return { ...tree, individuals };
}

function withoutFamily(tree: Tree, id: string): Tree {
  const families = { ...tree.families };
  delete families[id];
  return { ...tree, families };
}

function must(tree: Tree, id: string): Individual {
  const ind = tree.individuals[id];
  if (!ind) throw new Error(`Unknown person ${id}`);
  return ind;
}

// ---------- People ----------

export interface NewPerson {
  given?: string;
  surname?: string;
  sex?: Sex;
}

export function createPerson(tree: Tree, data: NewPerson = {}, id: string = newId('I')): EditResult {
  if (tree.individuals[id]) throw new Error(`Duplicate id ${id}`);
  const ind = newIndividual(id);
  ind.sex = data.sex ?? 'U';
  ind.names = [{ given: data.given ?? '', surname: data.surname ?? '' }];
  return { tree: withIndividual(tree, ind), focusId: id };
}

export interface PersonPatch {
  names?: Name[];
  sex?: Sex;
  events?: Event[];
  notes?: string[];
  restriction?: string | undefined;
  /** New portrait media record to attach as the main picture; null removes the current one. */
  portrait?: MediaObject | null;
  /** Marked as needing another look; undefined clears it. */
  unsure?: boolean | undefined;
  /** Research leads, replaced wholesale. */
  leads?: Lead[];
  /** Media records to add or update in the tree (documents). */
  media?: MediaObject[];
  /** Attached media, in order; index 0 is the portrait. */
  mediaIds?: string[];
}

/** Media stored by Ramure itself use this scheme in FILE; the blob lives in IndexedDB under the media id. */
export const RAMURE_MEDIA_SCHEME = 'ramure:';

/** The main picture of a person: the first attached media. */
export function portraitId(ind: Individual, tree?: Tree): string | undefined {
  if (!tree) return ind.mediaIds[0];
  const flagged = ind.mediaIds.find((id) => tree.media[id]?.primary);
  if (flagged) return flagged;
  // Imported trees: the first attached picture without a document kind. Documents never become the face.
  return ind.mediaIds.find((id) => {
    const m = tree.media[id];
    return !!m && m.kind === undefined;
  });
}

export function updatePerson(tree: Tree, id: string, patch: PersonPatch): EditResult {
  const ind = must(tree, id);
  const { portrait, media, ...rest } = patch;
  const next: Individual = { ...ind, ...rest };
  if (patch.restriction === undefined && 'restriction' in patch) delete next.restriction;
  if (!patch.unsure && 'unsure' in patch) delete next.unsure;
  let t = tree;
  if (media?.length) {
    const table = { ...t.media };
    for (const m of media) table[m.id] = m;
    t = { ...t, media: table };
  }
  if (portrait === null) {
    const current = portraitId(ind, t);
    next.mediaIds = (rest.mediaIds ?? ind.mediaIds).filter((m) => m !== current);
  } else if (portrait) {
    const table = { ...t.media, [portrait.id]: { ...portrait, primary: true } };
    for (const id of ind.mediaIds) if (id !== portrait.id && table[id]?.primary) table[id] = { ...table[id]!, primary: false };
    t = { ...t, media: table };
    next.mediaIds = [portrait.id, ...(rest.mediaIds ?? ind.mediaIds).filter((m) => m !== portrait.id)];
  }
  return { tree: withIndividual(t, next), focusId: id };
}

/** Remove a person and every reference to them. Families left with no partners and no children are removed too. */
export function deletePerson(tree: Tree, id: string): EditResult {
  const ind = must(tree, id);
  let t = withoutIndividual(tree, id);
  const touched = new Set([...ind.childOf.map((l) => l.familyId), ...ind.partnerIn]);
  for (const fid of touched) {
    const fam = t.families[fid];
    if (!fam) continue;
    const next: Family = {
      ...fam,
      husbandId: fam.husbandId === id ? undefined : fam.husbandId,
      wifeId: fam.wifeId === id ? undefined : fam.wifeId,
      childIds: fam.childIds.filter((c) => c !== id),
    };
    if (!next.husbandId && !next.wifeId && next.childIds.length === 0) t = withoutFamily(t, fid);
    else if (!next.husbandId && !next.wifeId && next.childIds.length === 1 && next.events.length === 0) {
      // A lone child in a parentless family: drop the family and the child's link.
      const cid = next.childIds[0]!;
      const child = t.individuals[cid];
      if (child) t = withIndividual(t, { ...child, childOf: child.childOf.filter((l) => l.familyId !== fid) });
      t = withoutFamily(t, fid);
    } else t = withFamily(t, next);
  }
  // Adoption events pointing at removed families are left as-is; they carry their own family id.
  const nextFocus =
    ind.partnerIn
      .map((f) => tree.families[f])
      .flatMap((f) => [f?.husbandId, f?.wifeId])
      .find((p) => p && p !== id && t.individuals[p]) ??
    ind.childOf
      .map((l) => tree.families[l.familyId])
      .flatMap((f) => [f?.husbandId, f?.wifeId])
      .find((p) => p && t.individuals[p]) ??
    Object.keys(t.individuals)[0];
  return { tree: t, focusId: nextFocus };
}

// ---------- Relationships ----------

/** The family a person was born into, creating an empty one if needed. */
function birthFamily(tree: Tree, childId: string, familyId: string = newId('F')): { tree: Tree; fam: Family } {
  const child = must(tree, childId);
  const link = child.childOf.find((l) => l.pedigree === 'birth') ?? child.childOf[0];
  const existing = link ? tree.families[link.familyId] : undefined;
  if (existing) return { tree, fam: existing };
  const fam = newFamily(familyId);
  fam.childIds = [childId];
  let t = withFamily(tree, fam);
  t = withIndividual(t, { ...child, childOf: [...child.childOf, { familyId: fam.id, pedigree: 'birth' }] });
  return { tree: t, fam };
}

/**
 * Add a parent to a person. `slot` picks father (HUSB) or mother (WIFE). If the
 * slot is already filled, the existing family is kept and a new one is not
 * created: a person has at most one birth family here.
 */
export function addParent(tree: Tree, childId: string, slot: 'father' | 'mother', data: NewPerson = {}, ids: NewIds = {}): EditResult {
  const { tree: t0, fam } = birthFamily(tree, childId, ids.family);
  if (slot === 'father' && fam.husbandId) throw new Error('already has a father');
  if (slot === 'mother' && fam.wifeId) throw new Error('already has a mother');
  const child = must(t0, childId);
  const surname = data.surname ?? (slot === 'father' ? (child.names[0]?.surname ?? '') : '');
  const created = createPerson(t0, { ...data, surname, sex: data.sex ?? (slot === 'father' ? 'M' : 'F') }, ids.person);
  const pid = created.focusId!;
  let t = created.tree;
  const parent = must(t, pid);
  t = withIndividual(t, { ...parent, partnerIn: [fam.id] });
  t = withFamily(t, { ...fam, husbandId: slot === 'father' ? pid : fam.husbandId, wifeId: slot === 'mother' ? pid : fam.wifeId });
  return { tree: t, focusId: pid };
}

/** Add a new partner: creates a new family with both people. */
export function addPartner(tree: Tree, personId: string, data: NewPerson = {}, ids: NewIds = {}): EditResult {
  const person = must(tree, personId);
  const sex = data.sex ?? (person.sex === 'M' ? 'F' : person.sex === 'F' ? 'M' : 'U');
  const created = createPerson(tree, { ...data, sex }, ids.person);
  const pid = created.focusId!;
  let t = created.tree;
  const fam = newFamily(ids.family ?? newId('F'));
  const personIsHusband = person.sex === 'M' || (person.sex === 'U' && sex === 'F');
  fam.husbandId = personIsHusband ? personId : pid;
  fam.wifeId = personIsHusband ? pid : personId;
  t = withFamily(t, fam);
  t = withIndividual(t, { ...must(t, personId), partnerIn: [...person.partnerIn, fam.id] });
  t = withIndividual(t, { ...must(t, pid), partnerIn: [fam.id] });
  return { tree: t, focusId: pid };
}

/**
 * Add a child. With `familyId` the child goes into that family; otherwise into
 * the person's only family, or a new single-parent family if they have none
 * (or several, in which case the caller should pick).
 */
export function addChild(tree: Tree, personId: string, data: NewPerson = {}, familyId?: string, ids: NewIds = {}): EditResult {
  const person = must(tree, personId);
  let t = tree;
  let fam: Family | undefined = familyId
    ? t.families[familyId]
    : person.partnerIn.length === 1
      ? t.families[person.partnerIn[0]!]
      : undefined;
  if (!fam) {
    if (person.partnerIn.length > 1 && !familyId) throw new Error('choose a family');
    fam = newFamily(ids.family ?? newId('F'));
    if (person.sex === 'F') fam.wifeId = personId;
    else fam.husbandId = personId;
    t = withFamily(t, fam);
    t = withIndividual(t, { ...person, partnerIn: [...person.partnerIn, fam.id] });
  }
  const father = fam.husbandId ? t.individuals[fam.husbandId] : undefined;
  const surname = data.surname ?? father?.names[0]?.surname ?? person.names[0]?.surname ?? '';
  const created = createPerson(t, { ...data, surname }, ids.person);
  const cid = created.focusId!;
  t = created.tree;
  t = withIndividual(t, { ...must(t, cid), childOf: [{ familyId: fam.id, pedigree: 'birth' }] });
  t = withFamily(t, { ...must_family(t, fam.id), childIds: [...must_family(t, fam.id).childIds, cid] });
  return { tree: t, focusId: cid };
}

function must_family(tree: Tree, id: string): Family {
  const f = tree.families[id];
  if (!f) throw new Error(`Unknown family ${id}`);
  return f;
}

/** Add a sibling: a new child of the person's birth family, created if needed. */
export function addSibling(tree: Tree, personId: string, data: NewPerson = {}, ids: NewIds = {}): EditResult {
  const { tree: t0, fam } = birthFamily(tree, personId, ids.family);
  const person = must(t0, personId);
  const surname = data.surname ?? person.names[0]?.surname ?? '';
  const created = createPerson(t0, { ...data, surname }, ids.person);
  const sid = created.focusId!;
  let t = created.tree;
  t = withIndividual(t, { ...must(t, sid), childOf: [{ familyId: fam.id, pedigree: 'birth' }] });
  const f = must_family(t, fam.id);
  // Keep siblings in birth order when both have years, else append.
  const year = (id: string) => t.individuals[id]?.events.find((e) => e.type === 'birth')?.date?.date?.year;
  const order = [...f.childIds, sid];
  const y = year(sid);
  if (y !== undefined) order.sort((a, b) => (year(a) ?? Infinity) - (year(b) ?? Infinity));
  t = withFamily(t, { ...f, childIds: order });
  return { tree: t, focusId: sid };
}

/** Link an existing person as a child of a family. */
export function linkChild(tree: Tree, familyId: string, childId: string): EditResult {
  const fam = must_family(tree, familyId);
  const child = must(tree, childId);
  if (fam.childIds.includes(childId)) return { tree, focusId: childId };
  if (childId === fam.husbandId || childId === fam.wifeId) throw new Error('cannot be own child');
  let t = withFamily(tree, { ...fam, childIds: [...fam.childIds, childId] });
  t = withIndividual(t, { ...child, childOf: [...child.childOf, { familyId, pedigree: 'birth' }] });
  return { tree: t, focusId: childId };
}

/** Remove a child from a family without deleting anyone. */
export function unlinkChild(tree: Tree, familyId: string, childId: string): EditResult {
  const fam = must_family(tree, familyId);
  const child = must(tree, childId);
  let t = withFamily(tree, { ...fam, childIds: fam.childIds.filter((c) => c !== childId) });
  t = withIndividual(t, { ...child, childOf: child.childOf.filter((l) => l.familyId !== familyId) });
  const f = must_family(t, familyId);
  if (!f.husbandId && !f.wifeId && f.childIds.length === 0) t = withoutFamily(t, familyId);
  return { tree: t, focusId: childId };
}

/** Link an existing person as the partner in a family with a free slot, or in a new family. */
export function linkPartner(tree: Tree, personId: string, partnerId: string, ids: NewIds = {}): EditResult {
  if (personId === partnerId) throw new Error('same person');
  const person = must(tree, personId),
    partner = must(tree, partnerId);
  const already = person.partnerIn.map((f) => tree.families[f]).find((f) => f && (f.husbandId === partnerId || f.wifeId === partnerId));
  if (already) return { tree, focusId: partnerId };
  const fam = newFamily(ids.family ?? newId('F'));
  const personIsHusband = person.sex === 'M' || (person.sex === 'U' && partner.sex === 'F');
  fam.husbandId = personIsHusband ? personId : partnerId;
  fam.wifeId = personIsHusband ? partnerId : personId;
  fam.unionType = 'unknown';
  let t = withFamily(tree, fam);
  t = withIndividual(t, { ...person, partnerIn: [...person.partnerIn, fam.id] });
  t = withIndividual(t, { ...must(t, partnerId), partnerIn: [...partner.partnerIn, fam.id] });
  return { tree: t, focusId: partnerId };
}

/** Replace the tree-wide research resources. */
export function setResources(tree: Tree, resources: Lead[]): EditResult {
  return { tree: { ...tree, resources } };
}

export interface TreePatch {
  /** Links useful to the whole tree, replaced wholesale. */
  resources?: Lead[];
  /** Media records to add or update. */
  media?: MediaObject[];
  /** The tree's own documents, in order. */
  documentIds?: string[];
}

/** Tree-level things that are not people: resources and the tree's documents. */
export function updateTree(tree: Tree, patch: TreePatch): EditResult {
  let t = tree;
  if (patch.media?.length) {
    const table = { ...t.media };
    for (const m of patch.media) table[m.id] = m;
    t = { ...t, media: table };
  }
  if (patch.resources) t = { ...t, resources: patch.resources };
  if (patch.documentIds) t = { ...t, documentIds: patch.documentIds };
  return { tree: t };
}

export interface FamilyPatch {
  events?: Event[];
  notes?: string[];
  unionType?: Family['unionType'];
  childIds?: string[];
}

export function updateFamily(tree: Tree, id: string, patch: FamilyPatch): EditResult {
  const fam = must_family(tree, id);
  return { tree: withFamily(tree, { ...fam, ...patch }) };
}

// ---------- Merge ----------

/**
 * Merge `dropId` into `keepId`. Names, events, notes, citations and media are
 * appended; family links are moved; families that end up describing the same
 * couple are merged too.
 */
export function mergePeople(tree: Tree, keepId: string, dropId: string): EditResult {
  if (keepId === dropId) throw new Error('same person');
  const keep = must(tree, keepId),
    drop = must(tree, dropId);
  const dedupeNames = (a: Name[], b: Name[]) => {
    const key = (n: Name) => `${n.given.trim().toLowerCase()}|${n.surname.trim().toLowerCase()}|${n.type ?? ''}`;
    const seen = new Set(a.map(key));
    return [...a, ...b.filter((n) => !seen.has(key(n)))];
  };
  const dedupeEvents = (a: Event[], b: Event[]) => {
    const key = (e: Event) => `${e.type}|${e.customType ?? ''}|${e.date?.raw ?? ''}|${e.place?.text ?? ''}|${e.value ?? ''}`;
    const seen = new Set(a.map(key));
    return [...a, ...b.filter((e) => !seen.has(key(e)))];
  };
  let t = tree;
  const merged: Individual = {
    ...keep,
    names: dedupeNames(keep.names, drop.names),
    sex: keep.sex === 'U' ? drop.sex : keep.sex,
    events: dedupeEvents(keep.events, drop.events),
    notes: [...keep.notes, ...drop.notes.filter((n) => !keep.notes.includes(n))],
    citations: [...keep.citations, ...drop.citations],
    mediaIds: [...new Set([...keep.mediaIds, ...drop.mediaIds])],
    childOf: [...keep.childOf],
    partnerIn: [...keep.partnerIn],
    restriction: keep.restriction ?? drop.restriction,
    extra: [...keep.extra, ...drop.extra],
  };
  // Move family memberships.
  for (const link of drop.childOf) {
    const fam = t.families[link.familyId];
    if (!fam) continue;
    if (!merged.childOf.some((l) => l.familyId === fam.id)) merged.childOf.push(link);
    t = withFamily(t, {
      ...fam,
      childIds: fam.childIds.map((c) => (c === dropId ? keepId : c)).filter((c, i, arr) => arr.indexOf(c) === i),
    });
  }
  for (const fid of drop.partnerIn) {
    const fam = t.families[fid];
    if (!fam) continue;
    if (!merged.partnerIn.includes(fid)) merged.partnerIn.push(fid);
    t = withFamily(t, {
      ...fam,
      husbandId: fam.husbandId === dropId ? keepId : fam.husbandId,
      wifeId: fam.wifeId === dropId ? keepId : fam.wifeId,
    });
  }
  t = withoutIndividual(t, dropId);
  t = withIndividual(t, merged);
  // Merge families that now describe the same couple.
  const fams = merged.partnerIn.map((f) => t.families[f]).filter((f): f is Family => !!f);
  for (let i = 0; i < fams.length; i++) {
    for (let j = i + 1; j < fams.length; j++) {
      const a = t.families[fams[i]!.id],
        b = t.families[fams[j]!.id];
      if (!a || !b || a.husbandId !== b.husbandId || a.wifeId !== b.wifeId) continue;
      const mergedFam: Family = {
        ...a,
        childIds: [...a.childIds, ...b.childIds.filter((c) => !a.childIds.includes(c))],
        events: dedupeEvents(a.events, b.events),
        notes: [...a.notes, ...b.notes],
        citations: [...a.citations, ...b.citations],
        mediaIds: [...new Set([...a.mediaIds, ...b.mediaIds])],
        unionType: a.unionType === 'unknown' ? b.unionType : a.unionType,
        extra: [...a.extra, ...b.extra],
      };
      t = withFamily(t, mergedFam);
      t = withoutFamily(t, b.id);
      for (const pid of [a.husbandId, a.wifeId]) {
        const p = pid ? t.individuals[pid] : undefined;
        if (p) t = withIndividual(t, { ...p, partnerIn: p.partnerIn.filter((f) => f !== b.id) });
      }
      for (const cid of b.childIds) {
        const c = t.individuals[cid];
        if (c)
          t = withIndividual(t, {
            ...c,
            childOf: c.childOf
              .map((l) => (l.familyId === b.id ? { ...l, familyId: a.id } : l))
              .filter((l, k, arr) => arr.findIndex((x) => x.familyId === l.familyId) === k),
          });
      }
    }
  }
  return { tree: t, focusId: keepId };
}

// ---------- Events ----------

export function blankEvent(type: EventType, tag?: string): Event {
  const tags: Record<string, string> = {
    birth: 'BIRT',
    baptism: 'CHR',
    death: 'DEAT',
    burial: 'BURI',
    marriage: 'MARR',
    divorce: 'DIV',
    occupation: 'OCCU',
    residence: 'RESI',
    census: 'CENS',
    custom: 'EVEN',
    cremation: 'CREM',
    adoption: 'ADOP',
    education: 'EDUC',
    religion: 'RELI',
    retirement: 'RETI',
    emigration: 'EMIG',
    immigration: 'IMMI',
    naturalization: 'NATU',
    probate: 'PROB',
    will: 'WILL',
    graduation: 'GRAD',
    confirmation: 'CONF',
    'first-communion': 'FCOM',
    title: 'TITL',
    description: 'DSCR',
    engagement: 'ENGA',
    'marriage-banns': 'MARB',
    annulment: 'ANUL',
    separation: 'EVEN',
  };
  return newEvent(type, tag ?? tags[type] ?? 'EVEN');
}

/** Build an empty tree with a single person, for starting from scratch. */
export function newTree(given: string, surname: string, sex: Sex, id?: string): EditResult {
  const tree: Tree = {
    header: { notes: [], language: 'French' },
    individuals: {},
    families: {},
    sources: {},
    repositories: {},
    media: {},
    extra: [],
    importNotes: [],
    resources: [],
    documentIds: [],
  };
  return createPerson(tree, { given, surname, sex }, id);
}
