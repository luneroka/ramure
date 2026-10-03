/**
 * Completing a tree from a GEDCOM file, adding only what the tree lacks.
 *
 * Research often carries on elsewhere — on Geneanet, mostly — and the finds
 * belong in the Ramure tree without losing what was done here since. Importing
 * the file as a new tree means starting again, and replacing the tree would
 * throw away every photo, note and person added in Ramure. A graft does
 * neither: the file's people are recognised in the tree (match.ts), and only
 * what the tree does not already know is written into it.
 *
 * - Nothing in the tree is removed or overwritten. Where the file disagrees —
 *   another birth year, another name — the tree wins and the difference is
 *   listed for the person to look at, never applied.
 * - New people come in with their links. Recognised people gain the facts
 *   they lack, and the blanks of an event the tree knows (a date, a place)
 *   are filled.
 * - A family that would give somebody a second set of birth parents is left
 *   out, and so are the people only that family connected to the tree.
 *
 * The plan ends as one `graft` op carrying the records it sets, so it syncs,
 * replays and is undone like any other edit.
 */

import type { GDate } from '../gedcom/dates';
import {
  displayName,
  placeText,
  type Citation,
  type Event,
  type EventType,
  type Family,
  type Individual,
  type MediaObject,
  type Name,
  type Pedigree,
  type Place,
  type Repository,
  type Sex,
  type Source,
  type Tree,
} from '../gedcom/model';
import { fold } from '../util/text';
import { applyGraft, fingerprint, type GraftRecords } from './diff';
import { RAMURE_MEDIA_SCHEME } from './edit';
import { newId } from './ids';
import { matchTrees, surnameKey, words, yearSpan, type Matches } from './match';

/** Something a recognised person or family gained. */
export type Fact =
  | { kind: 'event'; event: EventType; customType?: string }
  | { kind: 'name' | 'sex' | 'note' | 'source' | 'media' | 'restriction' | 'parents' | 'partner' | 'child' | 'union' };

export interface Completion {
  /** The person's or the family's id in the tree. */
  id: string;
  facts: Fact[];
}

/** Whom a difference is about: a person, or a couple for the events of their union. */
export type Subject = { person: string } | { family: string };

/** Where the file says something other than the tree. The tree's version is kept; this is only listed. */
export type Difference =
  | { subject: Subject; what: 'name'; inTree: string; inFile: string }
  | { subject: Subject; what: 'sex'; inTree: Sex; inFile: Sex }
  | { subject: Subject; what: 'date'; event: EventType; customType?: string; inTree: GDate; inFile: GDate }
  | { subject: Subject; what: 'place'; event: EventType; customType?: string; inTree: string; inFile: string }
  /** The file gives this person other parents, named here: that family and the branch it carries were left out. */
  | { subject: Subject; what: 'parents'; inFile: string[] };

export interface GraftPlan {
  /** The tree as it will be once the graft is applied. */
  tree: Tree;
  /** The op that makes it so, or null when the file has nothing the tree lacks. */
  op: GraftRecords | null;
  /** People of the file recognised in the tree. */
  recognised: number;
  /** People added, by their id in the new tree. */
  added: string[];
  /** Recognised people who gained something. */
  completed: Completion[];
  /** Families of the tree whose union gained something: an event, a note, a source. */
  unions: Completion[];
  differences: Difference[];
  /** People of the file left out because only a family the tree contradicts linked them to it. */
  setAside: number;
}

/** Events a life or a union has once: the file's completes the tree's rather than adding a second. */
const ONCE = new Set<EventType>([
  'birth',
  'baptism',
  'death',
  'burial',
  'cremation',
  'adoption',
  'marriage',
  'divorce',
  'annulment',
  'engagement',
  'separation',
]);
/** Events whose date and place are worth saying the file disagrees about. Others keep the tree's silently. */
const TOLD = new Set<EventType>(['birth', 'baptism', 'death', 'burial', 'marriage']);

const birthLink = (pedigree: string): boolean => pedigree === 'birth' || pedigree === 'unknown';
const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();
const eventKey = (e: Event): string => (e.type === 'custom' ? `custom:${fold(e.customType ?? e.tag)}` : e.type);
const eventFact = (e: Event): Fact => ({ kind: 'event', event: e.type, ...(e.customType ? { customType: e.customType } : {}) });
const factKey = (f: Fact): string => (f.kind === 'event' ? `event:${f.event}:${f.customType ?? ''}` : f.kind);
const nameText = (n: Name): string => [n.given, n.surname].filter((s) => s.trim()).join(' ') || '?';

