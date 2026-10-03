/**
 * The « Carte » view: every place with coordinates pinned, sized by how many
 * events happened there; a popup lists who was born, married or died there.
 * Places without coordinates can be located in one gentle pass, saved back
 * into the tree as an ordinary edit.
 *
 * A cursor along the bottom narrows the map to one generation at a time, so
 * the family can be watched moving: the places of the window are drawn in
 * full, the places already left behind stay as faint rings, and the places
 * still to come are not drawn at all.
 */

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Tree } from '@/gedcom/model';
import { t, type Lang } from '@/i18n';
import { geocodeAll } from '@/places/geocode';
import { collectPlaces, placesBetween, yearSpan, type Geocode, type PlaceEntry } from '@/tree/places';
import { esc, popupFor } from '@/app/lib/mapPopup';
import { PauseIcon, PlayIcon } from '@/app/ui/icons';

interface Props {
  tree: Tree;
  lang: Lang;
  selectedId?: string;
  readOnly?: boolean;
  dark: boolean;
  onSelect(id: string): void;
  onGeocoded(fixes: Geocode[]): void;
  onNotice(message: string): void;
}

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
/** A generation: the width of the window the cursor shows, ending at the year it points to. */
const GENERATION = 30;
/** How far the cursor moves at each step when playing, and how often. */
const PLAY_STEP = 5;
const PLAY_MS = 450;

