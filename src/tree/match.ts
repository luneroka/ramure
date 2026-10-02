/**
 * Recognising, in a tree, the people and families a GEDCOM file describes.
 *
 * Completing a tree from a file (graft.ts) first has to know which of the
 * file's people the tree already holds, and the file's ids cannot say.
 * Geneanet renumbers families on every export and keeps person numbers only
 * while the order happens to hold, and a stored tree keeps the ids of its own
 * first import. So people are recognised by what they are — names, sex, the
 * years of their lives — and above all by whom they are related to.
 *
 * The matcher is cautious on purpose. A pair is accepted only when it is the
 * one plausible candidate on both sides. A miss costs a duplicate, which the
 * checks flag and « Fusionner avec un doublon » repairs; a wrong match would
 * write a stranger's facts onto somebody's ancestor, and nothing would say so.
 *
 * It works outwards from certainties: first the people whose name and dates
 * leave no doubt, then the families those people belong to, then the parents,
 * partners and children those families name, round after round until nothing
 * more can be recognised.
 */

import { approximateYear, type GDate, type SimpleDate } from '../gedcom/dates';
import type { Family, Individual, Sex, Tree } from '../gedcom/model';
import { fold } from '../util/text';
import { isGeneratedId } from './ids';

/** What the file and the tree have in common, from the file's ids to the tree's. */
export interface Matches {
  people: Map<string, string>;
  /** Several of the file's families may land on one of the tree's: a file can describe a couple twice. */
  families: Map<string, string>;
}

/** The years a date allows, widened by the date's own vagueness. */
export interface Span {
  lo: number;
  hi: number;
  /** A plain year or a full date, as opposed to a range or an estimate. */
  exact: boolean;
}

/** How far apart two years may be and still belong to one life: a misread register, an age rounded at a wedding. */
const SLACK = 2;

function yearOf(d: SimpleDate | undefined): number | undefined {
  return d?.year === undefined ? undefined : approximateYear({ raw: '', kind: 'exact', date: d });
}

export function yearSpan(d: GDate | undefined): Span | undefined {
  const a = yearOf(d?.date);
  if (!d || a === undefined) return undefined;
  switch (d.kind) {
    case 'exact':
      return { lo: a, hi: a, exact: true };
    case 'about':
    case 'calculated':
    case 'estimated':
      return { lo: a - SLACK, hi: a + SLACK, exact: false };
    case 'before':
    case 'to':
      return { lo: -Infinity, hi: a, exact: false };
    case 'after':
    case 'from':
      return { lo: a, hi: Infinity, exact: false };
    case 'between':
    case 'from-to': {
      const b = yearOf(d.date2);
      return b === undefined ? undefined : { lo: Math.min(a, b), hi: Math.max(a, b), exact: false };
    }
    default:
      return undefined;
  }
}

export type YearFit = 'same' | 'near' | 'unknown' | 'conflict';

export function yearFit(a: Span | undefined, b: Span | undefined): YearFit {
  if (!a || !b) return 'unknown';
  if (a.lo > b.hi + SLACK || b.lo > a.hi + SLACK) return 'conflict';
  // The same date, however vague, written twice: « 1738 » and « 1738 », or « ABT 1738 » and « ABT 1738 ».
  return a.lo === b.lo && a.hi === b.hi ? 'same' : 'near';
}

/** The words of a name, folded: « Jean-Baptiste » gives jean, baptiste. Any script counts as letters. */
export function words(s: string): string[] {
  return fold(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0);
}

/** A surname as one key, so « Le Goff », « LE GOFF » and « Legoff » agree, and so do « L'Haridon » and « Lharidon ». */
export function surnameKey(s: string): string {
  return words(s).join('');
}

interface Profile {
  id: string;
  /** Only names that say something: an empty « // » is dropped. */
  names: Array<{ given: string[]; surname: string }>;
  sex: Sex;
  birth?: Span;
  death?: Span;
}

/** A life's first or last year: the event itself, or the one that stands for it in parish registers. */
function lifeYear(ind: Individual, main: 'birth' | 'death', standIn: 'baptism' | 'burial'): Span | undefined {
  const dated = (type: string) => ind.events.find((e) => e.type === type && e.date)?.date;
  return yearSpan(dated(main)) ?? yearSpan(dated(standIn));
}

function profile(ind: Individual): Profile {
  return {
    id: ind.id,
    names: ind.names.map((n) => ({ given: words(n.given), surname: surnameKey(n.surname) })).filter((n) => n.given.length || n.surname),
    sex: ind.sex,
    birth: lifeYear(ind, 'birth', 'baptism'),
    death: lifeYear(ind, 'death', 'burial'),
  };
}

