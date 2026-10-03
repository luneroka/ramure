/**
 * A person's life as a list of rows: what the Fiche tab of the panel shows, and
 * what the printed person sheet lists under « Événements ».
 *
 * Both read this one function so the screen and the paper cannot drift apart:
 * the same events, the same union events seen from this person, the same order
 * (birth first, then by year, undated last). The rows carry the citations of
 * the event they come from, which the panel ignores and the sheet numbers.
 */

import { approximateYear, formatDate } from '@/gedcom/dates';
import { computeAge } from '@/gedcom/age';
import { displayName, findEvent, placeText, type Citation, type Event, type EventType, type Individual, type Tree } from '@/gedcom/model';
import { eventLabel, formatAge, t, type Lang } from '@/i18n';
import type { FamilyPatch, PersonPatch } from '@/tree/edit';

/** One row of the life timeline: a person event, or a union event seen from this person. */
export interface LifeRow {
  key: string;
  type: EventType;
  label: string;
  date?: string;
  year?: number;
  lines: string[];
  cause?: string;
  age?: string;
  citations: Citation[];
}

const UNION_EVENTS = new Set<EventType>(['marriage', 'divorce', 'engagement', 'separation', 'annulment']);

/** `nameOf` writes the partner in a union event: the panel uses the file's spelling, the printed sheet its capitals. */
export function eventRows(tree: Tree, person: Individual, lang: Lang, nameOf: (ind: Individual) => string = displayName): LifeRow[] {
  const birth = findEvent(person.events, 'birth') ?? findEvent(person.events, 'baptism');
  // An undated, unplaced occupation is the subtitle of the hero, not a timeline row.
  const rows: LifeRow[] = person.events
    .filter((e) => !(e.type === 'occupation' && !e.date && !e.place))
    .map((e, i) => {
      const lines: string[] = [];
      if (e.value) lines.push(e.value);
      if (e.place) lines.push(placeText(e.place));
      if (e.address) lines.push(e.address);
      lines.push(...e.notes);
      const age =
        e.type === 'death'
          ? e.age
            ? e.age.replace(/y$/, ' ' + (lang === 'fr' ? 'ans' : 'y'))
            : (() => {
                const a = computeAge(birth?.date, e.date);
                return a ? formatAge(lang, a) : undefined;
              })()
          : undefined;
      return {
        key: `e${i}`,
        type: e.type,
        label: eventLabel(lang, e.type, e.customType),
        date: e.date ? formatDate(e.date, lang) : undefined,
        year: approximateYear(e.date),
        lines,
        cause: e.cause,
        age,
        citations: e.citations,
      };
    });
  for (const fid of person.partnerIn) {
    const f = tree.families[fid];
    if (!f) continue;
    const partnerId = f.husbandId === person.id ? f.wifeId : f.husbandId;
    const partner = partnerId ? tree.individuals[partnerId] : undefined;
    for (const e of f.events) {
      if (!UNION_EVENTS.has(e.type)) continue;
      const lines: string[] = [];
      if (partner) lines.push(`${t(lang, 'with')} ${nameOf(partner)}`);
      if (e.place) lines.push(placeText(e.place));
      lines.push(...e.notes);
      rows.push({
        key: `f${fid}${e.type}`,
        type: e.type,
        label: eventLabel(lang, e.type, e.customType),
        date: e.date ? formatDate(e.date, lang) : undefined,
        year: approximateYear(e.date),
        lines,
        citations: e.citations,
      });
    }
  }
  const order = (r: LifeRow) => (r.label === eventLabel(lang, 'birth') ? -Infinity : (r.year ?? Infinity));
  return rows.sort((a, b) => order(a) - order(b));
}

/** What a citation says, the way the sheet writes it: the source's title, the page, the transcription, a written source's link after its text, then its notes. */
export function citationText(tree: Tree, c: Citation): string {
  const src = c.sourceId ? tree.sources[c.sourceId] : undefined;
  const said = src ? [src.title, c.page, c.text] : [c.flat?.split('\n').join(' — '), c.text];
  return [...said, ...c.notes].filter(Boolean).join(' · ');
}

/** Where a citation listed in the panel lives: on the person, on one of their events, or on an event of one of their unions. */
export type SourceAt =
  | { on: 'person'; index: number }
  | { on: 'event'; event: number; index: number }
  | { on: 'family'; familyId: string; event: number; index: number };

export interface SourceRow {
  key: string;
  /** The event it backs; none for a source about the person as a whole. */
  label?: string;
  citation: Citation;
  at: SourceAt;
}

/** Every source the panel lists for a person: their own first, then their events', then their unions'. */
export function sourceRows(tree: Tree, person: Individual, lang: Lang): SourceRow[] {
  const out: SourceRow[] = [];
  person.citations.forEach((citation, index) => out.push({ key: `p${index}`, citation, at: { on: 'person', index } }));
  person.events.forEach((e, event) =>
    e.citations.forEach((citation, index) =>
      out.push({ key: `e${event}.${index}`, label: eventLabel(lang, e.type, e.customType), citation, at: { on: 'event', event, index } }),
    ),
  );
  for (const familyId of person.partnerIn) {
    tree.families[familyId]?.events.forEach((e, event) =>
      e.citations.forEach((citation, index) =>
        out.push({
          key: `f${familyId}.${event}.${index}`,
          label: eventLabel(lang, e.type, e.customType),
          citation,
          at: { on: 'family', familyId, event, index },
        }),
      ),
    );
  }
  return out.filter((r) => citationText(tree, r.citation));
}

/** The edit that replaces the citation at `at` with `next`, or removes it when `next` is null. */
export type SourceChange = { person: PersonPatch } | { family: string; patch: FamilyPatch };

export function sourceChange(tree: Tree, person: Individual, at: SourceAt, next: Citation | null): SourceChange | null {
  const swap = (list: Citation[]): Citation[] =>
    next ? list.map((c, i) => (i === at.index ? next : c)) : list.filter((_, i) => i !== at.index);
  const inEvent = (events: Event[], event: number): Event[] | null =>
    events[event] ? events.map((e, i) => (i === event ? { ...e, citations: swap(e.citations) } : e)) : null;
  if (at.on === 'person') return { person: { citations: swap(person.citations) } };
  if (at.on === 'event') {
    const events = inEvent(person.events, at.event);
    return events && { person: { events } };
  }
  const fam = tree.families[at.familyId];
  const events = fam && inEvent(fam.events, at.event);
  return events ? { family: at.familyId, patch: { events } } : null;
}
