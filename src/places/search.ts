/**
 * Place lookup for the place fields.
 *
 * Two free services, queried together:
 * - geo.api.gouv.fr for French communes: returns the commune with its
 *   département and région, which is exactly the hierarchy genealogists use.
 * - Photon (photon.komoot.io), OpenStreetMap based, for everywhere else.
 *
 * Both are best-effort: offline or rate-limited, the field still works with
 * what is already in the tree.
 */

import type { Place } from '../gedcom/model';

export interface PlaceSuggestion extends Place {
  /** Where the suggestion came from, for the small tag in the list. */
  source: 'tree' | 'fr' | 'osm';
}

interface GouvCommune {
  nom: string;
  departement?: { code: string; nom: string };
  region?: { code: string; nom: string };
  centre?: { coordinates: [number, number] };
}

interface PhotonFeature {
  properties: {
    name?: string;
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state?: string;
    country?: string;
    osm_value?: string;
    type?: string;
  };
  geometry?: { coordinates: [number, number] };
}

function make(parts: string[], lat?: number, lon?: number, source: PlaceSuggestion['source'] = 'osm'): PlaceSuggestion {
  const clean = parts.map((p) => p.trim()).filter((p, i, a) => p && a.indexOf(p) === i);
  return { text: clean.join(', '), parts: clean, lat, lon, source };
}

async function frenchCommunes(q: string, signal: AbortSignal): Promise<PlaceSuggestion[]> {
  const url = `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(q)}&fields=nom,departement,region,centre&boost=population&limit=6`;
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const data = (await res.json()) as GouvCommune[];
  return data.map((c) =>
    make([c.nom, c.departement?.nom ?? '', c.region?.nom ?? '', 'France'], c.centre?.coordinates[1], c.centre?.coordinates[0], 'fr'),
  );
}

async function photon(q: string, lang: string, signal: AbortSignal): Promise<PlaceSuggestion[]> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=${lang}`;
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const data = (await res.json()) as { features?: PhotonFeature[] };
  return (data.features ?? [])
    .filter(
      (f) =>
        ['city', 'town', 'village', 'hamlet', 'municipality', 'locality', 'suburb', 'county', 'state', 'country', 'island'].includes(
          f.properties.osm_value ?? '',
        ) || f.properties.type === 'city',
    )
    .map((f) => {
      const p = f.properties;
      const locality = p.city ?? p.town ?? p.village;
      const parts = [p.name ?? '', locality && locality !== p.name ? locality : '', p.county ?? '', p.state ?? '', p.country ?? ''];
      return make(parts, f.geometry?.coordinates[1], f.geometry?.coordinates[0], 'osm');
    });
}

/** Query both services; a failure in one does not hide the other. */
export async function searchPlaces(q: string, lang: 'fr' | 'en', signal: AbortSignal): Promise<PlaceSuggestion[]> {
  const query = q.trim();
  if (query.length < 2) return [];
  const [fr, osm] = await Promise.allSettled([frenchCommunes(query, signal), photon(query, lang, signal)]);
  const out: PlaceSuggestion[] = [];
  if (fr.status === 'fulfilled') out.push(...fr.value);
  if (osm.status === 'fulfilled') out.push(...osm.value);
  // Drop OSM duplicates of French communes already listed.
  const seen = new Set<string>();
  return out
    .filter((s) => {
      const key = s.parts.slice(0, 2).join('|').toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}
