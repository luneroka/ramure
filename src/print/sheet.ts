/**
 * One person on paper: the Fiche and Famille tabs of the panel as a single
 * document, for a relative who is building their own tree of the same family.
 *
 * This decides what the sheet says and leaves the drawing to the screen. Three
 * decisions are made here rather than there, because they are the ones worth a
 * test:
 *
 * - **Who comes along.** Parents but not grandparents. Brothers and sisters in
 *   birth order with the subject in their place, half ones included and tagged
 *   with their side, since the panel's Famille tab never shows them. Every union
 *   with its children; each child's spouse, so a grandchild's surname is
 *   explained; the grandchildren, and the nephews and nieces, named in passing.
 * - **How much of each.** The subject in full. Parents, siblings, partners and
 *   children get a line of dates and places, written short (« Brest,
 *   Finistère ») because the subject's own events carry the long form.
 *   Grandchildren, nephews and nieces get a name and their years, spouses a name.
 * - **What is held back.** With discretion, a living relative keeps a name and a
 *   birth year and loses the day, the place and the occupation; a relative the
 *   file marks private (RESN privacy or confidential) always does. The subject
 *   is never held back: they were chosen.
 *
 * The events are the Fiche tab's own rows (`eventRows`), so the screen and the
 * paper cannot drift apart.
 */

import { computeAge } from '@/gedcom/age';
import { approximateYear, formatDate, type GDate } from '@/gedcom/dates';
import { isLiving } from '@/gedcom/living';
import {
  findEvent,
  type Citation,
  type Event,
  type Family,
  type Individual,
  type Lead,
  type MediaKind,
  type Place,
  type Tree,
} from '@/gedcom/model';
import { eventLabel, formatAge, t, tf, tg, type Lang, type StringKey } from '@/i18n';
import { portraitId } from '@/tree/edit';
import { citationText, eventRows } from '@/app/lib/lifeEvents';
import { lifeYears, nameParts } from './person';

export interface SheetOptions {
  lang: Lang;
  /** Living relatives keep their name and birth year only. */
  discreet: boolean;
  notes: boolean;
  sources: boolean;
  leads: boolean;
}

/** A relative given a line of their own: a parent, a sibling, a partner, a child. */
export interface Relative {
  id: string;
  name: string;
  /** What is known, in reading order: birth, then death. Empty when nothing is. */
  facts: string[];
  occupation?: string;
  /** Adoption, or the side a half-sibling is on. */
  tag?: string;
  unsure: boolean;
  /** Held back, by discretion or by a privacy mark in the file. */
  reduced: boolean;
}

/** Someone named in passing: a spouse, a nephew, a grandchild. */
export interface Mention {
  id: string;
  name: string;
  /** « 1950 », « 1891 – 1915 », or nothing: spouses are named without. */
  years: string;
}

export interface SiblingRow extends Relative {
  self: boolean;
  spouses: Mention[];
  children: Mention[];
}

export interface ChildRow extends Relative {
  spouses: Mention[];
  children: Mention[];
}

export interface ParentSlot {
  role: string;
  person?: Relative;
  /** « Inconnue », when the family has no one in this place. */
  unknown?: string;
}

export interface ParentCouple {
  familyId: string;
  slots: [ParentSlot, ParentSlot];
  union: string;
}

export interface UnionBlock {
  familyId: string;
  partner?: Relative;
  unknownPartner?: string;
  union: string;
  children: ChildRow[];
}

export interface SheetEvent {
  key: string;
  date: string;
  label: string;
  lines: string[];
  /** Numbers of the sources this event cites, in `sources`. */
  refs: number[];
}

export interface SheetSource {
  n: number;
  /** What it is cited for: « Naissance », « Identité »… once each. */
  about: string[];
  text: string;
}

export interface SheetDocument {
  id: string;
  title: string;
  detail: string;
}

export interface SheetLead {
  id: string;
  title: string;
  note?: string;
  url?: string;
}