function placeWords(p: Place): string[] {
  return (p.parts.length ? p.parts : p.text.split(',')).map((part) => words(part).join(' ')).filter(Boolean);
}

/**
 * Whether two dates can both be true of one event. Formatting and qualifiers
 * do not count — Geneanet turns « FROM 1973 TO 2012 » into « BET 1973 AND
 * 2012 » and « 2 OCT » into « 02 OCT » — and nor does one date being vaguer
 * than the other. Years that cannot overlap do, and so do two different days.
 */
export function datesAgree(a: GDate | undefined, b: GDate | undefined): boolean {
  const x = yearSpan(a);
  const y = yearSpan(b);
  if (!a || !b || !x || !y) return true;
  if (x.lo > y.hi || y.lo > x.hi) return false;
  const p = a.date;
  const q = b.date;
  if (a.kind !== 'exact' || b.kind !== 'exact' || !p || !q || p.calendar !== q.calendar) return true;
  if (p.month && q.month && p.month !== q.month) return false;
  return !(p.day && q.day && p.day !== q.day);
}

/** One place written with more or fewer parts: « Brest, France » and « Brest, Finistère, Bretagne, France » agree. */
export function placesAgree(a: Place | undefined, b: Place | undefined): boolean {
  if (!a || !b) return true;
  const x = placeWords(a);
  const y = placeWords(b);
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  let i = 0;
  for (const part of long) if (part === short[i]) i++;
  return i === short.length;
}

/** The tree's name with its blanks filled from the file's, or undefined when the two name somebody differently. */
function fillName(mine: Name, theirs: Name): Name | undefined {
  const given = words(mine.given).join(' ');
  const otherGiven = words(theirs.given).join(' ');
  const surname = surnameKey(mine.surname);
  const otherSurname = surnameKey(theirs.surname);
  if ((given && otherGiven && given !== otherGiven) || (surname && otherSurname && surname !== otherSurname)) return undefined;
  let out = mine;
  if (!given && otherGiven) out = { ...out, given: theirs.given };
  if (!surname && otherSurname) out = { ...out, surname: theirs.surname };
  if (!out.nick && theirs.nick) out = { ...out, nick: theirs.nick };
  return out;
}

const hasName = (n: Name): boolean => words(n.given).length > 0 || surnameKey(n.surname).length > 0;
/** The same words in the same order, wherever the surname's slashes fell: Geneanet writes married names without them. */
const sameWords = (a: Name, b: Name): boolean =>
  [...words(a.given), ...words(a.surname)].join(' ') === [...words(b.given), ...words(b.surname)].join(' ');

function moreNotes(mine: string[], theirs: string[]): string[] | undefined {
  const out = [...mine];
  for (const n of theirs) if (n.trim() && !out.some((m) => squash(m) === squash(n))) out.push(n);
  return out.length > mine.length ? out : undefined;
}

/** New children go among the old ones by year of birth when it is known, after them otherwise; the old keep their order. */
function insertByBirth(ids: string[], add: string[], year: (id: string) => number | undefined): string[] {
  const out = [...ids];
  for (const id of add) {
    const y = year(id);
    const at = y === undefined ? -1 : out.findIndex((x) => (year(x) ?? -Infinity) > y);
    if (at < 0) out.push(id);
    else out.splice(at, 0, id);
  }
  return out;
}

class Grafter {
  /** The file's people and families, mapped to their ids in the result: recognised, or newly allotted. */
  private readonly personIds = new Map<string, string>();
  private readonly familyIds = new Map<string, string>();
  /** The tree family each file family completes, when there is one. */
  private readonly target = new Map<string, string>();
  private readonly sourceIds = new Map<string, string | null>();
  private readonly repositoryIds = new Map<string, string | null>();
  private readonly mediaIds = new Map<string, string | null>();
  /** Child links left out because they contradict the tree: `${file family} ${file child}`. */
  private readonly dropped = new Set<string>();
  /** How each child the graft attaches is attached: `${family} ${person}`, both as in the result. */
  private readonly pedigrees = new Map<string, Pedigree>();
  private readonly personFacts = new Map<string, Map<string, Fact>>();
  private readonly familyFacts = new Map<string, Map<string, Fact>>();