export function MapView({ tree, lang, selectedId, readOnly, dark, onSelect, onGeocoded, onNotice }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const places = useMemo(() => collectPlaces(tree), [tree]);
  const located = useMemo(() => places.filter((p) => p.lat !== undefined && p.lon !== undefined), [places]);
  const missing = useMemo(() => places.filter((p) => p.lat === undefined), [places]);
  const span = useMemo(() => yearSpan(located), [located]);
  // The year the cursor points to; unset shows every period, undated events included.
  const [year, setYear] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const shown = useMemo(() => (year === null ? located : placesBetween(located, year - GENERATION + 1, year)), [located, year]);
  const ghosts = useMemo<PlaceEntry[]>(() => {
    if (year === null) return [];
    const now = new Set(shown.map((p) => p.key));
    return placesBetween(located, -Infinity, year - GENERATION).filter((p) => !now.has(p.key));
  }, [located, shown, year]);
  const [progress, setProgress] = useState<{ done: number; total: number; found: number } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const fitted = useRef(false);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // The map itself, once.
  useEffect(() => {
    if (!box.current || map.current) return;
    const m = L.map(box.current, { zoomControl: false, attributionControl: true, worldCopyJump: true });
    L.control.zoom({ position: 'bottomleft' }).addTo(m);
    L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 18 }).addTo(m);
    m.setView([46.6, 2.4], 5);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      layer.current = null;
    };
  }, []);

  // Markers follow the tree and the selection.
  useEffect(() => {
    const m = map.current,
      g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    for (const p of ghosts) {
      const ghost = L.circleMarker([p.lat!, p.lon!], {
        radius: 6,
        weight: 2,
        color: 'var(--pin-ring)',
        fill: false,
        className: 'map-pin ghost',
      });
      ghost.bindTooltip(esc(p.text), { direction: 'top', offset: [0, -6] });
      g.addLayer(ghost);
    }
    // Sized against the whole tree, so a place keeps its size as the cursor moves and only its own count changes it.
    const max = Math.max(1, ...located.map((p) => p.mentions.length));
    for (const p of shown) {
      const mine = selectedId ? p.mentions.some((x) => x.personId === selectedId) : false;
      const r = 6 + Math.sqrt(p.mentions.length / max) * 14;
      const marker = L.circleMarker([p.lat!, p.lon!], {
        radius: r,
        color: mine ? 'var(--focus)' : 'var(--pin-ring)',
        weight: mine ? 3 : 1.5,
        fillColor: mine ? 'var(--focus)' : 'var(--pin)',
        fillOpacity: mine ? 0.55 : 0.35,
        className: mine ? 'map-pin mine' : 'map-pin',
      });
      marker.bindTooltip(`${esc(p.text)} · ${p.mentions.length}`, { direction: 'top', offset: [0, -r] });
      marker.on('click', () => marker.bindPopup(popupFor(p, lang), { maxWidth: 320, className: 'map-popup' }).openPopup());
      g.addLayer(marker);
    }
    if (!fitted.current && located.length) {
      fitted.current = true;
      m.fitBounds(L.latLngBounds(located.map((p) => [p.lat!, p.lon!] as [number, number])).pad(0.2), { maxZoom: 9 });
    }
  }, [located, shown, ghosts, selectedId, lang]);

  // Playing walks the cursor forward a few years at a time and stops at the last dated event.
  useEffect(() => {
    if (!playing || !span) return;
    const id = window.setInterval(() => {
      setYear((y) => {
        const next = Math.min(span.max, (y ?? span.min) + PLAY_STEP);
        if (next >= span.max) setPlaying(false);
        return next;
      });
    }, PLAY_MS);
    return () => window.clearInterval(id);
  }, [playing, span]);

  // Popup buttons: delegated clicks select the person.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      const b = (e.target as HTMLElement).closest?.('button[data-person]') as HTMLElement | null;
      if (b?.dataset.person) onSelectRef.current(b.dataset.person);
    };
    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  }, []);

  // Leaflet needs to know when its box changes size.
  useEffect(() => {
    const el = box.current,
      m = map.current;
    if (!el || !m) return;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Places are located as soon as the map opens; each place is tried once per visit, so what the service
  // could not find does not start the pass again.
  const attempted = useRef(new Set<string>());
  const running = useRef(false);
  useEffect(() => {
    if (readOnly || running.current) return;
    const todo = missing.filter((p) => !attempted.current.has(p.text));
    if (!todo.length) return;
    for (const p of todo) attempted.current.add(p.text);
    running.current = true;
    const ctrl = new AbortController();
    abort.current = ctrl;
    setProgress({ done: 0, total: todo.length, found: 0 });
    void geocodeAll(
      todo.map((p) => ({ text: p.text, parts: p.place.parts.filter((x) => x.trim()) })),
      ctrl.signal,
      (done, found) => setProgress({ done, total: todo.length, found }),
    ).then((fixes) => {
      running.current = false;
      abort.current = null;
      setProgress(null);
      if (ctrl.signal.aborted) return;
      if (fixes.length) onGeocoded(fixes);
      else onNotice(t(lang, 'geocodeNone'));
    });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missing, readOnly]);

  return (
    <div className={`map-view ${dark ? 'map-dark' : ''}`}>
      <div ref={box} className="map-box" role="region" aria-label={t(lang, 'modeMap')} />
      {(missing.length > 0 || progress) && (
        <div className={`map-notice ${progress ? 'busy' : ''}`} role="status">
          {progress ? (
            <>
              <span>
                {t(lang, 'geocoding')} {progress.done} / {progress.total} · {progress.found} {t(lang, 'geocodeFound')}
              </span>
              <button className="btn small subtle" onClick={() => abort.current?.abort()}>
                {t(lang, 'cancel')}
              </button>
            </>
          ) : (
            <span>
              {missing.length} {t(lang, missing.length === 1 ? 'placeMissing' : 'placesMissing')}
            </span>
          )}
        </div>
      )}
      {span && span.max > span.min && (
        <div className="map-timeline">
          <button
            className="btn small subtle icon"
            aria-label={t(lang, playing ? 'mapPause' : 'mapPlay')}
            data-tip={t(lang, playing ? 'mapPause' : 'mapPlay')}
            onClick={() => {
              if (playing) return setPlaying(false);
              // From the end, or from every period at once, playing starts again at the first generation.
              if (year === null || year >= span.max) setYear(Math.min(span.max, span.min + GENERATION - 1));
              setPlaying(true);
            }}
          >
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <input
            type="range"
            min={span.min}
            max={span.max}
            step={1}
            value={year ?? span.max}
            aria-label={t(lang, 'mapTimeline')}
            aria-valuetext={year === null ? t(lang, 'mapAllYears') : `${year - GENERATION + 1} – ${year}`}
            className={year === null ? 'all' : ''}
            onChange={(e) => {
              setPlaying(false);
              setYear(Number(e.target.value));
            }}
          />
          <span className="map-years">{year === null ? t(lang, 'mapAllYears') : `${year - GENERATION + 1} – ${year}`}</span>
          {year !== null && (
            <button
              className="btn small subtle icon"
              aria-label={t(lang, 'mapShowAll')}
              data-tip={t(lang, 'mapShowAll')}
              onClick={() => {
                setPlaying(false);
                setYear(null);
              }}
            >
              ×
            </button>
          )}
        </div>
      )}
      {located.length === 0 && !progress && missing.length === 0 && <div className="map-empty muted">{t(lang, 'noPlaces')}</div>}
    </div>
  );
}