/** The symbols the relatives' lines use, so the key at the foot lists those and no others. */
export type SheetSymbol = 'birth' | 'baptism' | 'death' | 'marriage';

export interface PersonSheet {
  subject: {
    id: string;
    given: string;
    surname: string;
    nick?: string;
    occupation?: string;
    /** « Né le 4 févr. 1921 à Kerguelen, Plouguerneau », then the death. */
    lines: string[];
    /** « Fils d’Auguste LENOIR et de Marie BRÉHIER ». */
    filiation?: string;
    otherNames?: string;
    unsure: boolean;
    portrait?: string;
  };
  parents: ParentCouple[];
  /** Empty when the subject has no brother or sister; otherwise the subject is among them. */
  siblings: SiblingRow[];
  unions: UnionBlock[];
  events: SheetEvent[];
  notes: string[];
  sources: SheetSource[];
  documents: SheetDocument[];
  leads: { open: SheetLead[]; done: SheetLead[] };
  symbols: SheetSymbol[];
  counts: {
    /** Everyone on the sheet, the subject included. */
    people: number;
    /** Living relatives, the subject not counted. */
    living: number;
    /** Relatives held back by a privacy mark and not already by discretion. */
    private: number;
    events: number;
    sources: number;
    leads: number;
  };
}

/** GEDCOM's RESN values that mean "do not show". `locked` is about editing and does not. */
const PRIVATE = /privacy|confidential/i;
const SYMBOL_ORDER: SheetSymbol[] = ['birth', 'baptism', 'death', 'marriage'];
const DOCUMENT_KIND: Record<MediaKind, StringKey> = {
  birth: 'docKindBirth',
  marriage: 'docKindMarriage',
  death: 'docKindDeath',
  photo: 'docKindPhoto',
  other: 'docKindOther',
};

interface Context {
  tree: Tree;
  lang: Lang;
  discreet: boolean;
  people: Set<string>;
  symbols: Set<SheetSymbol>;
}

/** Where, in the short form a relative's line can afford: the first two parts, « Brest, Finistère ». */
export function shortPlace(p: Place | undefined): string {
  if (!p) return '';
  const parts = p.parts.map((s) => s.trim()).filter((s) => s.length);
  return parts.length ? parts.slice(0, 2).join(', ') : p.text.trim();
}

const birthOf = (ind: Individual) => findEvent(ind.events, 'birth') ?? findEvent(ind.events, 'baptism');
const birthYear = (ind: Individual) => approximateYear(birthOf(ind)?.date);

/** Oldest first, the undated last, and otherwise the order the file gives (usually birth order already). */
function byBirth<T>(items: T[], ind: (x: T) => Individual): T[] {
  const key = (x: T) => birthYear(ind(x)) ?? Infinity;
  return [...items].sort((a, b) => (key(a) === key(b) ? 0 : key(a) - key(b)));
}

/** A union's place in time: its marriage, else any event of it, else its first child. */
function unionYear(tree: Tree, f: Family): number {
  const marriage = approximateYear(findEvent(f.events, 'marriage')?.date);
  if (marriage !== undefined) return marriage;
  const years = [
    ...f.events.map((e) => approximateYear(e.date)),
    ...f.childIds.map((id) => {
      const child = tree.individuals[id];
      return child ? birthYear(child) : undefined;
    }),
  ].filter((y): y is number => y !== undefined);
  return years.length ? Math.min(...years) : Infinity;
}

function byUnion(tree: Tree, families: Family[]): Family[] {
  const key = (f: Family) => unionYear(tree, f);
  return [...families].sort((a, b) => (key(a) === key(b) ? 0 : key(a) - key(b)));
}

function familiesOf(tree: Tree, ids: string[]): Family[] {
  return ids.map((id) => tree.families[id]).filter((f): f is Family => !!f);
}