  /** The records the graft sets, by their id in the result. */
  readonly individuals: Record<string, Individual> = {};
  readonly families: Record<string, Family> = {};
  readonly sources: Record<string, Source> = {};
  readonly repositories: Record<string, Repository> = {};
  readonly media: Record<string, MediaObject> = {};
  readonly differences: Difference[] = [];
  readonly added: string[] = [];
  setAside = 0;

  constructor(
    private readonly tree: Tree,
    private readonly file: Tree,
    private readonly m: Matches,
  ) {}

  run(): void {
    this.resolveTargets();
    this.findContradictions();
    this.choosePeople();
    this.chooseFamilies();
    for (const [fileId, treeId] of this.m.people) {
      const mine = this.tree.individuals[treeId];
      const theirs = this.file.individuals[fileId];
      if (mine && theirs) this.completePerson(mine, theirs);
    }
    for (const [fileId, id] of this.personIds) {
      const theirs = this.file.individuals[fileId];
      if (theirs && !this.m.people.has(fileId)) this.bringPerson(theirs, id);
    }
    for (const fi of Object.values(this.file.families)) {
      const id = this.familyIds.get(fi.id);
      if (!id) continue;
      const fe = this.tree.families[id];
      if (fe) this.completeFamily(fe, fi);
      else this.bringFamily(fi, id);
    }
    this.link();
    this.linkFacts();
  }

  // ---------- Deciding what comes in ----------

  /** A file family completes the tree family it was matched to — or, when both partners were recognised, the one that couple already has. */
  private resolveTargets(): void {
    const couples = new Map<string, string>();
    for (const f of Object.values(this.tree.families)) {
      if (f.husbandId && f.wifeId) couples.set([f.husbandId, f.wifeId].sort().join(' '), f.id);
    }
    for (const fi of Object.values(this.file.families)) {
      const matched = this.m.families.get(fi.id);
      const h = fi.husbandId ? this.m.people.get(fi.husbandId) : undefined;
      const w = fi.wifeId ? this.m.people.get(fi.wifeId) : undefined;
      const couple = h && w ? couples.get([h, w].sort().join(' ')) : undefined;
      const id = matched ?? couple;
      if (id) this.target.set(fi.id, id);
    }
  }

  /** A child link that would give a recognised person a second set of birth parents contradicts the tree: it stays out, and is listed. */
  private findContradictions(): void {
    const gained = new Set<string>();
    for (const fi of Object.values(this.file.families)) {
      const id = this.target.get(fi.id);
      const fe = id ? this.tree.families[id] : undefined;
      for (const c of fi.childIds) {
        const ce = this.m.people.get(c);
        if (!ce || fe?.childIds.includes(ce)) continue;
        const pedigree = this.file.individuals[c]?.childOf.find((l) => l.familyId === fi.id)?.pedigree ?? 'birth';
        // An adoptive or a foster family is one more family, not a contradiction.
        if (!birthLink(pedigree)) continue;
        const hasParents = this.tree.individuals[ce]?.childOf.some((l) => birthLink(l.pedigree)) || gained.has(ce);
        if (!hasParents) {
          gained.add(ce);
          continue;
        }
        this.dropped.add(`${fi.id} ${c}`);
        const named = [fi.husbandId, fi.wifeId].flatMap((p) => {
          const ind = p ? this.file.individuals[p] : undefined;
          return ind ? [displayName(ind)] : [];
        });
        this.differences.push({ subject: { person: ce }, what: 'parents', inFile: named });
      }
    }
  }

