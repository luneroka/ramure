import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { TreeCanvas, type TreeCanvasHandle } from '../canvas/TreeCanvas';
import type { DetailBand, HandleKind } from '../canvas/renderer';
import { mediaGet } from '../db';
import { parseGedcom, serializeGedcom } from '../gedcom';
import { displayName, type Tree } from '../gedcom/model';
import { applyTheme, detectLang, loadTheme, saveLang, t, tg, type Lang, type ThemeChoice } from '../i18n';
import { CloudMediaStore } from '../store/cloudMedia';
import { setActiveMediaStore, treeStore, type SavedTree, type SnapshotMeta } from '../store';
import { api, ApiError, type Role, type TreeSummary } from '../sync/api';
import { SyncEngine, type SyncStatus } from '../sync/engine';
import { diffTrees } from '../tree/diff';
import { newTree, RAMURE_MEDIA_SCHEME, type EditResult, type FamilyPatch, type PersonPatch } from '../tree/edit';
import { applyOp, envelope, ops, opSubject, type Op } from '../tree/ops';
import { DEFAULT_LAYOUT, layoutHourglass } from '../tree/layout';
import { layoutEverything } from '../tree/layoutAll';
import sampleGedcom from '../../fixtures/geneanet/input-fixture.ged?raw';
import { historyReducer, initialHistory } from './history';
import { Library } from './Library';
import { PersonPanel } from './PersonPanel';
import { ShareDialog } from './ShareDialog';
import { useAuth } from './useAuth';

type ViewMode = 'all' | 'hourglass' | 'ancestors' | 'descendants';
type AddKind = 'father' | 'mother' | 'partner' | 'child' | 'sibling';

/** Where the open tree lives. */
type Source = { kind: 'local' } | { kind: 'cloud'; id: string; name: string; role: Role };

/** A relative being added: previewed on the canvas, committed only on save. The op is built once so ids are stable. */
interface Draft {
  kind: AddKind;
  relativeId: string;
  op: Op;
  preview: EditResult;
}

function relativeOp(kind: AddKind, id: string, familyId?: string): Op {
  switch (kind) {
    case 'father':
      return ops.addParent(id, 'father');
    case 'mother':
      return ops.addParent(id, 'mother');
    case 'partner':
      return ops.addPartner(id);
    case 'child':
      return ops.addChild(id, {}, familyId);
    case 'sibling':
      return ops.addSibling(id);
  }
}

/** Pick a sensible first focus: the person with the most relatives on both sides. */
function defaultFocus(tree: Tree): string | undefined {
  let best: string | undefined,
    bestScore = -1;
  for (const ind of Object.values(tree.individuals)) {
    const parents = ind.childOf.length ? 1 : 0;
    const kids = ind.partnerIn.reduce((s, f) => s + (tree.families[f]?.childIds.length ?? 0), 0);
    const score = parents * 2 + Math.min(kids, 3) + (ind.partnerIn.length ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = ind.id;
    }
  }
  return best;
}

const SNAPSHOT_EVERY_MS = 10 * 60 * 1000;
const LAST_SOURCE_KEY = 'ramure.lastSource';
const INVITE_KEY = 'ramure.invite';

function ThemeIcon({ choice }: { choice: ThemeChoice }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (choice === 'light')
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
      </svg>
    );
  if (choice === 'dark')
    return (
      <svg {...common}>
        <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
      </svg>
    );
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5v17A8.5 8.5 0 0 0 12 3.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function countPeople(gedcom: string): number {
  return (gedcom.match(/^0 @[^@]+@ INDI/gm) ?? []).length;
}

