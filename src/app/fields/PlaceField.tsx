/**
 * Place entry with suggestions: places already in the tree first, then
 * French communes and worldwide places fetched as you type.
 */

import { useMemo, useRef, useState } from 'react';
import { placeText, type Place } from '../../gedcom/model';
import { t, type Lang } from '../../i18n';
import { searchPlaces, type PlaceSuggestion } from '../../places/search';

interface Props {
  value: Place | undefined;
  onChange(next: Place | undefined): void;
  lang: Lang;
  /** Places already used in the tree, offered first. */
  known: Place[];
  label?: string;
}

export function PlaceField({ value, onChange, lang, known, label }: Props) {
  const [text, setText] = useState(placeText(value));
  const [open, setOpen] = useState(false);
  const [remote, setRemote] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const timer = useRef(0);

  // When the value changes from outside, adopt its text (React's "adjust state during render" pattern).
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setText(placeText(value));
  }

  const local = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (q.length < 1) return [];
    const seen = new Set<string>();
    return (
      known
        .filter((p) => {
          const k = placeText(p).toLowerCase();
          if (!k.includes(q) || seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .slice(0, 5)
        // Normalise: drop empty components so "Quimper, Finistère" from the tree matches the service's spelling.
        .map((p): PlaceSuggestion => ({
          text: placeText(p),
          parts: p.parts.filter((x) => x.length),
          lat: p.lat,
          lon: p.lon,
          source: 'tree',
        }))
    );
  }, [text, known]);

  const type = (s: string) => {
    setText(s);
    setOpen(true);
    const trimmed = s.trim();
    onChange(trimmed ? { text: trimmed, parts: trimmed.split(',').map((x) => x.trim()) } : undefined);
    window.clearTimeout(timer.current);
    abort.current?.abort();
    if (trimmed.length < 2) {
      setRemote([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = window.setTimeout(async () => {
      const ctrl = new AbortController();
      abort.current = ctrl;
      try {
        const r = await searchPlaces(trimmed, lang, ctrl.signal);
        if (!ctrl.signal.aborted) setRemote(r);
      } catch {
        /* offline or aborted */
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 350);
  };

  const pick = (p: PlaceSuggestion) => {
    const chosen: Place = { text: p.text, parts: p.parts, lat: p.lat, lon: p.lon };
    setText(p.text);
    setOpen(false);
    setRemote([]);
    onChange(chosen);
  };

  const all = [...local, ...remote.filter((r) => !local.some((l) => l.text.toLowerCase() === r.text.toLowerCase()))];
  const tag = (s: PlaceSuggestion['source']) => (s === 'tree' ? t(lang, 'placeFromTree') : s === 'fr' ? 'FR' : 'OSM');

  return (
    <div className="place-field">
      <span className="field-label">{label ?? t(lang, 'place')}</span>
      <input
        value={text}
        placeholder={t(lang, 'placeHint')}
        onChange={(e) => type(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && open && all[0]) {
            e.preventDefault();
            pick(all[0]);
          }
          if (e.key === 'Escape') setOpen(false);
        }}
        autoComplete="off"
      />
      {open && (all.length > 0 || loading) && (
        <ul className="place-suggestions" role="listbox">
          {all.map((p, i) => (
            <li key={p.source + i}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p)}>
                <span className="place-text">{p.text}</span>
                <span className="tag">{tag(p.source)}</span>
              </button>
            </li>
          ))}
          {loading && <li className="muted small place-loading">…</li>}
        </ul>
      )}
    </div>
  );
}