  /**
   * Who comes in: everyone the file links to a recognised person, except
   * through a contradicted link. People the file links only through such a
   * link stay out; people the file links to nobody in the tree at all are a
   * separate group in the file, and come in as one.
   */
  private choosePeople(): void {
    const familiesOf = new Map<string, Family[]>();
    for (const fi of Object.values(this.file.families)) {
      for (const id of [fi.husbandId, fi.wifeId, ...fi.childIds]) {
        if (!id) continue;
        const list = familiesOf.get(id);
        if (list) list.push(fi);
        else familiesOf.set(id, [fi]);
      }
    }
    const reach = (crossDropped: boolean): Set<string> => {
      const seen = new Set(this.m.people.keys());
      const queue = [...seen];
      for (let id = queue.pop(); id !== undefined; id = queue.pop()) {
        for (const fi of familiesOf.get(id) ?? []) {
          const members = [fi.husbandId, fi.wifeId, ...fi.childIds.filter((c) => crossDropped || !this.dropped.has(`${fi.id} ${c}`))];
          if (!members.includes(id)) continue;
          for (const x of members) {
            if (x && !seen.has(x) && this.file.individuals[x]) {
              seen.add(x);
              queue.push(x);
            }
          }
        }
      }
      return seen;
    };
    const linked = reach(false);
    const anyhow = reach(true);
    for (const id of Object.keys(this.file.individuals)) {
      const known = this.m.people.get(id);
      if (known !== undefined) this.personIds.set(id, known);
      else if (!linked.has(id) && anyhow.has(id)) this.setAside++;
      else {
        const fresh = newId('I');
        this.personIds.set(id, fresh);
        this.added.push(fresh);
      }
    }
  }

  /** A new family comes in when it still joins two people who do, or records a union of one of them. */
  private chooseFamilies(): void {
    for (const fi of Object.values(this.file.families)) {
      const id = this.target.get(fi.id);
      if (id) {
        this.familyIds.set(fi.id, id);
        continue;
      }
      const members = [fi.husbandId, fi.wifeId, ...fi.childIds.filter((c) => !this.dropped.has(`${fi.id} ${c}`))].filter(
        (x): x is string => !!x && this.personIds.has(x),
      );
      if (members.length >= 2 || (members.length === 1 && fi.events.length > 0)) this.familyIds.set(fi.id, newId('F'));
    }
  }

  // ---------- Records the tree already has ----------

  private note(facts: Map<string, Map<string, Fact>>, id: string, fact: Fact): void {
    const list = facts.get(id) ?? new Map<string, Fact>();
    list.set(factKey(fact), fact);
    facts.set(id, list);
  }

  private completePerson(mine: Individual, theirs: Individual): void {
    const subject = { person: mine.id };
    const note = (fact: Fact) => this.note(this.personFacts, mine.id, fact);
    let out = mine;
    if (theirs.sex !== 'U' && mine.sex === 'U') {
      out = { ...out, sex: theirs.sex };
      note({ kind: 'sex' });
    } else if (theirs.sex !== 'U' && mine.sex !== theirs.sex) {
      this.differences.push({ subject, what: 'sex', inTree: mine.sex, inFile: theirs.sex });
    }
    const names = this.completeNames(mine, theirs, note);
    if (names) out = { ...out, names };
    const events = this.completeEvents(out.events, theirs.events, subject, note);
    if (events) out = { ...out, events };
    const notes = moreNotes(out.notes, theirs.notes);
    if (notes) {
      out = { ...out, notes };
      note({ kind: 'note' });
    }
    const citations = this.moreCitations(out.citations, theirs.citations);
    if (citations) {
      out = { ...out, citations };
      note({ kind: 'source' });
    }
    const mediaIds = this.moreMedia(out.mediaIds, theirs.mediaIds);
    if (mediaIds) {
      out = { ...out, mediaIds };
      note({ kind: 'media' });
    }
    if (!mine.restriction && theirs.restriction) {
      out = { ...out, restriction: theirs.restriction };
      note({ kind: 'restriction' });
    }
    if (out !== mine) this.individuals[mine.id] = out;
  }

  /** The file's main name fills the blanks of a matching one or is a difference; its other names (married, known as) are added. */
  private completeNames(mine: Individual, theirs: Individual, note: (f: Fact) => void): Name[] | undefined {
    let names = mine.names;
    const [first, ...others] = theirs.names.filter(hasName);
    if (first && !names.some(hasName)) {
      names = [this.remapName(first)];
      note({ kind: 'name' });
    } else if (first) {
      const at = names.findIndex((n) => fillName(n, first) !== undefined);
      const filled = at < 0 ? undefined : fillName(names[at]!, first);
      if (filled && filled !== names[at]) {
        names = names.map((n, i) => (i === at ? filled : n));
        note({ kind: 'name' });
      } else if (!filled && !names.some((n) => sameWords(n, first))) {
        this.differences.push({ subject: { person: mine.id }, what: 'name', inTree: displayName(mine), inFile: nameText(first) });
      }
    }
    for (const n of others) {
      if (names.some((x) => sameWords(x, n) || fillName(x, n) === x)) continue;
      names = [...names, this.remapName(n)];
      note({ kind: 'name' });
    }
    return names === mine.names ? undefined : names;
  }

