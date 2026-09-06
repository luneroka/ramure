import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { TreeCanvas, type TreeCanvasHandle } from '../canvas/TreeCanvas';
import type { DetailBand, HandleKind } from '../canvas/renderer';
import { kvGet, kvSet, listSnapshots, loadSnapshot, saveSnapshot, TREE_KEY, type SavedTree, type Snapshot } from '../db';
import { parseGedcom, serializeGedcom } from '../gedcom';
import { displayName, type Tree } from '../gedcom/model';
import { applyTheme, detectLang, loadTheme, saveLang, t, type Lang, type ThemeChoice } from '../i18n';
import { addChild, addParent, addPartner, addSibling, deletePerson, linkChild, linkPartner, mergePeople, newTree, unlinkChild, updateFamily, updatePerson, type EditResult, type FamilyPatch } from '../tree/edit';
import { DEFAULT_LAYOUT, layoutHourglass } from '../tree/layout';
import { layoutEverything } from '../tree/layoutAll';
import sampleGedcom from '../../fixtures/geneanet/input-fixture.ged?raw';
import { historyReducer, initialHistory } from './history';
import { PersonPanel } from './PersonPanel';

type ViewMode = 'all' | 'hourglass' | 'ancestors' | 'descendants';
type AddKind = 'father' | 'mother' | 'partner' | 'child' | 'sibling';

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

const SNAPSHOT_EVERY_MS = 10 * 60 * 1000;

