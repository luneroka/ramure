import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TreeCanvas, type TreeCanvasHandle } from '../canvas/TreeCanvas';
import type { DetailBand } from '../canvas/renderer';
import { kvGet, kvSet, TREE_KEY, type SavedTree } from '../db';
import { parseGedcom, serializeGedcom } from '../gedcom';
import { displayName, type Tree } from '../gedcom/model';
import { applyTheme, detectLang, loadTheme, saveLang, t, type Lang, type ThemeChoice } from '../i18n';
import { layoutHourglass } from '../tree/layout';
import sampleGedcom from '../../fixtures/geneanet/input-fixture.ged?raw';
import { PersonPanel } from './PersonPanel';

interface Loaded {
  tree: Tree;
  gedcom: string;
  fileName: string;
}

/** Pick a sensible first focus: the person with the most relatives on both sides. */
function defaultFocus(tree: Tree): string | undefined {
  let best: string | undefined, bestScore = -1;
  for (const ind of Object.values(tree.individuals)) {
    const parents = ind.childOf.length ? 1 : 0;
    const kids = ind.partnerIn.reduce((s, f) => s + (tree.families[f]?.childIds.length ?? 0), 0);
    const score = parents * 2 + Math.min(kids, 3) + (ind.partnerIn.length ? 1 : 0);
    if (score > bestScore) { bestScore = score; best = ind.id; }
  }
  return best;
}