  private completeEvents(mine: Event[], theirs: Event[], subject: Subject, note: (f: Fact) => void): Event[] | undefined {
    let out = mine;
    for (const e of theirs) {
      const same = out.filter((x) => eventKey(x) === eventKey(e));
      const agrees = (x: Event) => datesAgree(x.date, e.date) && placesAgree(x.place, e.place);
      const match = ONCE.has(e.type)
        ? (same.find(agrees) ?? same[0])
        : same.find((x) => fold(x.value ?? '') === fold(e.value ?? '') && agrees(x));
      if (!match) {
        out = [...out, this.remapEvent(e)];
        note(eventFact(e));
        continue;
      }
      if (TOLD.has(e.type)) {
        const which = { event: e.type, ...(e.customType ? { customType: e.customType } : {}) };
        if (match.date && e.date && !datesAgree(match.date, e.date)) {
          this.differences.push({ subject, what: 'date', ...which, inTree: match.date, inFile: e.date });
        }
        if (match.place && e.place && !placesAgree(match.place, e.place)) {
          this.differences.push({ subject, what: 'place', ...which, inTree: placeText(match.place), inFile: placeText(e.place) });
        }
      }
      const filled = this.fillEvent(match, e);
      if (filled !== match) {
        out = out.map((x) => (x === match ? filled : x));
        note(eventFact(e));
      }
    }
    return out === mine ? undefined : out;
  }

  /** What an event the tree knows leaves blank, from the file's account of it. */
  private fillEvent(mine: Event, theirs: Event): Event {
    let out = mine;
    for (const key of ['date', 'place', 'value', 'cause', 'age', 'address'] as const) {
      const value = theirs[key];
      if (value !== undefined && value !== '' && (out[key] === undefined || out[key] === '')) out = { ...out, [key]: value };
    }
    if (!out.adoptionFamilyId && theirs.adoptionFamilyId) {
      const family = this.familyIds.get(theirs.adoptionFamilyId);
      if (family) out = { ...out, adoptionFamilyId: family, ...(theirs.adoptedBy ? { adoptedBy: theirs.adoptedBy } : {}) };
    }
    const notes = moreNotes(out.notes, theirs.notes);
    if (notes) out = { ...out, notes };
    const citations = this.moreCitations(out.citations, theirs.citations);
    if (citations) out = { ...out, citations };
    const mediaIds = this.moreMedia(out.mediaIds, theirs.mediaIds);
    if (mediaIds) out = { ...out, mediaIds };
    return out;
  }

  private completeFamily(fe: Family, fi: Family): void {
    // A second file family for the same couple builds on what the first one added.
    let out = this.families[fe.id] ?? fe;
    const note = (fact: Fact) => this.note(this.familyFacts, fe.id, fact);
    const placed = (id: string | undefined) => (id ? this.personIds.get(id) : undefined);
    const crossed = (!!out.wifeId && placed(fi.husbandId) === out.wifeId) || (!!out.husbandId && placed(fi.wifeId) === out.husbandId);
    const [h, w] = crossed ? [fi.wifeId, fi.husbandId] : [fi.husbandId, fi.wifeId];
    for (const [slot, fileId] of [
      ['husbandId', h],
      ['wifeId', w],
    ] as const) {
      const id = placed(fileId);
      if (id && !out[slot] && out.husbandId !== id && out.wifeId !== id) out = { ...out, [slot]: id };
    }
    const kids = this.keptChildren(fi, out.id).filter((c) => !out.childIds.includes(c));
    if (kids.length) out = { ...out, childIds: insertByBirth(out.childIds, kids, (id) => this.birthYear(id)) };
    if (out.unionType === 'unknown' && fi.unionType !== 'unknown') {
      out = { ...out, unionType: fi.unionType };
      note({ kind: 'union' });
    }
    const events = this.completeEvents(out.events, fi.events, { family: fe.id }, note);
    if (events) out = { ...out, events };
    const notes = moreNotes(out.notes, fi.notes);
    if (notes) {
      out = { ...out, notes };
      note({ kind: 'note' });
    }
    const citations = this.moreCitations(out.citations, fi.citations);
    if (citations) {
      out = { ...out, citations };
      note({ kind: 'source' });
    }
    const mediaIds = this.moreMedia(out.mediaIds, fi.mediaIds);
    if (mediaIds) {
      out = { ...out, mediaIds };
      note({ kind: 'media' });
    }
    if (out !== fe) this.families[fe.id] = out;
  }

