/**
 * Gentle geocoding of the tree's places: one request at a time with a pause,
 * French communes first (geo.api.gouv.fr), then Photon for the rest.
 */

import { fold } from '../util/text';

export interface Coords {
  lat: number;
  lon: number;
}

interface GouvCommune {
  nom: string;
  departement?: { nom: string };
  region?: { nom: string };
  centre?: { coordinates: [number, number] };
}

async function gouv(parts: string[], signal: AbortSignal): Promise<Coords | undefined> {
  const name = parts.find((p) => p.trim()) ?? '';
  if (!name) return undefined;
  const url = `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(name)}&fields=nom,departement,region,centre&boost=population&limit=8`;
  const res = await fetch(url, { signal });
  if (!res.ok) return undefined;
  const data = (await res.json()) as GouvCommune[];
  const wanted = parts.map(fold);
  const exact = data.filter((c) => fold(c.nom) === fold(name));
  const pool = exact.length ? exact : data;
  // Prefer the commune whose département or région appears in the place text.
  const best =
    pool.find((c) => wanted.includes(fold(c.departement?.nom ?? '')) || wanted.includes(fold(c.region?.nom ?? ''))) ??
    (wanted.length <= 2 || wanted.some((w) => w === 'france') ? pool[0] : undefined);
  const c = best?.centre?.coordinates;
  return c ? { lat: c[1], lon: c[0] } : undefined;
}

async function photon(text: string, signal: AbortSignal): Promise<Coords | undefined> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(text)}&limit=1`;
  const res = await fetch(url, { signal });
  if (!res.ok) return undefined;
  const data = (await res.json()) as { features?: Array<{ geometry?: { coordinates?: [number, number] } }> };
  const c = data.features?.[0]?.geometry?.coordinates;
  return c ? { lat: c[1], lon: c[0] } : undefined;
}

export async function geocodeOne(text: string, parts: string[], signal: AbortSignal): Promise<Coords | undefined> {
  const looksFrench = parts.some((p) => fold(p) === 'france') || parts.length <= 2;
  try {
    if (looksFrench) {
      const c = await gouv(parts, signal);
      if (c) return c;
    }
  } catch {
    /* fall through */
  }
  try {
    return await photon(text, signal);
  } catch {
    return undefined;
  }
}

/** Geocode a list sequentially, reporting progress; resolves with what was found. */
export async function geocodeAll(
  places: Array<{ text: string; parts: string[] }>,
  signal: AbortSignal,
  onProgress: (done: number, found: number) => void,
): Promise<Array<{ text: string; lat: number; lon: number }>> {
  const out: Array<{ text: string; lat: number; lon: number }> = [];
  for (let i = 0; i < places.length; i++) {
    if (signal.aborted) break;
    const p = places[i]!;
    const c = await geocodeOne(p.text, p.parts, signal);
    if (c) out.push({ text: p.text, ...c });
    onProgress(i + 1, out.length);
    if (i < places.length - 1) await new Promise((r) => setTimeout(r, 300));
  }
  return out;
}