/** Given names, the nickname if asked for, then the surname in capitals. */
function nameOf(ind: Individual, lang: Lang, withNick = false): string {
  const [given, surname] = nameParts(ind);
  const nick = withNick ? ind.names[0]?.nick : undefined;
  return [given, nick ? tf(lang, 'sheetNick', { nick }) : '', surname].filter(Boolean).join(' ') || '?';
}

/** « le 4 févr. 1921 », « en 1921 », « vers 1920 »: a date as the middle of a sentence. */
function when(d: GDate | undefined, lang: Lang): string {
  if (!d) return '';
  const s = formatDate(d, lang);
  if (!s || d.kind !== 'exact') return s;
  return tf(lang, d.date?.day !== undefined ? 'sheetOnDay' : 'sheetInPeriod', { date: s });
}

/** « ° 4 févr. 1921, Kerguelen, Plouguerneau »: a symbol, then the date and the short place, whichever are known. */
function fact(symbol: string, e: Event, lang: Lang): string {
  const what = [e.date ? formatDate(e.date, lang) : '', shortPlace(e.place)].filter(Boolean).join(', ');
  return what ? `${symbol} ${what}` : symbol;
}

const held = (ind: Individual, c: Context) => (c.discreet && isLiving(ind)) || PRIVATE.test(ind.restriction ?? '');

function facts(ind: Individual, c: Context): string[] {
  const out: string[] = [];
  const birth = findEvent(ind.events, 'birth');
  const born = birth ?? findEvent(ind.events, 'baptism');
  if (born && (born.date || born.place)) {
    c.symbols.add(birth ? 'birth' : 'baptism');
    out.push(fact(birth ? '°' : '~', born, c.lang));
  }
  const death = findEvent(ind.events, 'death');
  const burial = findEvent(ind.events, 'burial');
  if (death) {
    c.symbols.add('death');
    out.push(fact('†', death, c.lang));
  } else if (burial && (burial.date || burial.place)) {
    out.push(fact(eventLabel(c.lang, 'burial'), burial, c.lang));
  }
  return out;
}

function relative(ind: Individual, c: Context, tag?: string): Relative {
  c.people.add(ind.id);
  const reduced = held(ind, c);
  const year = birthYear(ind);
  return {
    id: ind.id,
    name: nameOf(ind, c.lang, true),
    facts: reduced ? (year === undefined ? [] : [`${tg(c.lang, 'sheetBornIn', ind.sex)} ${year}`]) : facts(ind, c),
    occupation: reduced ? undefined : ind.events.find((e) => e.type === 'occupation' && e.value)?.value,
    tag,
    unsure: !!ind.unsure,
    reduced,
  };
}

function mention(ind: Individual, c: Context, withYears: boolean): Mention {
  c.people.add(ind.id);
  const year = birthYear(ind);
  const years = !withYears ? '' : held(ind, c) ? (year === undefined ? '' : String(year)) : lifeYears(ind);
  return { id: ind.id, name: nameOf(ind, c.lang), years };
}

/** Who someone was with, named: the partners of each of their unions, oldest union first. */
function spousesOf(ind: Individual, c: Context): Mention[] {
  const out: Mention[] = [];
  for (const f of byUnion(c.tree, familiesOf(c.tree, ind.partnerIn))) {
    const id = f.husbandId === ind.id ? f.wifeId : f.husbandId;
    const partner = id ? c.tree.individuals[id] : undefined;
    if (partner && !out.some((m) => m.id === partner.id)) out.push(mention(partner, c, false));
  }
  if (out.length) c.symbols.add('marriage');
  return out;
}

/** Someone's children across all their unions, oldest first, named in passing. */
function childrenOf(ind: Individual, c: Context): Mention[] {
  const seen = new Set<string>();
  const kids: Individual[] = [];
  for (const f of familiesOf(c.tree, ind.partnerIn)) {
    for (const id of f.childIds) {
      const child = c.tree.individuals[id];
      if (child && !seen.has(id)) {
        seen.add(id);
        kids.push(child);
      }
    }
  }
  return byBirth(kids, (k) => k).map((k) => mention(k, c, true));
}