  /** The family's children that come in, by their ids in the result, remembering how each is attached. */
  private keptChildren(fi: Family, familyId: string): string[] {
    const out: string[] = [];
    for (const c of fi.childIds) {
      const id = this.personIds.get(c);
      if (!id || this.dropped.has(`${fi.id} ${c}`) || out.includes(id)) continue;
      out.push(id);
      const pedigree = this.file.individuals[c]?.childOf.find((l) => l.familyId === fi.id)?.pedigree;
      if (pedigree) this.pedigrees.set(`${familyId} ${id}`, pedigree);
    }
    return out;
  }

  private birthYear(id: string): number | undefined {
    const ind = this.individuals[id] ?? this.tree.individuals[id];
    const dated = (type: string) => ind?.events.find((e) => e.type === type && e.date)?.date;
    const span = yearSpan(dated('birth') ?? dated('baptism'));
    return span && Number.isFinite(span.lo) ? span.lo : undefined;
  }

  // ---------- Citations, sources, media ----------

  private sourceTitle(id: string): string {
    return this.tree.sources[id]?.title ?? this.sources[id]?.title ?? '';
  }

  /** The file's citation is already among the tree's: same source and page, or the same words. */
  private citationKnown(c: Citation, list: Citation[]): boolean {
    const theirTitle = c.sourceId ? (this.file.sources[c.sourceId]?.title ?? '') : '';
    return list.some((e) => {
      const myTitle = e.sourceId ? this.sourceTitle(e.sourceId) : '';
      if (theirTitle && myTitle) return fold(theirTitle) === fold(myTitle) && fold(c.page ?? '') === fold(e.page ?? '');
      if (c.flat && e.flat) return squash(fold(c.flat)) === squash(fold(e.flat));
      // One written out as text, the other structured: Geneanet flattens a citation into « title - author - … - page ».
      const flat = c.flat ?? e.flat;
      const title = c.flat ? myTitle : theirTitle;
      const page = c.flat ? e.page : c.page;
      if (flat && title) return fold(flat).includes(fold(title)) && (!page || fold(flat).includes(fold(page)));
      return !c.sourceId && !e.sourceId && !flat && fold(`${c.page ?? ''} ${c.text ?? ''}`) === fold(`${e.page ?? ''} ${e.text ?? ''}`);
    });
  }

  private moreCitations(mine: Citation[], theirs: Citation[]): Citation[] | undefined {
    const out = [...mine];
    for (const c of theirs) if (!this.citationKnown(c, out)) out.push(this.remapCitation(c));
    return out.length > mine.length ? out : undefined;
  }

  private remapCitation(c: Citation): Citation {
    const { sourceId, ...rest } = c;
    const id = sourceId ? this.mapSource(sourceId) : undefined;
    return { ...rest, notes: [...c.notes], ...(id ? { sourceId: id } : {}) };
  }

  /** The tree's source with the same title (and author, when both say), or the file's brought in under a new id. */
  private mapSource(fileId: string): string | undefined {
    const known = this.sourceIds.get(fileId);
    if (known !== undefined) return known ?? undefined;
    const s = this.file.sources[fileId];
    const title = s ? fold(s.title) : '';
    const same =
      s && title
        ? Object.values(this.tree.sources).find(
            (x) => fold(x.title) === title && (!x.author || !s.author || fold(x.author) === fold(s.author)),
          )
        : undefined;
    const id = same ? same.id : s ? newId('S') : null;
    this.sourceIds.set(fileId, id);
    if (s && id && !same) {
      const { repositoryId, repositories, ...rest } = s;
      const repo = repositoryId ? this.mapRepository(repositoryId) : undefined;
      const repos = repositories?.flatMap((r) => {
        const rid = this.mapRepository(r.id);
        return rid ? [{ ...r, id: rid }] : [];
      });
      this.sources[id] = {
        ...rest,
        id,
        notes: [...s.notes],
        mediaIds: this.mapMediaList(s.mediaIds),
        ...(repo ? { repositoryId: repo } : {}),
        ...(repos ? { repositories: repos } : {}),
      };
    }
    return id ?? undefined;
  }

