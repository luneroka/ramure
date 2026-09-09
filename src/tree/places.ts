/**
 * Places across the tree: one entry per distinct place text, with the
 * events that mention it, and the op that writes coordinates back into every
 * event carrying that place. Pure, so the Worker replays it too.
 */

import { approximateYear } from '../gedcom/dates';
import { displayName, placeText, type Event, type EventType, type Place, type Tree } from '../gedcom/model';
import { fold } from '../util/text';
import type { EditResult } from './edit';

export interface PlaceMention {
  personId: string;
  personName: string;
  type: EventType;
  customType?: string;
  year?: number;
  /** Set when the event belongs to a union rather than a person. */
  familyId?: string;
}

export interface PlaceEntry {
  key: string;
  text: string;
  place: Place;
  lat?: number;
  lon?: number;
  mentions: PlaceMention[];
}

/** Empty hierarchy slots (« , Quimper, Finistère ») do not count: the readable text is the identity. */
export function placeKey(p: Place): string {
  return fold(placeText(p));
}

/** Every distinct place, with coordinates when any event carrying it has them. */
export function collectPlaces(tree: Tree): PlaceEntry[] {
  const map = new Map<string, PlaceEntry>();
  const add = (p: Place | undefined, m: PlaceMention) => {
    if (!p || !p.text.trim()) return;
    const key = placeKey(p);
    let e = map.get(key);
    if (!e) {
      e = { key, text: placeText(p), place: p, mentions: [] };
      map.set(key, e);
    }
    if (e.lat === undefined && p.lat !== undefined && p.lon !== undefined) {
      e.lat = p.lat;
      e.lon = p.lon;
    }
    e.mentions.push(m);
  };
  for (const ind of Object.values(tree.individuals)) {
    for (const ev of ind.events) {
      add(ev.place, {
        personId: ind.id,
        personName: displayName(ind),
        type: ev.type,
        customType: ev.customType,
        year: approximateYear(ev.date),
      });
    }
  }
  for (const fam of Object.values(tree.families)) {
    for (const ev of fam.events) {
      for (const pid of [fam.husbandId, fam.wifeId]) {
        const ind = pid ? tree.individuals[pid] : undefined;
        if (!ind) continue;
        add(ev.place, {
          personId: ind.id,
          personName: displayName(ind),
          type: ev.type,
          customType: ev.customType,
          year: approximateYear(ev.date),
          familyId: fam.id,
        });
      }
    }
  }
  return [...map.values()].sort((a, b) => b.mentions.length - a.mentions.length || a.text.localeCompare(b.text));
}

export interface Geocode {
  /** The place text as written in the tree (matched accent- and case-insensitively). */
  text: string;
  lat: number;
  lon: number;
}

/** Write coordinates into every event whose place matches; untouched records keep their identity. */
export function geocodePlaces(tree: Tree, fixes: Geocode[]): EditResult {
  const byKey = new Map(fixes.map((f) => [fold(f.text), f] as const));
  const fix = (events: Event[]): Event[] | undefined => {
    let changed = false;
    const out = events.map((ev) => {
      if (!ev.place) return ev;
      const f = byKey.get(placeKey(ev.place));
      if (!f || (ev.place.lat === f.lat && ev.place.lon === f.lon)) return ev;
      changed = true;
      return { ...ev, place: { ...ev.place, lat: f.lat, lon: f.lon } };
    });
    return changed ? out : undefined;
  };
  let individuals = tree.individuals;
  for (const ind of Object.values(tree.individuals)) {
    const events = fix(ind.events);
    if (events) individuals = { ...individuals, [ind.id]: { ...ind, events } };
  }
  let families = tree.families;
  for (const fam of Object.values(tree.families)) {
    const events = fix(fam.events);
    if (events) families = { ...families, [fam.id]: { ...fam, events } };
  }
  if (individuals === tree.individuals && families === tree.families) return { tree };
  return { tree: { ...tree, individuals, families } };
}