/** « x 12 juin 1948, Quimper, Finistère · Divorce 1990 », or the kind of union when there was no marriage. */
function unionLine(f: Family, c: Context): string {
  const parts: string[] = [];
  const marriage = findEvent(f.events, 'marriage');
  const divorce = findEvent(f.events, 'divorce');
  if (marriage) {
    c.symbols.add('marriage');
    parts.push(fact('x', marriage, c.lang));
  }
  if (divorce) parts.push([eventLabel(c.lang, 'divorce'), divorce.date ? formatDate(divorce.date, c.lang) : ''].filter(Boolean).join(' '));
  if (f.unionType === 'unmarried') parts.push(t(c.lang, 'unmarried'));
  if (f.unionType === 'civil') parts.push(t(c.lang, 'civil'));
  return parts.join(' · ');
}

const roleOf = (sex: Individual['sex']): StringKey => (sex === 'M' ? 'sheetFather' : sex === 'F' ? 'sheetMother' : 'sheetParent');

function parents(person: Individual, c: Context): ParentCouple[] {
  return person.childOf.flatMap((link) => {
    const f = c.tree.families[link.familyId];
    if (!f || (!f.husbandId && !f.wifeId)) return [];
    const tag = link.pedigree === 'adopted' ? tg(c.lang, 'adopted', person.sex) : undefined;
    const slot = (id: string | undefined, usual: 'M' | 'F'): ParentSlot => {
      const ind = id ? c.tree.individuals[id] : undefined;
      return ind
        ? { role: t(c.lang, roleOf(ind.sex)), person: relative(ind, c, tag) }
        : { role: t(c.lang, roleOf(usual)), unknown: tg(c.lang, 'unknownPerson', usual) };
    };
    return [{ familyId: f.id, slots: [slot(f.husbandId, 'M'), slot(f.wifeId, 'F')], union: unionLine(f, c) }];
  });
}

function siblings(person: Individual, c: Context): SiblingRow[] {
  const { tree, lang } = c;
  const own = familiesOf(
    tree,
    person.childOf.map((l) => l.familyId),
  );
  const ownIds = new Set(own.map((f) => f.id));
  const seen = new Set([person.id]);
  const found: Array<{ ind: Individual; side?: 'father' | 'mother' }> = [{ ind: person }];
  const add = (id: string, side?: 'father' | 'mother') => {
    const ind = tree.individuals[id];
    if (!ind || seen.has(id)) return;
    seen.add(id);
    found.push({ ind, side });
  };
  for (const f of own) for (const id of f.childIds) add(id);
  // Half-siblings: the other unions of each parent. The side is the parent's place in the family, as on the charts.
  for (const f of own) {
    for (const [parentId, side] of [
      [f.husbandId, 'father'],
      [f.wifeId, 'mother'],
    ] as const) {
      const parent = parentId ? tree.individuals[parentId] : undefined;
      for (const other of familiesOf(tree, parent?.partnerIn ?? [])) {
        if (!ownIds.has(other.id)) for (const id of other.childIds) add(id, side);
      }
    }
  }
  if (found.length < 2) return [];
  return byBirth(found, (x) => x.ind).map(({ ind, side }) => {
    if (ind.id === person.id) {
      return {
        id: ind.id,
        name: nameOf(ind, lang, true),
        facts: [t(lang, 'sheetSelf')],
        unsure: false,
        reduced: false,
        self: true,
        spouses: [],
        children: [],
      };
    }
    const tag = side ? tg(lang, side === 'father' ? 'sheetHalfByFather' : 'sheetHalfByMother', ind.sex) : undefined;
    return { ...relative(ind, c, tag), self: false, spouses: spousesOf(ind, c), children: childrenOf(ind, c) };
  });
}