  private mapRepository(fileId: string): string | undefined {
    const known = this.repositoryIds.get(fileId);
    if (known !== undefined) return known ?? undefined;
    const r = this.file.repositories[fileId];
    const name = r ? fold(r.name) : '';
    const same = name ? Object.values(this.tree.repositories).find((x) => fold(x.name) === name) : undefined;
    const id = same ? same.id : r ? newId('R') : null;
    this.repositoryIds.set(fileId, id);
    if (r && id && !same) this.repositories[id] = { ...r, id, notes: [...r.notes] };
    return id ?? undefined;
  }

  /**
   * The tree's media with the same file, or the file's brought in. A picture
   * Ramure stored (« ramure: ») lives with the tree that stored it, so only
   * this tree's own come home; another tree's would point at nothing.
   */
  private mapMedia(fileId: string): string | undefined {
    const known = this.mediaIds.get(fileId);
    if (known !== undefined) return known ?? undefined;
    const m = this.file.media[fileId];
    const same = m?.file ? Object.values(this.tree.media).find((x) => x.file === m.file) : undefined;
    const id = same ? same.id : m && !m.file.startsWith(RAMURE_MEDIA_SCHEME) ? newId('M') : null;
    this.mediaIds.set(fileId, id);
    if (m && id && !same) this.media[id] = { ...m, id, notes: [...m.notes] };
    return id ?? undefined;
  }

  private mapMediaList(ids: string[]): string[] {
    return [...new Set(ids.map((id) => this.mapMedia(id)).filter((id): id is string => !!id))];
  }

  private moreMedia(mine: string[], theirs: string[]): string[] | undefined {
    const fresh = this.mapMediaList(theirs).filter((id) => !mine.includes(id));
    return fresh.length ? [...mine, ...fresh] : undefined;
  }

  // ---------- Records the tree did not have ----------

  private remapName(n: Name): Name {
    return n.citations ? { ...n, citations: n.citations.map((c) => this.remapCitation(c)) } : { ...n };
  }

  private remapEvent(e: Event): Event {
    const { adoptionFamilyId, adoptedBy, ...rest } = e;
    const family = adoptionFamilyId ? this.familyIds.get(adoptionFamilyId) : undefined;
    return {
      ...rest,
      notes: [...e.notes],
      citations: e.citations.map((c) => this.remapCitation(c)),
      mediaIds: this.mapMediaList(e.mediaIds),
      ...(family ? { adoptionFamilyId: family, ...(adoptedBy ? { adoptedBy } : {}) } : {}),
    };
  }

  private bringPerson(theirs: Individual, id: string): void {
    this.individuals[id] = {
      ...theirs,
      id,
      names: theirs.names.map((n) => this.remapName(n)),
      events: theirs.events.map((e) => this.remapEvent(e)),
      notes: [...theirs.notes],
      citations: theirs.citations.map((c) => this.remapCitation(c)),
      mediaIds: this.mapMediaList(theirs.mediaIds),
      // Links are rebuilt from the families that come in: some of the file's may not.
      childOf: [],
      partnerIn: [],
    };
  }

  private bringFamily(fi: Family, id: string): void {
    const { husbandId, wifeId, ...rest } = fi;
    const h = husbandId ? this.personIds.get(husbandId) : undefined;
    const w = wifeId ? this.personIds.get(wifeId) : undefined;
    this.families[id] = {
      ...rest,
      id,
      ...(h ? { husbandId: h } : {}),
      ...(w ? { wifeId: w } : {}),
      childIds: this.keptChildren(fi, id),
      events: fi.events.map((e) => this.remapEvent(e)),
      notes: [...fi.notes],
      citations: fi.citations.map((c) => this.remapCitation(c)),
      mediaIds: this.mapMediaList(fi.mediaIds),
    };
  }

