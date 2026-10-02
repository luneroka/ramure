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

export function eventRows(tree: Tree, person: Individual, lang: Lang): LifeRow[] {
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
      if (partner) lines.push(`${t(lang, 'with')} ${displayName(partner)}`);
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

/** What a citation says, the way the panel and the sheet both write it: the source's title, the page, the transcription. */
export function citationText(tree: Tree, c: Citation): string {
  const src = c.sourceId ? tree.sources[c.sourceId] : undefined;
  return src ? [src.title, c.page, c.text].filter(Boolean).join(' · ') : [c.flat, c.text].filter(Boolean).join(' · ');
}

export function sourceRows(tree: Tree, person: Individual, lang: Lang): Array<{ label: string; text: string }> {
  const out: Array<{ label: string; text: string }> = [];
  const push = (label: string, cites: Event['citations']) => {
    for (const c of cites) {
      const text = citationText(tree, c);
      if (text) out.push({ label, text });
    }
  };
  push(t(lang, 'identity'), person.citations);
  for (const e of person.events) push(eventLabel(lang, e.type, e.customType), e.citations);
  for (const fid of person.partnerIn) {
    const f = tree.families[fid];
    if (f) for (const e of f.events) push(eventLabel(lang, e.type, e.customType), e.citations);
  }
  return out;
}