export function App() {
  const [lang, setLang] = useState<Lang>(detectLang);
  const [theme, setTheme] = useState<ThemeChoice>(loadTheme);
  useEffect(() => { applyTheme(theme); }, [theme]);

  const [history, dispatch] = useReducer(historyReducer, initialHistory);
  const doc = history.present;
  const tree = doc?.tree ?? null;

  const [focusId, setFocusId] = useState<string | undefined>();
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [editing, setEditing] = useState(false);
  const [view, setView] = useState<ViewMode>('hourglass');
  const [band, setBand] = useState<{ band: DetailBand; zoom: number }>({ band: 'cards', zoom: 1 });
  const [query, setQuery] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [addMenu, setAddMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [snapshots, setSnapshots] = useState<Array<Omit<Snapshot, 'gedcom'>> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(true);
  const canvas = useRef<TreeCanvasHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastSnapshotAt = useRef(0);

  const toast = useCallback((msg: string) => { setNotice(msg); window.setTimeout(() => setNotice((m) => (m === msg ? null : m)), 2600); }, []);

  // ---------- Loading ----------
  const load = useCallback((gedcom: string, fileName: string, focus?: string) => {
    const parsed = parseGedcom(gedcom);
    const first = focus && parsed.individuals[focus] ? focus : defaultFocus(parsed);
    dispatch({ type: 'load', doc: { tree: parsed, fileName } });
    setFocusId(first);
    setSelectedId(undefined);
    setEditing(false);
    setShowReport(parsed.importNotes.some((n) => n.level === 'warning'));
    lastSnapshotAt.current = Date.now();
    void kvSet(TREE_KEY, { gedcom, fileName, focusId: first, savedAt: Date.now() } satisfies SavedTree);
  }, []);

  useEffect(() => {
    kvGet<SavedTree>(TREE_KEY).then((saved) => {
      if (saved?.gedcom) load(saved.gedcom, saved.fileName, saved.focusId);
    }).finally(() => setRestoring(false));
  }, [load]);

  // ---------- Persistence: every edit (debounced) + periodic snapshots ----------
  const lastSavedVersion = useRef(0);
  useEffect(() => {
    if (!doc || !tree || history.version === lastSavedVersion.current) return;
    const timer = window.setTimeout(() => {
      lastSavedVersion.current = history.version;
      const gedcom = serializeGedcom(tree);
      void kvSet(TREE_KEY, { gedcom, fileName: doc.fileName, focusId, savedAt: Date.now() } satisfies SavedTree);
      if (history.past.length > 0 && Date.now() - lastSnapshotAt.current > SNAPSHOT_EVERY_MS) {
        lastSnapshotAt.current = Date.now();
        void saveSnapshot(gedcom, doc.fileName, Object.keys(tree.individuals).length);
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [doc, tree, history.version, history.past.length, focusId]);

  // Snapshot when leaving the page after edits.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== 'hidden' || !doc || !tree || history.past.length === 0) return;
      if (Date.now() - lastSnapshotAt.current < 60 * 1000) return;
      lastSnapshotAt.current = Date.now();
      void saveSnapshot(serializeGedcom(tree), doc.fileName, Object.keys(tree.individuals).length);
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [doc, tree, history.past.length]);

  // ---------- Layout ----------
  const layoutOpts = useMemo(() => ({ ...DEFAULT_LAYOUT, maxUp: view === 'descendants' ? 0 : DEFAULT_LAYOUT.maxUp, maxDown: view === 'ancestors' ? 0 : DEFAULT_LAYOUT.maxDown }), [view]);
  const effectiveFocus = tree && focusId && tree.individuals[focusId] ? focusId : tree ? defaultFocus(tree) : undefined;
  const layout = useMemo(() => {
    if (!tree) return null;
    if (view === 'all') return Object.keys(tree.individuals).length ? layoutEverything(tree) : null;
    return effectiveFocus ? layoutHourglass(tree, effectiveFocus, layoutOpts) : null;
  }, [tree, effectiveFocus, layoutOpts, view]);
  const hiddenCount = tree && layout ? Object.keys(tree.individuals).length - new Set(layout.nodes.map((n) => n.id)).size : 0;

  // Opening view when a tree is loaded; glide to the focus when it changes.
  const lastDocRef = useRef<typeof doc>(null);
  const lastFocusRef = useRef<string | undefined>(undefined);
  const lastViewRef = useRef<ViewMode>(view);
  useEffect(() => {
    if (!layout || !doc) return;
    const loadedNew = lastDocRef.current === null || (lastDocRef.current.fileName !== doc.fileName && history.past.length === 0);
    const viewChanged = lastViewRef.current !== view;
    const focusChanged = lastFocusRef.current !== effectiveFocus;
    lastDocRef.current = doc;
    lastFocusRef.current = effectiveFocus;
    lastViewRef.current = view;
    if (loadedNew) requestAnimationFrame(() => canvas.current?.initialView());
    else if (viewChanged && view === 'all') requestAnimationFrame(() => (effectiveFocus ? canvas.current?.centerOn(effectiveFocus, true) : canvas.current?.fit(true)));
    else if (viewChanged || focusChanged) requestAnimationFrame(() => effectiveFocus && canvas.current?.centerOn(effectiveFocus, true));
  }, [layout, doc, history.past.length, view, effectiveFocus]);

  // ---------- Editing ----------
  const apply = useCallback((fn: () => EditResult, opts: { select?: boolean; edit?: boolean; focus?: boolean } = {}) => {
    try {
      const r = fn();
      dispatch({ type: 'commit', tree: r.tree });
      if (r.focusId) {
        if (opts.select !== false) setSelectedId(r.focusId);
        if (opts.focus) setFocusId(r.focusId);
      }
      setEditing(!!opts.edit);
      return true;
    } catch (err) {
      toast(err instanceof Error ? (err.message === 'choose a family' ? t(lang, 'chooseFamily') : err.message) : String(err));
      return false;
    }
  }, [lang, toast]);

  const onHandle = useCallback((_kind: HandleKind, id: string, at: { x: number; y: number }) => {
    setSelectedId(id);
    setAddMenu((m) => (m && m.id === id ? null : { id, x: at.x, y: at.y }));
  }, []);

  const addRelative = (kind: AddKind, id: string) => {
    if (!tree) return;
    setAddMenu(null);
    switch (kind) {
      case 'father': apply(() => addParent(tree, id, 'father'), { edit: true }); break;
      case 'mother': apply(() => addParent(tree, id, 'mother'), { edit: true }); break;
      case 'partner': apply(() => addPartner(tree, id), { edit: true }); break;
      case 'child': apply(() => addChild(tree, id), { edit: true }); break;
      case 'sibling': apply(() => addSibling(tree, id), { edit: true }); break;
    }
  };

  const addOptions = (id: string): Array<{ kind: AddKind; label: string }> => {
    if (!tree) return [];
    const ind = tree.individuals[id];
    if (!ind) return [];
    const birth = ind.childOf.find((l) => l.pedigree === 'birth') ?? ind.childOf[0];
    const fam = birth ? tree.families[birth.familyId] : undefined;
    const out: Array<{ kind: AddKind; label: string }> = [];
    if (!fam?.husbandId) out.push({ kind: 'father', label: t(lang, 'addFather') });
    if (!fam?.wifeId) out.push({ kind: 'mother', label: t(lang, 'addMother') });
    out.push({ kind: 'partner', label: t(lang, 'addPartner') }, { kind: 'child', label: t(lang, 'addChild') }, { kind: 'sibling', label: t(lang, 'addSibling') });
    return out;
  };

  const undo = useCallback(() => { if (history.past.length) { dispatch({ type: 'undo' }); setEditing(false); } }, [history.past.length]);
  const redo = useCallback(() => { if (history.future.length) { dispatch({ type: 'redo' }); setEditing(false); } }, [history.future.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      else if (e.key === 'Escape') { setMenuOpen(false); setSnapshots(null); setAddMenu(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // Keep selection valid after undo / delete.
  useEffect(() => {
    if (tree && selectedId && !tree.individuals[selectedId]) { setSelectedId(undefined); setEditing(false); }
  }, [tree, selectedId]);

  // ---------- Files ----------
  const openFile = async (file: File) => {
    const buf = await file.arrayBuffer();
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
    if (!doc || !tree) return;
    const text = serializeGedcom(tree);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = doc.fileName.replace(/\.ged$/i, '') + '-ramure.ged';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const startNewTree = () => {
    if (tree && Object.keys(tree.individuals).length > 0 && !window.confirm(t(lang, 'newTreeConfirm'))) return;
    if (tree && doc) void saveSnapshot(serializeGedcom(tree), doc.fileName, Object.keys(tree.individuals).length);
    const r = newTree('', '', 'U');
    dispatch({ type: 'load', doc: { tree: r.tree, fileName: t(lang, 'newTreeName') } });
    setFocusId(r.focusId);
    setSelectedId(r.focusId);
    setEditing(true);
    setMenuOpen(false);
    lastSnapshotAt.current = Date.now();
    lastSavedVersion.current = -1;
  };

  const openSnapshots = async () => { setMenuOpen(false); setSnapshots(await listSnapshots()); };
  const restoreSnapshot = async (key: string) => {
    const s = await loadSnapshot(key);
    if (!s) return;
    const parsed = parseGedcom(s.gedcom);
    if (tree) dispatch({ type: 'commit', tree: parsed });
    else dispatch({ type: 'load', doc: { tree: parsed, fileName: s.fileName } });
    setSnapshots(null);
    setSelectedId(undefined);
    toast(t(lang, 'saved'));
  };

  // ---------- Search ----------
  const matches = useMemo(() => {
    if (!tree || query.trim().length < 2) return [];
    const q = query.trim().toLowerCase();
    return Object.values(tree.individuals).filter((i) => displayName(i).toLowerCase().includes(q)).slice(0, 8);
  }, [tree, query]);

  const focusOn = (id: string) => { setFocusId(id); setSelectedId(id); setEditing(false); setAddMenu(null); if (view === 'all') setView('hourglass'); };
  const switchLang = () => { const next: Lang = lang === 'fr' ? 'en' : 'fr'; setLang(next); saveLang(next); };
  const cycleTheme = () => setTheme((c) => (c === 'auto' ? 'light' : c === 'light' ? 'dark' : 'auto'));
  const onBandChange = useCallback((b: DetailBand, zoom: number) => {
    setBand((prev) => (prev.band === b && Math.abs(prev.zoom - zoom) < 0.005 ? prev : { band: b, zoom }));
  }, []);

  const selected = tree && selectedId ? tree.individuals[selectedId] : undefined;
  const count = tree ? Object.keys(tree.individuals).length : 0;

  return (
    <div className="app" onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-name">{t(lang, 'appName')}</span>
          {doc && <span className="brand-file">{doc.fileName} · {count} {t(lang, 'people')}</span>}
        </div>
        {tree && (
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
          {tree && (
            <>
              <button className="btn icon" onClick={undo} disabled={!history.past.length} aria-label={t(lang, 'undo')} title={`${t(lang, 'undo')} (⌘Z)`}>↶</button>
              <button className="btn icon" onClick={redo} disabled={!history.future.length} aria-label={t(lang, 'redo')} title={`${t(lang, 'redo')} (⇧⌘Z)`}>↷</button>
            </>
          )}
          <button className="btn" onClick={() => fileInput.current?.click()}><span className="long">{t(lang, 'openFile')}</span><span className="short">{t(lang, 'openShort')}</span></button>
          {tree && <button className="btn" onClick={exportGedcom}>{t(lang, 'export')}</button>}
          <div className="menu-wrap">
            <button className="btn icon" onClick={() => setMenuOpen((v) => !v)} aria-label={t(lang, 'menu')} aria-expanded={menuOpen}>⋯</button>
            {menuOpen && (
              <ul className="menu" role="menu" onMouseLeave={() => setMenuOpen(false)}>
                <li><button onClick={startNewTree}>{t(lang, 'newTree')}</button></li>
                <li><button onClick={openSnapshots}>{t(lang, 'snapshots')}</button></li>
                {tree && tree.importNotes.length > 0 && <li><button onClick={() => { setShowReport(true); setMenuOpen(false); }}>{t(lang, 'importReport')} ({tree.importNotes.length})</button></li>}
                <li className="sep" />
                <li><button onClick={cycleTheme}>{t(lang, 'theme')} : {theme === 'auto' ? t(lang, 'themeAuto') : theme === 'light' ? t(lang, 'themeLight') : t(lang, 'themeDark')}</button></li>
                <li><button onClick={switchLang}>{t(lang, 'language')} : {lang === 'fr' ? 'Français → English' : 'English → Français'}</button></li>
              </ul>
            )}
          </div>
        </div>
      </header>

      <main className="stage">
        {tree && layout ? (
          <>
            <TreeCanvas
              ref={canvas}
              tree={tree}
              layout={layout}
              selectedId={selectedId}
              lang={lang}
              editable={!editing}
              onSelect={(id) => { setSelectedId(id); setEditing(false); setAddMenu(null); }}
              onFocus={focusOn}
              onHandle={onHandle}
              onBandChange={onBandChange}
            />
            <div className="canvas-tools">
              <div className="segmented" role="radiogroup" aria-label={t(lang, 'view')}>
                {(['all', 'hourglass', 'ancestors', 'descendants'] as ViewMode[]).map((v) => (
                  <button key={v} role="radio" aria-checked={view === v} className={view === v ? 'on' : ''} onClick={() => { setView(v); setAddMenu(null); }}>
                    {t(lang, v === 'all' ? 'viewAll' : v === 'hourglass' ? 'viewHourglass' : v === 'ancestors' ? 'viewAncestors' : 'viewDescendants')}
                  </button>
                ))}
              </div>
              <button className="btn" onClick={() => canvas.current?.zoomBy(1 / 1.3)} aria-label={t(lang, 'zoomOut')}>−</button>
              <button className="btn" onClick={() => canvas.current?.zoomBy(1.3)} aria-label={t(lang, 'zoomIn')}>+</button>
              <button className="btn" onClick={() => canvas.current?.fit(true)}>{t(lang, 'fit')}</button>
              <button className="btn" onClick={() => canvas.current?.centerOn(layout.focusId, true)}>{t(lang, 'recentre')}</button>
            </div>
            <div className="hud">
              {Math.round(band.zoom * 100)}% · {hiddenCount > 0 ? <>{count - hiddenCount} / {count} {t(lang, 'shown')} · <button className="link" onClick={() => setView('all')}>{t(lang, 'showAll')}</button></> : <>{count} {t(lang, 'people')}</>} · {t(lang, band.band === 'cards' ? 'fullCards' : band.band === 'names' ? 'namesOnly' : 'dots')}
              {layout.truncatedUp && <span className="hud-warn"> · ↑ {t(lang, 'moreAbove')}</span>}
              {layout.truncatedDown && <span className="hud-warn"> · ↓ {t(lang, 'moreBelow')}</span>}
            </div>
            {addMenu && (
              <>
                <div className="add-backdrop" onPointerDown={() => setAddMenu(null)} />
                <ul className="add-menu" role="menu" aria-label={t(lang, 'addRelative')} style={{ left: Math.min(addMenu.x + 8, window.innerWidth - 220), top: addMenu.y }}>
                  {addOptions(addMenu.id).map((o) => <li key={o.kind}><button onClick={() => addRelative(o.kind, addMenu.id)}>{o.label}</button></li>)}
                </ul>
              </>
            )}
            {showReport && tree.importNotes.length > 0 && (
              <div className="report">
                <div className="report-head">
                  <strong>{t(lang, 'importReport')}</strong>
                  <span className="muted">{t(lang, 'importedFrom')} {tree.header.sourceSystem ?? '?'} {tree.header.sourceVersion ?? ''}</span>
                  <button className="icon-btn" onClick={() => setShowReport(false)} aria-label={t(lang, 'close')}>×</button>
                </div>
                <ul>
                  {tree.importNotes.map((n, i) => (
                    <li key={i} className={n.level}>
                      {n.message}
                      {n.ids?.filter((id) => tree.individuals[id]).map((id) => (
                        <button key={id} className="link" onClick={() => focusOn(id)}>{displayName(tree.individuals[id]!)}</button>
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
                  <button className="btn" onClick={startNewTree}>{t(lang, 'newTree')}</button>
                  <button className="btn subtle" onClick={() => load(sampleGedcom, 'exemple.ged')}>{t(lang, 'loadSample')}</button>
                </div>
              </>
            )}
          </div>
        )}
        {snapshots && (
          <div className="dialog-backdrop" onClick={() => setSnapshots(null)}>
            <div className="dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t(lang, 'snapshots')}>
              <div className="report-head"><strong>{t(lang, 'snapshots')}</strong><span className="muted" /><button className="icon-btn" onClick={() => setSnapshots(null)} aria-label={t(lang, 'close')}>×</button></div>
              <p className="muted small">{t(lang, 'snapshotsHint')}</p>
              {snapshots.length === 0 ? <p className="muted">{t(lang, 'noSnapshots')}</p> : (
                <ul className="snapshots">
                  {snapshots.map((s) => (
                    <li key={s.key}>
                      <span className="mono">{new Date(s.savedAt).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB')}</span>
                      <span>{s.fileName} · {s.people} {t(lang, 'people')}</span>
                      <button className="btn small" onClick={() => restoreSnapshot(s.key)}>{t(lang, 'restore')}</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
        {notice && <div className="toast" role="status">{notice}</div>}
      </main>

      {tree && selected && (
        <PersonPanel
          tree={tree}
          person={selected}
          lang={lang}
          editing={editing}
          setEditing={setEditing}
          onFocus={focusOn}
          onSelect={(id) => { setSelectedId(id); setEditing(false); }}
          onClose={() => { setSelectedId(undefined); setEditing(false); }}
          onSavePerson={(id, patch) => { apply(() => updatePerson(tree, id, patch)); toast(t(lang, 'saved')); }}
          onDeletePerson={(id) => apply(() => deletePerson(tree, id), { select: false })}
          onSaveFamily={(id, patch: FamilyPatch) => { apply(() => updateFamily(tree, id, patch)); toast(t(lang, 'saved')); }}
          onAddChild={(pid, fid) => apply(() => addChild(tree, pid, {}, fid), { edit: true })}
          onLinkPartner={(pid, partner) => apply(() => linkPartner(tree, pid, partner))}
          onLinkChild={(fid, cid) => apply(() => linkChild(tree, fid, cid))}
          onUnlinkChild={(fid, cid) => apply(() => unlinkChild(tree, fid, cid))}
          onMerge={(keep, drop) => apply(() => mergePeople(tree, keep, drop))}
        />
      )}
    </div>
  );
}