  // ---------- Links ----------

  private person(id: string): Individual | undefined {
    return this.individuals[id] ?? this.tree.individuals[id];
  }

  /** Every family the graft writes, linked from its partners and children. */
  private link(): void {
    for (const [fid, fam] of Object.entries(this.families)) {
      for (const pid of [fam.husbandId, fam.wifeId]) {
        const p = pid ? this.person(pid) : undefined;
        if (p && !p.partnerIn.includes(fid)) this.individuals[p.id] = { ...p, partnerIn: [...p.partnerIn, fid] };
      }
      for (const cid of fam.childIds) {
        const p = this.person(cid);
        if (p && !p.childOf.some((l) => l.familyId === fid)) {
          this.individuals[p.id] = {
            ...p,
            childOf: [...p.childOf, { familyId: fid, pedigree: this.pedigrees.get(`${fid} ${cid}`) ?? 'birth' }],
          };
        }
      }
    }
  }

  /** What recognised people gained through their families: parents, a union, children. */
  private linkFacts(): void {
    const recognised = new Set(this.m.people.values());
    const note = (id: string | undefined, fact: Fact) => {
      if (id && recognised.has(id)) this.note(this.personFacts, id, fact);
    };
    for (const id of recognised) {
      const before = this.tree.individuals[id];
      const after = this.individuals[id];
      if (!before || !after) continue;
      if (after.childOf.some((l) => !before.childOf.some((x) => x.familyId === l.familyId))) note(id, { kind: 'parents' });
      if (after.partnerIn.some((f) => !before.partnerIn.includes(f))) note(id, { kind: 'partner' });
    }
    for (const [fid, fam] of Object.entries(this.families)) {
      const old = this.tree.families[fid];
      const partners = old ? [old.husbandId, old.wifeId] : [fam.husbandId, fam.wifeId];
      if (fam.childIds.some((c) => !old?.childIds.includes(c))) for (const p of partners) note(p, { kind: 'child' });
      if (old && ((fam.husbandId && !old.husbandId) || (fam.wifeId && !old.wifeId))) for (const p of partners) note(p, { kind: 'partner' });
    }
  }

  // ---------- The plan ----------

  plan(file: string): GraftPlan {
    const tables = [this.individuals, this.families, this.sources, this.repositories, this.media];
    const expect: Record<string, string> = {};
    const prints: Array<[string, Record<string, unknown>, Record<string, unknown>]> = [
      ['I', this.individuals, this.tree.individuals],
      ['F', this.families, this.tree.families],
      ['S', this.sources, this.tree.sources],
      ['R', this.repositories, this.tree.repositories],
      ['M', this.media, this.tree.media],
    ];
    for (const [kind, set, before] of prints) for (const id of Object.keys(set)) expect[`${kind}:${id}`] = fingerprint(before[id] ?? null);
    const op: GraftRecords | null = tables.every((t) => Object.keys(t).length === 0)
      ? null
      : {
          t: 'graft',
          file,
          individuals: this.individuals,
          families: this.families,
          sources: this.sources,
          repositories: this.repositories,
          media: this.media,
          expect,
        };
    const completions = (facts: Map<string, Map<string, Fact>>): Completion[] =>
      [...facts].map(([id, list]) => ({ id, facts: [...list.values()] }));
    const seen = new Set<string>();
    return {
      tree: op ? applyGraft(this.tree, op) : this.tree,
      op,
      recognised: this.m.people.size,
      added: this.added,
      completed: completions(this.personFacts),
      unions: completions(this.familyFacts),
      // One couple described twice in the file would say the same thing twice.
      differences: this.differences.filter((d) => {
        const key = JSON.stringify(d);
        return !seen.has(key) && !!seen.add(key);
      }),
      setAside: this.setAside,
    };
  }
}

/**
 * What grafting `file` onto `tree` would do, ready to show and to apply. Pure:
 * neither tree is changed, and nothing is written until the op is committed.
 * `name` is the file's name, kept for the history and the guard version.
 */
export function planGraft(tree: Tree, file: Tree, name: string): GraftPlan {
  const g = new Grafter(tree, file, matchTrees(tree, file));
  g.run();
  return g.plan(name);
}