function unions(person: Individual, c: Context): UnionBlock[] {
  const { tree, lang } = c;
  return byUnion(tree, familiesOf(tree, person.partnerIn)).map((f) => {
    const partnerId = f.husbandId === person.id ? f.wifeId : f.husbandId;
    const partner = partnerId ? tree.individuals[partnerId] : undefined;
    const kids = f.childIds.map((id) => tree.individuals[id]).filter((k): k is Individual => !!k);
    const children = byBirth(kids, (k) => k).map((child): ChildRow => {
      const adopted = child.childOf.find((l) => l.familyId === f.id)?.pedigree === 'adopted';
      return {
        ...relative(child, c, adopted ? tg(lang, 'adopted', child.sex) : undefined),
        spouses: spousesOf(child, c),
        children: childrenOf(child, c),
      };
    });
    const opposite = person.sex === 'M' ? 'F' : person.sex === 'F' ? 'M' : 'U';
    return {
      familyId: f.id,
      partner: partner ? relative(partner, c) : undefined,
      unknownPartner: partner ? undefined : tg(lang, 'unknownPerson', opposite),
      union: unionLine(f, c),
      children,
    };
  });
}

/** « Né le 4 févr. 1921 à Kerguelen, Plouguerneau »: one of the subject's own lines, or nothing when the event says nothing. */
function lifeLine(lead: string, e: Event | undefined, lang: Lang, tail = '', bare = false): string | undefined {
  if (!e) return undefined;
  const date = when(e.date, lang);
  const place = shortPlace(e.place);
  if (!date && !place && !bare) return undefined;
  return [lead, date, place ? tf(lang, 'sheetAtPlace', { place }) : ''].filter(Boolean).join(' ') + tail;
}

/** « Fils d’Auguste LENOIR et de Marie BRÉHIER », from the family the subject was born into. */
function filiation(person: Individual, c: Context): string | undefined {
  const link = person.childOf.find((l) => l.pedigree === 'birth') ?? person.childOf[0];
  const f = link ? c.tree.families[link.familyId] : undefined;
  const names = [f?.husbandId, f?.wifeId]
    .map((id) => (id ? c.tree.individuals[id] : undefined))
    .filter((p): p is Individual => !!p)
    .map((p) => nameOf(p, c.lang));
  // French elides before a vowel or a mute h: « d’Auguste », « d’Henri », but « de Marie ».
  const of = (name: string) => tf(c.lang, /^[aeiouyhàâäéèêëîïôöùûüœæ]/i.test(name) ? 'sheetOfVowel' : 'sheetOf', { name });
  const rel = tg(c.lang, 'sheetChildOf', person.sex);
  if (names.length === 2) return tf(c.lang, 'sheetFiliationTwo', { rel, a: of(names[0]!), b: of(names[1]!) });
  if (names.length === 1) return tf(c.lang, 'sheetFiliationOne', { rel, a: of(names[0]!) });
  return undefined;
}