export function App() {
  const [lang, setLang] = useState<Lang>(detectLang);
  const [theme, setTheme] = useState<ThemeChoice>(loadTheme);
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  const auth = useAuth();

  const [history, dispatch] = useReducer(historyReducer, initialHistory);
  const tree = history.tree;
  const [source, setSource] = useState<Source | null>(null);
  const engine = useRef<SyncEngine | null>(null);
  const [sync, setSync] = useState<{ status: SyncStatus; pending: number }>({ status: 'synced', pending: 0 });
  const committing = useRef(false);

  const [focusId, setFocusId] = useState<string | undefined>();
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [editing, setEditing] = useState(false);
  const [view, setView] = useState<ViewMode>('hourglass');
  const [band, setBand] = useState<{ band: DetailBand; zoom: number }>({ band: 'cards', zoom: 1 });
  const [query, setQuery] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [addMenu, setAddMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [snapshots, setSnapshots] = useState<Array<SnapshotMeta & { cloudId?: string }> | null>(null);
  const [share, setShare] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [localSummary, setLocalSummary] = useState<{ fileName: string; people: number } | null>(null);
  const [libraryRefresh, setLibraryRefresh] = useState(0);
  const [pendingInvite, setPendingInvite] = useState<{ token: string; treeName: string; role: string } | null>(null);
  const canvas = useRef<TreeCanvasHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastSnapshotAt = useRef(0);

  const toast = useCallback((msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice((m) => (m === msg ? null : m)), 3200);
  }, []);

  const readOnly = source?.kind === 'cloud' && source.role === 'viewer';

  // ---------- Opening and closing trees ----------

  const closeTree = useCallback(() => {
    engine.current?.dispose();
    engine.current = null;
    setActiveMediaStore(null);
    setSource(null);
    dispatch({ type: 'close' });
    setSelectedId(undefined);
    setDraft(null);
    setEditing(false);
    setShare(false);
    setLibraryRefresh((n) => n + 1);
    treeStore
      .loadCurrent()
      .then((saved) => setLocalSummary(saved ? { fileName: saved.fileName, people: countPeople(saved.gedcom) } : null));
  }, []);

  const loadLocal = useCallback((gedcom: string, fileName: string, focus?: string) => {
    engine.current?.dispose();
    engine.current = null;
    setActiveMediaStore(null);
    const parsed = parseGedcom(gedcom);
    const first = focus && parsed.individuals[focus] ? focus : defaultFocus(parsed);
    dispatch({ type: 'load', tree: parsed, fileName });
    setSource({ kind: 'local' });
    setFocusId(first);
    setSelectedId(undefined);
    setEditing(false);
    setDraft(null);
    setShowReport(parsed.importNotes.some((n) => n.level === 'warning'));
    lastSnapshotAt.current = Date.now();
    void treeStore.saveCurrent({ gedcom, fileName, focusId: first, savedAt: Date.now() } satisfies SavedTree);
    setLocalSummary({ fileName, people: Object.keys(parsed.individuals).length });
    localStorage.setItem(LAST_SOURCE_KEY, JSON.stringify({ kind: 'local' }));
  }, []);

  const openCloud = useCallback(
    async (id: string, name: string, role: Role) => {
      engine.current?.dispose();
      const eng = new SyncEngine(id, role === 'viewer');
      engine.current = eng;
      setActiveMediaStore(new CloudMediaStore(id));
      eng.subscribe((e) => {
        setSync({ status: e.status, pending: e.pending });
        if (committing.current) return;
        if (e.notice?.remote || e.notice?.dropped?.length) {
          dispatch({ type: 'replace', tree: e.tree, keepHistory: false });
          if (e.notice.dropped?.length) toast(`${e.notice.dropped.length} ${t(lang, 'droppedChanges')}`);
          else toast(t(lang, 'remoteChanges'));
        } else {
          dispatch({ type: 'replace', tree: e.tree, keepHistory: true });
        }
      });
      try {
        const opened = await eng.open();
        setSource({ kind: 'cloud', id, name, role });
        dispatch({ type: 'load', tree: opened, fileName: name });
        setFocusId(defaultFocus(opened));
        setSelectedId(undefined);
        setEditing(false);
        setDraft(null);
        setShowReport(false);
        localStorage.setItem(LAST_SOURCE_KEY, JSON.stringify({ kind: 'cloud', id, name, role }));
      } catch (err) {
        eng.dispose();
        engine.current = null;
        setActiveMediaStore(null);
        toast(err instanceof ApiError && err.status === 404 ? t(lang, 'inviteInvalid') : t(lang, 'syncError'));
        localStorage.removeItem(LAST_SOURCE_KEY);
        setLibraryRefresh((n) => n + 1);
      }
    },
    [lang, toast],
  );

  // Boot: URL parameters (sign-in result, invite), then the last opened tree.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const signin = params.get('signin');
    const invite = params.get('invite');
    if (signin || invite) window.history.replaceState(null, '', location.pathname);
    // Toasts are state updates: defer them out of the effect body.
    if (signin === 'ok') window.setTimeout(() => toast(t(lang, 'signedIn')), 0);
    if (signin === 'expired') window.setTimeout(() => toast(t(lang, 'signinExpired')), 0);
    if (invite) sessionStorage.setItem(INVITE_KEY, invite);
    const token = sessionStorage.getItem(INVITE_KEY);
    if (token) {
      api
        .inviteInfo(token)
        .then((info) => setPendingInvite({ token, treeName: info.treeName, role: info.role }))
        .catch(() => {
          sessionStorage.removeItem(INVITE_KEY);
          toast(t(lang, 'inviteInvalid'));
        });
    }
    (async () => {
      const saved = await treeStore.loadCurrent();
      setLocalSummary(saved ? { fileName: saved.fileName, people: countPeople(saved.gedcom) } : null);
      let last: Source | null = null;
      try {
        last = JSON.parse(localStorage.getItem(LAST_SOURCE_KEY) ?? 'null') as Source | null;
      } catch {
        /* ignore */
      }
      if (!token && last?.kind === 'local' && saved?.gedcom) loadLocal(saved.gedcom, saved.fileName, saved.focusId);
      setBooting(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once signed in: accept a pending invite, or reopen the last cloud tree.
  const reopened = useRef(false);
  useEffect(() => {
    if (!auth.user || reopened.current) return;
    reopened.current = true;
    (async () => {
      const token = sessionStorage.getItem(INVITE_KEY);
      if (token) {
        try {
          const r = await api.acceptInvite(token);
          sessionStorage.removeItem(INVITE_KEY);
          setPendingInvite(null);
          const info = await api.getTree(r.treeId);
          await openCloud(r.treeId, info.name, info.role);
        } catch {
          sessionStorage.removeItem(INVITE_KEY);
          setPendingInvite(null);
          toast(t(lang, 'inviteInvalid'));
        }
        return;
      }
      let last: Source | null = null;
      try {
        last = JSON.parse(localStorage.getItem(LAST_SOURCE_KEY) ?? 'null') as Source | null;
      } catch {
        /* ignore */
      }
      if (last?.kind === 'cloud' && !source) await openCloud(last.id, last.name, last.role);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user]);

  // ---------- Local persistence: every edit (debounced) + periodic snapshots ----------
  const lastSavedVersion = useRef(0);
  useEffect(() => {
    if (source?.kind !== 'local' || !tree || history.version === lastSavedVersion.current) return;
    const timer = window.setTimeout(() => {
      lastSavedVersion.current = history.version;
      const gedcom = serializeGedcom(tree);
      void treeStore.saveCurrent({ gedcom, fileName: history.fileName, focusId, savedAt: Date.now() } satisfies SavedTree);
      setLocalSummary({ fileName: history.fileName, people: Object.keys(tree.individuals).length });
      if (history.past.length > 0 && Date.now() - lastSnapshotAt.current > SNAPSHOT_EVERY_MS) {
        lastSnapshotAt.current = Date.now();
        void treeStore.saveSnapshot(gedcom, history.fileName, Object.keys(tree.individuals).length);
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [source, tree, history.version, history.fileName, history.past.length, focusId]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== 'hidden' || source?.kind !== 'local' || !tree || history.past.length === 0) return;
      if (Date.now() - lastSnapshotAt.current < 60 * 1000) return;
      lastSnapshotAt.current = Date.now();
      void treeStore.saveSnapshot(serializeGedcom(tree), history.fileName, Object.keys(tree.individuals).length);
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [source, tree, history.fileName, history.past.length]);

  // ---------- Layout ----------
  const displayTree = draft ? draft.preview.tree : tree;
  const layoutOpts = useMemo(
    () => ({
      ...DEFAULT_LAYOUT,
      maxUp: view === 'descendants' ? 0 : DEFAULT_LAYOUT.maxUp,
      maxDown: view === 'ancestors' ? 0 : DEFAULT_LAYOUT.maxDown,
    }),
    [view],
  );
  const effectiveFocus = tree && focusId && tree.individuals[focusId] ? focusId : tree ? defaultFocus(tree) : undefined;
  const layout = useMemo(() => {
    if (!displayTree) return null;
    if (view === 'all') return Object.keys(displayTree.individuals).length ? layoutEverything(displayTree) : null;
    return effectiveFocus ? layoutHourglass(displayTree, effectiveFocus, layoutOpts) : null;
  }, [displayTree, effectiveFocus, layoutOpts, view]);
  const count = tree ? Object.keys(tree.individuals).length : 0;
  const hiddenCount = tree && layout ? count - new Set(layout.nodes.map((n) => n.id)).size : 0;

  useEffect(() => {
    if (!draft || !layout) return;
    const id = opSubject(draft.op, draft.preview);
    if (id && layout.nodes.some((n) => n.id === id)) requestAnimationFrame(() => canvas.current?.centerOn(id, true));
  }, [draft, layout]);

  const lastKey = useRef<string>('');
  const lastFocusRef = useRef<string | undefined>(undefined);
  const lastViewRef = useRef<ViewMode>(view);
  const sourceKey = source ? (source.kind === 'local' ? 'local' : `cloud:${source.id}`) : '';
  useEffect(() => {
    if (!layout || !tree) return;
    const loadedNew = lastKey.current !== sourceKey;
    const viewChanged = lastViewRef.current !== view;
    const focusChanged = lastFocusRef.current !== effectiveFocus;
    lastKey.current = sourceKey;
    lastFocusRef.current = effectiveFocus;
    lastViewRef.current = view;
    if (loadedNew) requestAnimationFrame(() => canvas.current?.initialView());
    else if (viewChanged && view === 'all')
      requestAnimationFrame(() => (effectiveFocus ? canvas.current?.centerOn(effectiveFocus, true) : canvas.current?.fit(true)));
    else if (viewChanged || focusChanged) requestAnimationFrame(() => effectiveFocus && canvas.current?.centerOn(effectiveFocus, true));
  }, [layout, tree, sourceKey, view, effectiveFocus]);

  // ---------- Editing ----------
  /** The single path for changes: build an op, apply it, record it, hand it to sync. */
  const commit = useCallback(
    (op: Op, opts: { select?: boolean; edit?: boolean; focus?: boolean } = {}) => {
      if (!tree || readOnly) return false;
      try {
        const r = applyOp(tree, op);
        const inverse = diffTrees(r.tree, tree);
        if (engine.current) {
          committing.current = true;
          try {
            engine.current.commit(envelope(op, auth.user?.id));
          } finally {
            committing.current = false;
          }
        }
        dispatch({ type: 'commit', tree: r.tree, op, inverse });
        const subject = opSubject(op, r);
        if (subject) {
          if (opts.select !== false) setSelectedId(subject);
          if (opts.focus) setFocusId(subject);
        }
        setEditing(!!opts.edit);
        return true;
      } catch (err) {
        toast(err instanceof Error ? (err.message === 'choose a family' ? t(lang, 'chooseFamily') : err.message) : String(err));
        return false;
      }
    },
    [tree, readOnly, lang, toast, auth.user?.id],
  );

  const step = useCallback(
    (dir: 'undo' | 'redo') => {
      if (!tree || readOnly) return;
      const entry = dir === 'undo' ? history.past[history.past.length - 1] : history.future[0];
      if (!entry) return;
      const op = dir === 'undo' ? entry.inverse : entry.op;
      try {
        const r = applyOp(tree, op);
        if (engine.current) {
          committing.current = true;
          try {
            engine.current.commit(envelope(op, auth.user?.id));
          } finally {
            committing.current = false;
          }
        }
        dispatch({ type: dir, tree: r.tree });
        setEditing(false);
        setDraft(null);
      } catch {
        toast(t(lang, 'syncError'));
      }
    },
    [tree, readOnly, history.past, history.future, lang, toast, auth.user?.id],
  );
  const undo = useCallback(() => step('undo'), [step]);
  const redo = useCallback(() => step('redo'), [step]);

  const onHandle = useCallback((_kind: HandleKind, id: string, at: { x: number; y: number }) => {
    setSelectedId(id);
    setAddMenu((m) => (m && m.id === id ? null : { id, x: at.x, y: at.y }));
  }, []);

  const startDraft = (kind: AddKind, id: string, familyId?: string) => {
    if (!tree || readOnly) return;
    setAddMenu(null);
    try {
      const op = relativeOp(kind, id, familyId);
      const preview = applyOp(tree, op);
      const newId = opSubject(op, preview)!;
      if (view !== 'all') {
        const probe = effectiveFocus ? layoutHourglass(preview.tree, effectiveFocus, layoutOpts) : null;
        if (!probe || !probe.nodes.some((n) => n.id === newId)) setView('all');
      }
      setDraft({ kind, relativeId: id, op, preview });
      setSelectedId(newId);
      setEditing(true);
    } catch (err) {
      toast(err instanceof Error ? (err.message === 'choose a family' ? t(lang, 'chooseFamily') : err.message) : String(err));
    }
  };

  const cancelDraft = useCallback(() => {
    setDraft((d) => {
      if (d) setSelectedId(d.relativeId);
      return null;
    });
    setEditing(false);
  }, []);

  const saveDraft = (patch: PersonPatch) => {
    if (!tree || !draft) return;
    const newId = opSubject(draft.op, draft.preview)!;
    setDraft(null);
    if (commit(ops.batch([draft.op, ops.updatePerson(newId, patch)]))) toast(t(lang, 'saved'));
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
    out.push(
      { kind: 'partner', label: tg(lang, 'addPartner', ind.sex) },
      { kind: 'child', label: t(lang, 'addChild') },
      { kind: 'sibling', label: t(lang, 'addSibling') },
    );
    return out;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
      )
        return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (e.key === 'Escape') {
        setMenuOpen(false);
        setSnapshots(null);
        setAddMenu(null);
        setShare(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // ---------- Files and trees ----------
  const openFile = async (file: File) => {
    const buf = await file.arrayBuffer();
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch {
      text = new TextDecoder('windows-1252').decode(buf);
    }
    loadLocal(text, file.name);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) void openFile(f);
  };

  const exportGedcom = () => {
    if (!tree) return;
    const text = serializeGedcom(tree);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = history.fileName.replace(/\.ged$/i, '') + '-ramure.ged';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const startNewTree = () => {
    if (tree && count > 0 && !window.confirm(t(lang, 'newTreeConfirm'))) return;
    if (source?.kind === 'local' && tree) void treeStore.saveSnapshot(serializeGedcom(tree), history.fileName, count);
    const r = newTree('', '', 'U');
    loadLocal(serializeGedcom(r.tree), t(lang, 'newTreeName'), r.focusId);
    setSelectedId(r.focusId);
    setEditing(true);
    setMenuOpen(false);
    lastSavedVersion.current = -1;
  };

  const uploadLocal = async () => {
    const saved =
      source?.kind === 'local' && tree ? { gedcom: serializeGedcom(tree), fileName: history.fileName } : await treeStore.loadCurrent();
    if (!saved) return;
    toast(t(lang, 'uploading'));
    try {
      const name = saved.fileName.replace(/\.ged$/i, '');
      const created = await api.createTree(name, saved.gedcom);
      // Portraits stored on this device go up too, best effort.
      const parsed = parseGedcom(saved.gedcom);
      for (const m of Object.values(parsed.media)) {
        if (!m.file.startsWith(RAMURE_MEDIA_SCHEME)) continue;
        const blob = await mediaGet(m.id);
        if (blob) await api.putMedia(created.id, m.id, blob).catch(() => undefined);
      }
      await openCloud(created.id, created.name, created.role);
      toast(t(lang, 'uploaded'));
    } catch {
      toast(t(lang, 'syncError'));
    }
  };

  const deleteCloud = async (tr: TreeSummary) => {
    if (!window.confirm(t(lang, 'deleteTreeConfirm'))) return;
    try {
      await api.deleteTree(tr.id);
      if (source?.kind === 'cloud' && source.id === tr.id) closeTree();
      setLibraryRefresh((n) => n + 1);
    } catch {
      toast(t(lang, 'syncError'));
    }
  };

  const openSnapshots = async () => {
    setMenuOpen(false);
    if (source?.kind === 'cloud') {
      const r = await api.listSnapshots(source.id);
      setSnapshots(
        r.snapshots.map((s) => ({ key: s.id, savedAt: s.created_at, fileName: `v${s.version}`, people: 0, cloudId: source.id })),
      );
    } else setSnapshots(await treeStore.listSnapshots());
  };
  const restoreSnapshot = async (key: string, cloudId?: string) => {
    const gedcom = cloudId ? (await api.getSnapshot(cloudId, key)).doc : (await treeStore.loadSnapshot(key))?.gedcom;
    if (!gedcom) return;
    if (tree) commit(ops.replaceTree(gedcom), { select: false });
    setSnapshots(null);
    setSelectedId(undefined);
    toast(t(lang, 'saved'));
  };

  // ---------- Search and misc ----------
  const matches = useMemo(() => {
    if (!tree || query.trim().length < 2) return [];
    const q = query.trim().toLowerCase();
    return Object.values(tree.individuals)
      .filter((i) => displayName(i).toLowerCase().includes(q))
      .slice(0, 8);
  }, [tree, query]);

  const focusOn = (id: string) => {
    setDraft(null);
    setFocusId(id);
    setSelectedId(id);
    setEditing(false);
    setAddMenu(null);
    if (view === 'all') setView('hourglass');
  };
  const switchLang = () => {
    const next: Lang = lang === 'fr' ? 'en' : 'fr';
    setLang(next);
    saveLang(next);
  };
  const cycleTheme = () => setTheme((c) => (c === 'auto' ? 'light' : c === 'light' ? 'dark' : 'auto'));
  const onBandChange = useCallback((b: DetailBand, zoom: number) => {
    setBand((prev) => (prev.band === b && Math.abs(prev.zoom - zoom) < 0.005 ? prev : { band: b, zoom }));
  }, []);

  const selected = displayTree && selectedId ? displayTree.individuals[selectedId] : undefined;
  const themeLabel = theme === 'auto' ? t(lang, 'themeAuto') : theme === 'light' ? t(lang, 'themeLight') : t(lang, 'themeDark');
  const syncLabel =
    sync.status === 'synced'
      ? t(lang, 'syncSynced')
      : sync.status === 'pending'
        ? `${sync.pending} ${t(lang, 'syncPending')}`
        : sync.status === 'syncing'
          ? t(lang, 'syncSyncing')
          : sync.status === 'offline'
            ? t(lang, 'syncOffline')
            : sync.status === 'readonly'
              ? t(lang, 'syncReadonly')
              : t(lang, 'syncError');

  return (
    <div className="app" onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
      <header className="topbar">
        <div className="brand">
          <button className="brand-name as-button" onClick={closeTree} title={t(lang, 'library')}>
            {t(lang, 'appName')}
          </button>
          {tree && (
            <span className="brand-file">
              {history.fileName} · {count} {t(lang, 'people')}
            </span>
          )}
          {source?.kind === 'cloud' && (
            <button
              className={`sync-pill ${sync.status}`}
              onClick={() => void engine.current?.sync()}
              title={syncLabel}
              aria-label={syncLabel}
            >
              <span className="sync-dot" />
              <span className="sync-text">{syncLabel}</span>
            </button>
          )}
        </div>
        {tree && (
          <div className="search">
            <input
              type="search"
              value={query}
              placeholder={t(lang, 'search')}
              aria-label={t(lang, 'search')}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && matches[0]) {
                  focusOn(matches[0].id);
                  setQuery('');
                }
                if (e.key === 'Escape') setQuery('');
              }}
            />
            {matches.length > 0 && (
              <ul className="search-results" role="listbox">
                {matches.map((m) => (
                  <li key={m.id}>
                    <button
                      onClick={() => {
                        focusOn(m.id);
                        setQuery('');
                      }}
                    >
                      {displayName(m)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="actions">
          <input
            ref={fileInput}
            type="file"
            accept=".ged,.gedcom,text/plain"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void openFile(f);
              e.target.value = '';
            }}
          />
          {tree && !readOnly && (
            <>
              <button
                className="btn icon"
                onClick={undo}
                disabled={!history.past.length}
                aria-label={t(lang, 'undo')}
                title={`${t(lang, 'undo')} (⌘Z)`}
              >
                ↶
              </button>
              <button
                className="btn icon"
                onClick={redo}
                disabled={!history.future.length}
                aria-label={t(lang, 'redo')}
                title={`${t(lang, 'redo')} (⇧⌘Z)`}
              >
                ↷
              </button>
            </>
          )}
          <button
            className="btn icon"
            onClick={cycleTheme}
            aria-label={`${t(lang, 'theme')} : ${themeLabel}`}
            title={`${t(lang, 'theme')} : ${themeLabel}`}
          >
            <ThemeIcon choice={theme} />
          </button>
          <button className="btn icon lang" onClick={switchLang} aria-label={t(lang, 'language')} title={t(lang, 'language')}>
            {lang.toUpperCase()}
          </button>
          <div className="menu-wrap">
            <button className="btn icon" onClick={() => setMenuOpen((v) => !v)} aria-label={t(lang, 'menu')} aria-expanded={menuOpen}>
              ⋯
            </button>
            {menuOpen && (
              <ul className="menu" role="menu" onMouseLeave={() => setMenuOpen(false)}>
                <li>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      closeTree();
                    }}
                  >
                    {t(lang, 'library')}
                  </button>
                </li>
                {source?.kind === 'cloud' && (
                  <li>
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        setShare(true);
                      }}
                    >
                      {t(lang, 'share')}…
                    </button>
                  </li>
                )}
                {source?.kind === 'local' && auth.user && (
                  <li>
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        void uploadLocal();
                      }}
                    >
                      {t(lang, 'uploadLocal')}
                    </button>
                  </li>
                )}
                <li className="sep" />
                <li>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      fileInput.current?.click();
                    }}
                  >
                    {t(lang, 'openFile')}
                  </button>
                </li>
                {tree && (
                  <li>
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        exportGedcom();
                      }}
                    >
                      {t(lang, 'export')}
                    </button>
                  </li>
                )}
                <li className="sep" />
                <li>
                  <button onClick={startNewTree}>{t(lang, 'newTree')}</button>
                </li>
                {tree && (
                  <li>
                    <button onClick={() => void openSnapshots()}>{t(lang, 'snapshots')}</button>
                  </li>
                )}
                {tree && tree.importNotes.length > 0 && (
                  <li>
                    <button
                      onClick={() => {
                        setShowReport(true);
                        setMenuOpen(false);
                      }}
                    >
                      {t(lang, 'importReport')} ({tree.importNotes.length})
                    </button>
                  </li>
                )}
                {auth.user && (
                  <>
                    <li className="sep" />
                    <li>
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          closeTree();
                          void auth.logout();
                        }}
                      >
                        {t(lang, 'signOut')} ({auth.user.email})
                      </button>
                    </li>
                  </>
                )}
              </ul>
            )}
          </div>
        </div>
      </header>

      <main className="stage">
        {tree && layout ? (
          <>
            <TreeCanvas
              key={sourceKey}
              ref={canvas}
              tree={displayTree!}
              layout={layout}
              selectedId={selectedId}
              lang={lang}
              editable={!editing && !draft && !readOnly}
              onSelect={(id) => {
                setDraft(null);
                setSelectedId(id);
                setEditing(false);
                setAddMenu(null);
              }}
              onFocus={focusOn}
              onHandle={onHandle}
              draftId={draft?.preview.focusId}
              onBandChange={onBandChange}
            />
            <div className="canvas-tools">
              <div className="segmented" role="radiogroup" aria-label={t(lang, 'view')}>
                {(['all', 'hourglass', 'ancestors', 'descendants'] as ViewMode[]).map((v) => (
                  <button
                    key={v}
                    role="radio"
                    aria-checked={view === v}
                    className={view === v ? 'on' : ''}
                    onClick={() => {
                      setView(v);
                      setAddMenu(null);
                    }}
                  >
                    {t(
                      lang,
                      v === 'all'
                        ? 'viewAll'
                        : v === 'hourglass'
                          ? 'viewHourglass'
                          : v === 'ancestors'
                            ? 'viewAncestors'
                            : 'viewDescendants',
                    )}
                  </button>
                ))}
              </div>
              <button className="btn" onClick={() => canvas.current?.zoomBy(1 / 1.3)} aria-label={t(lang, 'zoomOut')}>
                −
              </button>
              <button className="btn" onClick={() => canvas.current?.zoomBy(1.3)} aria-label={t(lang, 'zoomIn')}>
                +
              </button>
              <button className="btn" onClick={() => canvas.current?.fit(true)}>
                {t(lang, 'fit')}
              </button>
              <button className="btn" onClick={() => canvas.current?.centerOn(layout.focusId, true)}>
                {t(lang, 'recentre')}
              </button>
            </div>
            <div className="hud">
              {Math.round(band.zoom * 100)}% ·{' '}
              {hiddenCount > 0 ? (
                <>
                  {count - hiddenCount} / {count} {t(lang, 'shown')} ·{' '}
                  <button className="link" onClick={() => setView('all')}>
                    {t(lang, 'showAll')}
                  </button>
                </>
              ) : (
                <>
                  {count} {t(lang, 'people')}
                </>
              )}{' '}
              · {t(lang, band.band === 'cards' ? 'fullCards' : band.band === 'names' ? 'namesOnly' : 'dots')}
              {readOnly && <span className="hud-warn"> · {t(lang, 'readOnlyHint')}</span>}
              {layout.truncatedUp && <span className="hud-warn"> · ↑ {t(lang, 'moreAbove')}</span>}
              {layout.truncatedDown && <span className="hud-warn"> · ↓ {t(lang, 'moreBelow')}</span>}
            </div>
            {addMenu && !readOnly && (
              <>
                <div className="add-backdrop" onPointerDown={() => setAddMenu(null)} />
                <ul
                  className="add-menu"
                  role="menu"
                  aria-label={t(lang, 'addRelative')}
                  style={{ left: Math.min(addMenu.x + 8, window.innerWidth - 220), top: addMenu.y }}
                >
                  {addOptions(addMenu.id).map((o) => (
                    <li key={o.kind}>
                      <button onClick={() => startDraft(o.kind, addMenu.id)}>{o.label}</button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {showReport && tree.importNotes.length > 0 && (
              <div className="report">
                <div className="report-head">
                  <strong>{t(lang, 'importReport')}</strong>
                  <span className="muted">
                    {t(lang, 'importedFrom')} {tree.header.sourceSystem ?? '?'} {tree.header.sourceVersion ?? ''}
                  </span>
                  <button className="icon-btn" onClick={() => setShowReport(false)} aria-label={t(lang, 'close')}>
                    ×
                  </button>
                </div>
                <ul>
                  {tree.importNotes.map((n, i) => (
                    <li key={i} className={n.level}>
                      {n.message}
                      {n.ids
                        ?.filter((id) => tree.individuals[id])
                        .map((id) => (
                          <button key={id} className="link" onClick={() => focusOn(id)}>
                            {displayName(tree.individuals[id]!)}
                          </button>
                        ))}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : booting ? null : (
          <Library
            lang={lang}
            auth={auth}
            local={localSummary}
            pendingInvite={pendingInvite}
            refreshKey={libraryRefresh}
            onOpenLocal={() => treeStore.loadCurrent().then((s) => s && loadLocal(s.gedcom, s.fileName, s.focusId))}
            onOpenCloud={(tr) => void openCloud(tr.id, tr.name, tr.role)}
            onImport={() => fileInput.current?.click()}
            onNewTree={startNewTree}
            onSample={() => loadLocal(sampleGedcom, 'exemple.ged')}
            onUploadLocal={() => void uploadLocal()}
            onDeleteCloud={(tr) => void deleteCloud(tr)}
            toast={toast}
          />
        )}
        {snapshots && (
          <div className="dialog-backdrop" onClick={() => setSnapshots(null)}>
            <div className="dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t(lang, 'snapshots')}>
              <div className="report-head">
                <strong>{t(lang, 'snapshots')}</strong>
                <span className="muted" />
                <button className="icon-btn" onClick={() => setSnapshots(null)} aria-label={t(lang, 'close')}>
                  ×
                </button>
              </div>
              <p className="muted small">{t(lang, 'snapshotsHint')}</p>
              {snapshots.length === 0 ? (
                <p className="muted">{t(lang, 'noSnapshots')}</p>
              ) : (
                <ul className="snapshots">
                  {snapshots.map((s) => (
                    <li key={s.key}>
                      <span className="mono">{new Date(s.savedAt).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB')}</span>
                      <span>
                        {s.fileName}
                        {s.people ? ` · ${s.people} ${t(lang, 'people')}` : ''}
                      </span>
                      <button className="btn small" onClick={() => void restoreSnapshot(s.key, s.cloudId)} disabled={readOnly}>
                        {t(lang, 'restore')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
        {share && source?.kind === 'cloud' && auth.user && (
          <ShareDialog
            lang={lang}
            treeId={source.id}
            treeName={source.name}
            role={source.role}
            meId={auth.user.id}
            onClose={() => setShare(false)}
            onLeft={() => {
              setShare(false);
              void engine.current?.forget();
              closeTree();
            }}
            toast={toast}
          />
        )}
        {notice && (
          <div className="toast" role="status">
            {notice}
          </div>
        )}
      </main>

      {tree && displayTree && selected && (
        <PersonPanel
          tree={displayTree}
          person={selected}
          lang={lang}
          readOnly={readOnly}
          editing={(editing || !!draft) && !!selected && !readOnly}
          isDraft={!!draft}
          setEditing={(v) => {
            if (!v && draft) cancelDraft();
            else setEditing(v);
          }}
          onFocus={focusOn}
          onSelect={(id) => {
            setDraft(null);
            setSelectedId(id);
            setEditing(false);
          }}
          onClose={() => {
            if (draft) cancelDraft();
            else {
              setSelectedId(undefined);
              setEditing(false);
            }
          }}
          onSavePerson={(id, patch) => {
            if (draft) saveDraft(patch);
            else if (commit(ops.updatePerson(id, patch))) toast(t(lang, 'saved'));
          }}
          onDeletePerson={(id) => commit(ops.deletePerson(id), { select: false })}
          onSaveFamily={(id, patch: FamilyPatch) => {
            if (commit(ops.updateFamily(id, patch))) toast(t(lang, 'saved'));
          }}
          onAddChild={(pid, fid) => startDraft('child', pid, fid)}
          onLinkPartner={(pid, partner) => commit(ops.linkPartner(pid, partner))}
          onLinkChild={(fid, cid) => commit(ops.linkChild(fid, cid))}
          onUnlinkChild={(fid, cid) => commit(ops.unlinkChild(fid, cid))}
          onMerge={(keep, drop) => commit(ops.mergePeople(keep, drop))}
          onSetPortrait={(id, media) => {
            if (draft) return;
            if (commit(ops.updatePerson(id, { portrait: media }))) toast(t(lang, 'saved'));
          }}
        />
      )}
    </div>
  );
}
