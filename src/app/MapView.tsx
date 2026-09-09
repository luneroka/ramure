/**
 * The « Carte » view: every place with coordinates pinned, sized by how many
 * events happened there; a popup lists who was born, married or died there.
 * Places without coordinates can be located in one gentle pass, saved back
 * into the tree as an ordinary edit.
 */

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Tree } from '../gedcom/model';
import { t, type Lang } from '../i18n';
import { geocodeAll } from '../places/geocode';
import { collectPlaces, type Geocode } from '../tree/places';
import { esc, popupFor } from './mapPopup';

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

export function MapView({ tree, lang, selectedId, readOnly, dark, onSelect, onGeocoded, onNotice }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const places = useMemo(() => collectPlaces(tree), [tree]);
  const located = useMemo(() => places.filter((p) => p.lat !== undefined && p.lon !== undefined), [places]);
  const missing = useMemo(() => places.filter((p) => p.lat === undefined), [places]);
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
    const max = Math.max(1, ...located.map((p) => p.mentions.length));
    for (const p of located) {
      const mine = selectedId ? p.mentions.some((x) => x.personId === selectedId) : false;
      const r = 6 + Math.sqrt(p.mentions.length / max) * 14;
      const marker = L.circleMarker([p.lat!, p.lon!], {
        radius: r,
        color: mine ? 'var(--focus)' : 'var(--accent)',
        weight: mine ? 3 : 1.5,
        fillColor: mine ? 'var(--focus)' : 'var(--accent)',
        fillOpacity: mine ? 0.55 : 0.35,
        className: 'map-pin',
      });
      marker.bindTooltip(`${esc(p.text)} · ${p.mentions.length}`, { direction: 'top', offset: [0, -r] });
      marker.on('click', () => marker.bindPopup(popupFor(p, lang), { maxWidth: 320, className: 'map-popup' }).openPopup());
      g.addLayer(marker);
    }
    if (!fitted.current && located.length) {
      fitted.current = true;
      m.fitBounds(L.latLngBounds(located.map((p) => [p.lat!, p.lon!] as [number, number])).pad(0.2), { maxZoom: 9 });
    }
  }, [located, selectedId, lang]);

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
        <div className="map-notice">
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
      {located.length === 0 && !progress && missing.length === 0 && <div className="map-empty muted">{t(lang, 'noPlaces')}</div>}
    </div>
  );
}