export function App() {
  const [lang, setLang] = useState<Lang>(detectLang);
  const [theme, setTheme] = useState<ThemeChoice>(loadTheme);
  useEffect(() => { applyTheme(theme); }, [theme]);
  const cycleTheme = () => setTheme((c) => (c === 'auto' ? 'light' : c === 'light' ? 'dark' : 'auto'));
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [focusId, setFocusId] = useState<string | undefined>();
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [band, setBand] = useState<{ band: DetailBand; zoom: number }>({ band: 'cards', zoom: 1 });
  const [query, setQuery] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const canvas = useRef<TreeCanvasHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback((gedcom: string, fileName: string, focus?: string) => {
    const tree = parseGedcom(gedcom);
    const first = focus && tree.individuals[focus] ? focus : defaultFocus(tree);
    setLoaded({ tree, gedcom, fileName });
    setFocusId(first);
    setSelectedId(undefined);
    setShowReport(tree.importNotes.some((n) => n.level === 'warning'));
    void kvSet(TREE_KEY, { gedcom, fileName, focusId: first, savedAt: Date.now() } satisfies SavedTree);
  }, []);

  // Restore the last tree from IndexedDB.
  useEffect(() => {
    kvGet<SavedTree>(TREE_KEY).then((saved) => {
      if (saved?.gedcom) load(saved.gedcom, saved.fileName, saved.focusId);
    }).finally(() => setRestoring(false));
  }, [load]);

  // Remember the focus person.
  useEffect(() => {
    if (!loaded || !focusId) return;
    void kvSet(TREE_KEY, { gedcom: loaded.gedcom, fileName: loaded.fileName, focusId, savedAt: Date.now() } satisfies SavedTree);
  }, [loaded, focusId]);

  const layout = useMemo(() => (loaded && focusId ? layoutHourglass(loaded.tree, focusId) : null), [loaded, focusId]);

  // Fit on first layout of a tree; keep the camera on re-focus (centerOn handles it).
  const lastTree = useRef<Tree | null>(null);
  useEffect(() => {
    if (!layout || !loaded) return;
    if (lastTree.current !== loaded.tree) {
      lastTree.current = loaded.tree;
      requestAnimationFrame(() => canvas.current?.initialView());
    } else {
      requestAnimationFrame(() => canvas.current?.centerOn(layout.focusId, true));
    }
  }, [layout, loaded]);

  const openFile = async (file: File) => {
    const buf = await file.arrayBuffer();
    // GEDCOM 5.5.1 is UTF-8 or ANSEL/latin; try UTF-8 first and fall back to latin1 if it does not decode cleanly.
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch { text = new TextDecoder('windows-1252').decode(buf); }
    load(text, file.name);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) void openFile(f);
  };

  const exportGedcom = () => {
    if (!loaded) return;
    const text = serializeGedcom(loaded.tree);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = loaded.fileName.replace(/\.ged$/i, '') + '-ramure.ged';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const matches = useMemo(() => {
    if (!loaded || query.trim().length < 2) return [];
    const q = query.trim().toLowerCase();
    return Object.values(loaded.tree.individuals)
      .filter((i) => displayName(i).toLowerCase().includes(q))
      .slice(0, 8);
  }, [loaded, query]);

  const focusOn = (id: string) => { setFocusId(id); setSelectedId(id); };

  const switchLang = () => { const next: Lang = lang === 'fr' ? 'en' : 'fr'; setLang(next); saveLang(next); };

  const onBandChange = useCallback((b: DetailBand, zoom: number) => {
    setBand((prev) => (prev.band === b && Math.abs(prev.zoom - zoom) < 0.005 ? prev : { band: b, zoom }));
  }, []);

  const selected = loaded && selectedId ? loaded.tree.individuals[selectedId] : undefined;
  const count = loaded ? Object.keys(loaded.tree.individuals).length : 0;

  return (
    <div className="app" onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-name">{t(lang, 'appName')}</span>
          {loaded && <span className="brand-file">{loaded.fileName} · {count} {t(lang, 'people')}</span>}
        </div>
        {loaded && (
          <div className="search">
            <input
              type="search"
              value={query}
              placeholder={t(lang, 'search')}
              aria-label={t(lang, 'search')}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && matches[0]) { focusOn(matches[0].id); setQuery(''); } if (e.key === 'Escape') setQuery(''); }}
            />
            {matches.length > 0 && (
              <ul className="search-results" role="listbox">
                {matches.map((m) => (
                  <li key={m.id}><button onClick={() => { focusOn(m.id); setQuery(''); }}>{displayName(m)}</button></li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="actions">
          <input ref={fileInput} type="file" accept=".ged,.gedcom,text/plain" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void openFile(f); e.target.value = ''; }} />
          <button className="btn" onClick={() => fileInput.current?.click()}><span className="long">{t(lang, 'openFile')}</span><span className="short">{t(lang, 'openShort')}</span></button>
          {loaded && <button className="btn" onClick={exportGedcom}>{t(lang, 'export')}</button>}
          <button className="btn subtle" onClick={cycleTheme} aria-label={t(lang, 'theme')} title={t(lang, 'theme')}>
            {theme === 'auto' ? t(lang, 'themeAuto') : theme === 'light' ? t(lang, 'themeLight') : t(lang, 'themeDark')}
          </button>
          <button className="btn subtle" onClick={switchLang} aria-label={t(lang, 'language')}>{lang === 'fr' ? 'EN' : 'FR'}</button>
        </div>
      </header>

      <main className="stage">
        {loaded && layout ? (
          <>
            <TreeCanvas
              ref={canvas}
              tree={loaded.tree}
              layout={layout}
              selectedId={selectedId}
              lang={lang}
              onSelect={setSelectedId}
              onFocus={focusOn}
              onBandChange={onBandChange}
            />
            <div className="canvas-tools">
              <button className="btn" onClick={() => canvas.current?.zoomBy(1 / 1.3)} aria-label={t(lang, 'zoomOut')}>−</button>
              <button className="btn" onClick={() => canvas.current?.zoomBy(1.3)} aria-label={t(lang, 'zoomIn')}>+</button>
              <button className="btn" onClick={() => canvas.current?.fit(true)}>{t(lang, 'fit')}</button>
              <button className="btn" onClick={() => canvas.current?.centerOn(layout.focusId, true)}>{t(lang, 'recentre')}</button>
            </div>
            <div className="hud">
              {Math.round(band.zoom * 100)}% · {layout.nodes.length} {t(lang, 'onCanvas')} · {t(lang, band.band === 'cards' ? 'fullCards' : band.band === 'names' ? 'namesOnly' : 'dots')}
              {layout.truncatedUp && <span className="hud-warn"> · ↑ {t(lang, 'moreAbove')}</span>}
              {layout.truncatedDown && <span className="hud-warn"> · ↓ {t(lang, 'moreBelow')}</span>}
            </div>
            {loaded.tree.importNotes.length > 0 && (
              <button className={`report-toggle ${showReport ? 'open' : ''}`} onClick={() => setShowReport((v) => !v)}>
                {t(lang, 'importReport')} ({loaded.tree.importNotes.length})
              </button>
            )}
            {showReport && (
              <div className="report">
                <div className="report-head">
                  <strong>{t(lang, 'importReport')}</strong>
                  <span className="muted">{t(lang, 'importedFrom')} {loaded.tree.header.sourceSystem ?? '?'} {loaded.tree.header.sourceVersion ?? ''}</span>
                  <button className="icon-btn" onClick={() => setShowReport(false)} aria-label={t(lang, 'close')}>×</button>
                </div>
                <ul>
                  {loaded.tree.importNotes.map((n, i) => (
                    <li key={i} className={n.level}>
                      {n.message}
                      {n.ids?.filter((id) => loaded.tree.individuals[id]).map((id) => (
                        <button key={id} className="link" onClick={() => focusOn(id)}>{displayName(loaded.tree.individuals[id]!)}</button>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <div className="empty">
            <h1>{t(lang, 'appName')}</h1>
            <p className="tagline">{t(lang, 'tagline')}</p>
            {!restoring && (
              <>
                <p className="hint-text">{t(lang, 'dropHint')}</p>
                <div className="empty-actions">
                  <button className="btn primary" onClick={() => fileInput.current?.click()}>{t(lang, 'openFile')}</button>
                  <button className="btn" onClick={() => load(sampleGedcom, 'exemple.ged')}>{t(lang, 'loadSample')}</button>
                </div>
              </>
            )}
          </div>
        )}
      </main>

      {loaded && selected && (
        <PersonPanel tree={loaded.tree} person={selected} lang={lang} onFocus={focusOn} onSelect={setSelectedId} onClose={() => setSelectedId(undefined)} />
      )}
    </div>
  );
}
