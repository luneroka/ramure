/**
 * The timeline (« Frise »): one bar per person across the years, grouped by
 * generation the way the overview lays them out. Pure: the view only draws.
 */

import { approximateYear } from '../gedcom/dates';
import { displayName, findEvent, type Individual, type Tree } from '../gedcom/model';
import { isLiving } from '../canvas/renderer';
import { generationLabel } from './layout';
import { layoutEverything } from './layoutAll';

export interface TimelineMark {
  year: number;
  /** The other spouse, when known. */
  spouseId?: string;
  spouseName?: string;
}

export interface TimelineBar {
  id: string;
  name: string;
  sex: Individual['sex'];
  /** First known year (birth, else baptism). */
  start: number;
  /** Last known year: death or burial, today when living, else an estimate. */
  end: number;
  living: boolean;
  /** The end is a guess: no death known and not considered living. */
  openEnd: boolean;
  /** Years came from about/estimated/before/after dates. */
  approx: boolean;
  unsure: boolean;
  marriages: TimelineMark[];
}

export interface TimelineGroup {
  gen: number;
  label: string;
  bars: TimelineBar[];
}

export interface Timeline {
  from: number;
  to: number;
  groups: TimelineGroup[];
  /** People with no usable year at all, by name. */
  undated: Array<{ id: string; name: string }>;
}

const ESTIMATED_LIFESPAN = 80;

function yearOf(ind: Individual, types: Array<'birth' | 'baptism' | 'death' | 'burial'>): { year: number; approx: boolean } | undefined {
  for (const t of types) {
    const d = findEvent(ind.events, t)?.date;
    const y = approximateYear(d);
    if (y !== undefined) return { year: y, approx: d?.kind !== 'exact' };
  }
  return undefined;
}

export function buildTimeline(tree: Tree, lang: 'fr' | 'en', today = new Date().getFullYear()): Timeline {
  const layout = layoutEverything(tree);
  const genOf = new Map(layout.nodes.map((n) => [n.id, n.gen] as const));
  const byGen = new Map<number, TimelineBar[]>();
  const undated: Array<{ id: string; name: string }> = [];
  for (const ind of Object.values(tree.individuals)) {
    const name = displayName(ind);
    const b = yearOf(ind, ['birth', 'baptism']);
    const d = yearOf(ind, ['death', 'burial']);
    if (!b && !d) {
      undated.push({ id: ind.id, name });
      continue;
    }
    const living = isLiving(ind);
    const start = b?.year ?? d!.year - ESTIMATED_LIFESPAN;
    let end: number;
    let openEnd = false;
    if (d) end = d.year;
    else if (living) end = today;
    else {
      end = Math.min(start + ESTIMATED_LIFESPAN, today);
      openEnd = true;
    }
    const marriages: TimelineMark[] = [];
    for (const fid of ind.partnerIn) {
      const f = tree.families[fid];
      if (!f) continue;
      const y = approximateYear(findEvent(f.events, 'marriage')?.date);
      if (y === undefined) continue;
      const other = f.husbandId === ind.id ? f.wifeId : f.husbandId;
      const spouse = other ? tree.individuals[other] : undefined;
      marriages.push({ year: y, spouseId: spouse?.id, spouseName: spouse ? displayName(spouse) : undefined });
    }
    const bar: TimelineBar = {
      id: ind.id,
      name,
      sex: ind.sex,
      start,
      end: Math.max(end, start),
      living,
      openEnd,
      approx: !!(b?.approx || d?.approx || !b),
      unsure: !!ind.unsure,
      marriages,
    };
    const gen = genOf.get(ind.id) ?? 0;
    byGen.set(gen, [...(byGen.get(gen) ?? []), bar]);
  }
  // Oldest generation first, like the overview; within a generation, by birth.
  const gens = [...byGen.keys()].sort((a, b) => b - a);
  const groups: TimelineGroup[] = gens.map((gen) => ({
    gen,
    label: layout.rowLabels?.get(gen) ?? generationLabel(gen, lang),
    bars: byGen.get(gen)!.sort((x, y) => x.start - y.start || x.name.localeCompare(y.name)),
  }));
  const all = groups.flatMap((g) => g.bars);
  const from = all.length ? Math.min(...all.map((b) => b.start)) : today - 100;
  const to = all.length ? Math.max(...all.map((b) => b.end), today) : today;
  undated.sort((a, b) => a.name.localeCompare(b.name));
  return { from: Math.floor(from / 10) * 10 - 10, to: Math.ceil(to / 10) * 10, groups, undated };
}