const sexFits = (a: Profile, b: Profile): boolean => a.sex === b.sex || a.sex === 'U' || b.sex === 'U';

/** 3: the same given names; 2: the same first one, or one list inside the other; 1: one side unknown; 0: different. */
function givenFit(x: string[], y: string[]): number {
  if (!x.length || !y.length) return 1;
  if (x.length === y.length && x.every((w, i) => w === y[i])) return 3;
  const [few, many] = x.length <= y.length ? [x, y] : [y, x];
  return x[0] === y[0] || few.every((w) => many.includes(w)) ? 2 : 0;
}

/** One letter apart, in surnames long enough that this is a spelling rather than another name: « Le Gall », « Le Gal ». */
function oneLetterApart(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false;
  let head = 0;
  while (head < a.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  return a.length - head - tail <= 1 && b.length - head - tail <= 1;
}

/** The best fit between any of two people's names, scored like `givenFit`; 0 when no surname agrees. */
function nameFit(a: Profile, b: Profile, spelling = false): number {
  let best = 0;
  for (const x of a.names) {
    for (const y of b.names) {
      if (x.surname !== y.surname && !(spelling && oneLetterApart(x.surname, y.surname))) continue;
      let fit = givenFit(x.given, y.given);
      // Without a surname, a name says little, and nothing at all unless both given names speak.
      if (!x.surname) fit = fit === 1 ? 0 : Math.min(fit, 2);
      best = Math.max(best, fit);
    }
  }
  return best;
}

function sameGiven(a: Profile, b: Profile): boolean {
  return a.names.some(
    (x) => x.given.length > 0 && b.names.some((y) => y.given.length === x.given.length && y.given.every((w, i) => w === x.given[i])),
  );
}

/**
 * Name, sex and dates leave no doubt: the same full name, and a year known on
 * both sides that agrees. Without one, only two people nobody is linked to on
 * either side: anyone with a family would have been found through it, and a
 * name alone is too common to go on.
 */
function certain(a: Profile, b: Profile, alone: boolean): boolean {
  if (!sexFits(a, b) || nameFit(a, b) < 3) return false;
  const birth = yearFit(a.birth, b.birth);
  const death = yearFit(a.death, b.death);
  if (birth === 'conflict' || death === 'conflict') return false;
  return birth !== 'unknown' || death !== 'unknown' || alone;
}

const unlinked = (ind: Individual | undefined): boolean => !!ind && ind.childOf.length === 0 && ind.partnerIn.length === 0;

/**
 * How well two people fit one place in families already matched: the father
 * of a recognised child, the wife in a recognised couple, a child of a
 * recognised couple. The place is most of the evidence, so less is asked of
 * the names than for `certain` — but a child is one of several, while a
 * parent or a partner (`slot`) is the only one there is.
 *
 * `loose` lets the same given names under another surname through — a maiden
 * and a married name, or a misspelling — when the family has other evidence.
 */
function relativeFit(a: Profile, b: Profile, slot: boolean, loose: boolean): number {
  if (!sexFits(a, b)) return 0;
  const birth = yearFit(a.birth, b.birth);
  const death = yearFit(a.death, b.death);
  if (birth === 'conflict' || death === 'conflict') return 0;
  // Names weigh most; years then tell candidates apart, the same year more than a close one, so two
  // sisters both called Marie, born two years apart, each find their own.
  const years = YEARS[birth] + YEARS[death];
  const fit = nameFit(a, b, true);
  if (fit >= 2) return fit * 5 + years;
  if (fit === 1 || (!a.names.length && !b.names.length)) return slot || years > 0 ? 5 + years : 0;
  return slot && loose && sameGiven(a, b) ? 5 : 0;
}

const YEARS: Record<YearFit, number> = { same: 2, near: 1, unknown: 0, conflict: 0 };

const birthLink = (pedigree: string): boolean => pedigree === 'birth' || pedigree === 'unknown';

function parents(tree: Tree, id: string): Array<string | undefined> {
  const link = tree.individuals[id]?.childOf.find((l) => birthLink(l.pedigree));
  const fam = link ? tree.families[link.familyId] : undefined;
  return [fam?.husbandId, fam?.wifeId];
}

class Matcher {
  readonly people = new Map<string, string>();
  readonly families = new Map<string, string>();
  /** The tree's people already taken, and by whom in the file. */
  private readonly claimed = new Map<string, string>();
  private readonly familyClaimed = new Map<string, string>();
  private readonly mine = new Map<string, Profile>();
  private readonly theirs = new Map<string, Profile>();
  private readonly bySurname = new Map<string, string[]>();

  constructor(
    private readonly tree: Tree,
    private readonly file: Tree,
  ) {
    for (const ind of Object.values(tree.individuals)) {
      const p = profile(ind);
      this.mine.set(ind.id, p);
      for (const key of new Set(p.names.map((n) => n.surname).filter(Boolean))) {
        const list = this.bySurname.get(key);
        if (list) list.push(ind.id);
        else this.bySurname.set(key, [ind.id]);
      }
    }
    for (const ind of Object.values(file.individuals)) this.theirs.set(ind.id, profile(ind));
  }

  private pair(fileId: string, treeId: string): void {
    this.people.set(fileId, treeId);
    this.claimed.set(treeId, fileId);
  }

  private free(treeId: string): boolean {
    return !this.claimed.has(treeId);
  }

  /** Ramure's own ids are random and never reused: the same one on both sides is the same record, coming home in an export. */
  identity(): void {
    for (const [id, p] of this.theirs) {
      const q = this.mine.get(id);
      if (isGeneratedId(id) && q && sexFits(p, q)) this.pair(id, id);
    }
  }

  /** People that name and dates leave no doubt about: the only candidate on both sides, among those not yet placed. */
  seed(): boolean {
    const wants = new Map<string, string[]>();
    const wanted = new Map<string, number>();
    for (const p of this.theirs.values()) {
      if (this.people.has(p.id)) continue;
      const found = new Set<string>();
      const alone = unlinked(this.file.individuals[p.id]);
      for (const n of p.names) {
        for (const id of this.bySurname.get(n.surname) ?? []) {
          const q = this.mine.get(id);
          if (q && this.free(id) && certain(p, q, alone && unlinked(this.tree.individuals[id])) && this.parentsAgree(p.id, id))
            found.add(id);
        }
      }
      wants.set(p.id, [...found]);
      for (const id of found) wanted.set(id, (wanted.get(id) ?? 0) + 1);
    }
    let grew = false;
    for (const [fileId, ids] of wants) {
      const only = ids.length === 1 ? ids[0] : undefined;
      if (only !== undefined && wanted.get(only) === 1) {
        this.pair(fileId, only);
        grew = true;
      }
    }
    return grew;
  }

  /** Two people whose known parents are plainly different people are not one person, whatever their names. */
  private parentsAgree(fileId: string, treeId: string): boolean {
    const theirs = parents(this.file, fileId);
    const mine = parents(this.tree, treeId);
    return theirs.every((x, i) => {
      const y = mine[i];
      if (!x || !y) return true;
      const placed = this.people.get(x);
      if (placed !== undefined) return placed === y;
      const p = this.theirs.get(x);
      const q = this.mine.get(y);
      return !!p && !!q && this.free(y) && relativeFit(p, q, true, false) > 0;
    });
  }

  /**
   * Evidence that two couples are one: 2 for each partner already recognised
   * there, 1 for a partner who fits the place; null when a place is plainly
   * somebody else's. A partner missing on either side says nothing.
   */
  private couplesFit(fileSlots: Array<string | undefined>, treeSlots: Array<string | undefined>, loose: boolean): number | null {
    let score = 0;
    for (let i = 0; i < fileSlots.length; i++) {
      const x = fileSlots[i];
      const y = treeSlots[i];
      if (!x || !y) continue;
      const placed = this.people.get(x);
      if (placed !== undefined) {
        if (placed !== y) return null;
        score += 2;
        continue;
      }
      const p = this.theirs.get(x);
      const q = this.mine.get(y);
      if (!p || !q || !this.free(y) || relativeFit(p, q, true, loose) === 0) return null;
      score += 1;
    }
    return score;
  }

  /** Partners in the order they face the tree's family: crossed when the file has them the other way round. */
  private orient(fi: Family, fe: Family): Array<string | undefined> {
    const crossed = this.people.get(fi.husbandId ?? '') === fe.wifeId || this.people.get(fi.wifeId ?? '') === fe.husbandId;
    return crossed ? [fi.wifeId, fi.husbandId] : [fi.husbandId, fi.wifeId];
  }

  private sharedChildren(fi: Family, fe: Family): number {
    return fi.childIds.filter((c) => {
      const q = this.people.get(c);
      return q !== undefined && fe.childIds.includes(q);
    }).length;
  }

  private familyFit(fi: Family, fe: Family): number {
    const shared = this.sharedChildren(fi, fe);
    const treeSlots = [fe.husbandId, fe.wifeId];
    const partners =
      this.couplesFit([fi.husbandId, fi.wifeId], treeSlots, shared > 0) ??
      this.couplesFit([fi.wifeId, fi.husbandId], treeSlots, shared > 0);
    if (partners === null) return 0;
    return partners + shared + (isGeneratedId(fi.id) && fi.id === fe.id ? 3 : 0);
  }

  /** Both partners recognised, and they are exactly this family's couple. */
  private sameCouple(fi: Family, fe: Family): boolean {
    const h = fi.husbandId && this.people.get(fi.husbandId);
    const w = fi.wifeId && this.people.get(fi.wifeId);
    if (!h || !w) return false;
    return (h === fe.husbandId && w === fe.wifeId) || (h === fe.wifeId && w === fe.husbandId);
  }

  /** Families with a recognised member, matched to the tree family that member belongs to when one fits best. */
  matchFamilies(): boolean {
    let grew = false;
    for (const fi of Object.values(this.file.families)) {
      if (this.families.has(fi.id)) continue;
      const seen = new Set<string>();
      for (const pid of [fi.husbandId, fi.wifeId]) {
        const q = pid === undefined ? undefined : this.people.get(pid);
        for (const f of (q && this.tree.individuals[q]?.partnerIn) || []) seen.add(f);
      }
      for (const cid of fi.childIds) {
        const q = this.people.get(cid);
        for (const l of (q && this.tree.individuals[q]?.childOf) || []) seen.add(l.familyId);
      }
      const scored: Array<{ fe: Family; score: number }> = [];
      for (const id of seen) {
        const fe = this.tree.families[id];
        if (!fe) continue;
        // A tree family already spoken for takes a second file family only when it is the same couple again.
        if (this.familyClaimed.has(id) && !this.sameCouple(fi, fe)) continue;
        const score = this.familyFit(fi, fe);
        if (score > 0) scored.push({ fe, score });
      }
      const top = Math.max(0, ...scored.map((s) => s.score));
      const best = scored.filter((s) => s.score === top);
      // A tie between families of one same couple is no doubt about who they are: take the first.
      const pick = best.length === 1 || (best.length > 1 && best.every((s) => this.sameCouple(fi, s.fe))) ? best[0] : undefined;
      if (pick) {
        this.families.set(fi.id, pick.fe.id);
        if (!this.familyClaimed.has(pick.fe.id)) this.familyClaimed.set(pick.fe.id, fi.id);
        grew = true;
      }
    }
    return grew;
  }

  /** The best candidate by `score`, or none when two share the top. */
  private static best(list: string[], score: (x: string) => number): string | undefined {
    let top = 0;
    let pick: string | undefined;
    let tie = false;
    for (const x of list) {
      const s = score(x);
      if (s > top) {
        top = s;
        pick = x;
        tie = false;
      } else if (s === top && s > 0) tie = true;
    }
    return tie ? undefined : pick;
  }

  /** In families matched on both sides, the partners and children not yet placed. */
  matchRelatives(): boolean {
    let grew = false;
    for (const [fid, tid] of this.families) {
      const fi = this.file.families[fid];
      const fe = this.tree.families[tid];
      if (!fi || !fe) continue;
      const loose = this.sharedChildren(fi, fe) > 0;
      const slots = this.orient(fi, fe);
      [fe.husbandId, fe.wifeId].forEach((y, i) => {
        const x = slots[i];
        if (!x || !y || this.people.has(x) || !this.free(y)) return;
        const p = this.theirs.get(x);
        const q = this.mine.get(y);
        if (p && q && relativeFit(p, q, true, loose) > 0) {
          this.pair(x, y);
          grew = true;
        }
      });
      const fit = (x: string, y: string): number => {
        const p = this.theirs.get(x);
        const q = this.mine.get(y);
        return p && q ? relativeFit(p, q, false, false) : 0;
      };
      for (const k of fi.childIds) {
        if (this.people.has(k)) continue;
        const open = fe.childIds.filter((c) => this.free(c));
        const t = Matcher.best(open, (c) => fit(k, c));
        if (t === undefined) continue;
        const rivals = fi.childIds.filter((c) => !this.people.has(c));
        if (Matcher.best(rivals, (c) => fit(c, t)) === k) {
          this.pair(k, t);
          grew = true;
        }
      }
    }
    return grew;
  }
}

/** Recognise the file's people and families in the tree. Pure: neither tree is changed. */
export function matchTrees(tree: Tree, file: Tree): Matches {
  const m = new Matcher(tree, file);
  m.identity();
  for (;;) {
    let grew = m.seed();
    while (m.matchFamilies() || m.matchRelatives()) grew = true;
    if (!grew) break;
  }
  return { people: m.people, families: m.families };
}