export function personSheet(tree: Tree, id: string, opts: SheetOptions): PersonSheet | null {
  const person = tree.individuals[id];
  if (!person) return null;
  const { lang } = opts;
  const c: Context = { tree, lang, discreet: opts.discreet, people: new Set([person.id]), symbols: new Set() };

  const rows = eventRows(tree, person, lang);
  const [given, surname] = nameParts(person);
  const birth = findEvent(person.events, 'birth');
  const baptism = findEvent(person.events, 'baptism');
  const death = findEvent(person.events, 'death');
  const burial = findEvent(person.events, 'burial');
  // Exact from two full dates; otherwise what the Fiche tab says (the age the file states, else an estimate).
  const computed = death ? computeAge((birth ?? baptism)?.date, death.date) : undefined;
  const age = computed && !computed.approx ? formatAge(lang, computed) : rows.find((r) => r.type === 'death')?.age;
  const others = person.names
    .slice(1)
    .map((n) => [n.given, n.surname].filter(Boolean).join(' ') + (n.type ? ` (${n.type})` : ''))
    .filter((s) => s.trim());
  const lines = [
    birth ? lifeLine(tg(lang, 'sheetBorn', person.sex), birth, lang) : lifeLine(tg(lang, 'sheetBaptised', person.sex), baptism, lang),
    death
      ? lifeLine(tg(lang, 'sheetDied', person.sex), death, lang, age ? `, ${tf(lang, 'sheetAgeAtDeath', { age })}` : '', true)
      : lifeLine(tg(lang, 'sheetBuried', person.sex), burial, lang),
  ].filter((l): l is string => !!l);

  const parentCouples = parents(person, c);
  const siblingRows = siblings(person, c);
  const unionBlocks = unions(person, c);

  // Sources are numbered in the order the sheet first cites them, and a source cited twice keeps its number.
  const sources: SheetSource[] = [];
  const numbers = new Map<string, number>();
  const cite = (about: string, cites: Citation[]): number[] => {
    const refs: number[] = [];
    for (const cit of cites) {
      const text = citationText(tree, cit);
      if (!text) continue;
      let n = numbers.get(text);
      if (n === undefined) {
        n = sources.length + 1;
        numbers.set(text, n);
        sources.push({ n, about: [about], text });
      } else if (!sources[n - 1]!.about.includes(about)) sources[n - 1]!.about.push(about);
      if (!refs.includes(n)) refs.push(n);
    }
    return refs;
  };
  if (opts.sources) cite(t(lang, 'identity'), person.citations);
  const events: SheetEvent[] = rows.map((r) => ({
    key: r.key,
    date: r.date ?? '—',
    label: r.label,
    lines: [
      ...r.lines,
      ...(r.cause ? [tf(lang, 'sheetLabelled', { label: t(lang, 'cause'), value: r.cause })] : []),
      ...(r.age ? [tf(lang, 'sheetLabelled', { label: t(lang, 'age'), value: r.age })] : []),
    ],
    refs: opts.sources ? cite(r.label, r.citations) : [],
  }));

  const portrait = portraitId(person, tree);
  const documents: SheetDocument[] = !opts.sources
    ? []
    : person.mediaIds
        .filter((m) => m !== portrait && tree.media[m])
        .map((m) => {
          const media = tree.media[m]!;
          const kind = t(lang, DOCUMENT_KIND[media.kind ?? 'photo']);
          const date = media.date ? formatDate(media.date, lang) : '';
          return { id: m, title: media.title?.trim() || kind, detail: [media.title?.trim() ? kind : '', date].filter(Boolean).join(' · ') };
        });

  const leads = person.leads ?? [];
  const lead = (l: Lead): SheetLead => ({ id: l.id, title: l.title, note: l.note || undefined, url: l.url || undefined });
  const relatives = [...c.people].filter((p) => p !== person.id).map((p) => tree.individuals[p]!);

  return {
    subject: {
      id: person.id,
      given,
      surname,
      nick: person.names[0]?.nick,
      occupation: person.events.find((e) => e.type === 'occupation' && e.value)?.value,
      lines,
      filiation: filiation(person, c),
      otherNames: others.length ? tf(lang, 'sheetOtherNames', { names: others.join(', ') }) : undefined,
      unsure: !!person.unsure,
      portrait,
    },
    parents: parentCouples,
    siblings: siblingRows,
    unions: unionBlocks,
    events,
    notes: opts.notes
      ? person.notes
          .flatMap((n) => n.split(/\n\s*\n/))
          .map((p) => p.trim())
          .filter(Boolean)
      : [],
    sources,
    documents,
    leads: opts.leads
      ? { open: leads.filter((l) => !l.done).map(lead), done: leads.filter((l) => l.done).map(lead) }
      : { open: [], done: [] },
    symbols: SYMBOL_ORDER.filter((s) => c.symbols.has(s)),
    counts: {
      people: c.people.size,
      living: relatives.filter(isLiving).length,
      private: relatives.filter((r) => PRIVATE.test(r.restriction ?? '') && !(opts.discreet && isLiving(r))).length,
      events: events.length,
      sources: sources.length,
      leads: opts.leads ? leads.length : 0,
    },
  };
}
