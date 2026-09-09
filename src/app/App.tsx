import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { TreeCanvas, type TreeCanvasHandle } from '../canvas/TreeCanvas';
import type { DetailBand, HandleKind } from '../canvas/renderer';
import { serializeGedcom } from '../gedcom';
import { displayName, type Tree } from '../gedcom/model';
import { applyTheme, detectLang, loadTheme, saveLang, t, tg, type Lang, type ThemeChoice } from '../i18n';
import { CloudMediaStore } from '../store/cloudMedia';
import { mediaStore, setActiveMediaStore } from '../store';
import { api, ApiError, type Account, type Role, type TreeSummary } from '../sync/api';
import { SyncEngine, type SyncStatus } from '../sync/engine';
import { diffTrees } from '../tree/diff';
import { newTree, type EditResult, type FamilyPatch, type PersonPatch } from '../tree/edit';
import { applyOp, envelope, ops, opSubject, type Op } from '../tree/ops';
import { DEFAULT_LAYOUT, layoutHourglass } from '../tree/layout';
import { layoutEverything } from '../tree/layoutAll';
import { auditTree, noteKey, type CheckNote } from '../tree/audit';
import { describeKinship } from '../tree/kinship';
import { fold } from '../util/text';
import { historyReducer, initialHistory } from './history';
import { Home } from './Home';
import { Login } from './Login';
import { Modal, type AskSpec, type Pending } from './Modal';
import { TreeMenu, UserMenu } from './Menus';
import { parseRoute, useHashRoute } from './router';
import { Settings, type DefaultView } from './Settings';
import { Admin } from './Admin';
import { PersonPanel } from './PersonPanel';
import { MAX_PPY, MIN_PPY, Timeline } from './Timeline';
import { MapView } from './MapView';
import { ResourcesPage } from './Resources';
import { useAuth } from './useAuth';

type ViewMode = 'all' | 'hourglass' | 'ancestors' | 'descendants';
type AddKind = 'father' | 'mother' | 'partner' | 'child' | 'sibling';

/** The open tree. Every tree lives in the account; the device keeps a synced copy. */
interface Source {
  id: string;
  name: string;
  role: Role;
}

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

const LAST_TREE_KEY = 'ramure.lastTree';
const LAST_ACCOUNT_KEY = 'ramure.lastAccount';
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

  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [route, navigate] = useHashRoute();
  const [treeList, setTreeList] = useState<TreeSummary[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<'account' | 'profile' | 'preferences' | undefined>();
  const [defaultView, setDefaultViewState] = useState<DefaultView>(() =>
    localStorage.getItem('ramure.defaultView') === 'all' ? 'all' : 'hourglass',
  );
  const setDefaultView = (v: DefaultView) => {
    setDefaultViewState(v);
    localStorage.setItem('ramure.defaultView', v);
  };
  const [homeRefresh, setHomeRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pendingInvite, setPendingInvite] = useState<{ token: string; accountName: string } | null>(null);

  const [focusId, setFocusId] = useState<string | undefined>();
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [editing, setEditing] = useState(false);
  const [view, setView] = useState<ViewMode>('hourglass');
  const [band, setBand] = useState<{ band: DetailBand; zoom: number }>({ band: 'cards', zoom: 1 });
  const [query, setQuery] = useState('');
  const [showReport, setShowReport] = useState(false);
  /** What the stage shows for the open tree: the canvas or the timeline (the map comes later). */
  const [mode, setMode] = useState<'tree' | 'timeline' | 'map'>('tree');
  const [pxPerYear, setPxPerYear] = useState(6);
  const nextMode = mode === 'tree' ? 'timeline' : mode === 'timeline' ? 'map' : 'tree';
  const [kinshipIds, setKinshipIds] = useState<{ a: string; b: string } | null>(null);
  /** Kinship lookup started from a card: the next card tapped completes it. */
  const [kinshipFrom, setKinshipFrom] = useState<string | null>(null);
  const [addMenu, setAddMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [snapshots, setSnapshots] = useState<Array<{
    id: string;
    version: number;
    created_at: number;
    label: string | null;
    by: string | null;
  }> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const canvas = useRef<TreeCanvasHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [pending, setPending] = useState<Pending | null>(null);
  /** Ask the user something through the modal. Resolves with the text (or 'ok'), null when cancelled. */
  const ask = useCallback(
    (spec: AskSpec) =>
      new Promise<string | null>((resolve) =>
        setPending({
          spec,
          resolve: (v) => {
            setPending(null);
            resolve(v);
          },
        }),
      ),
    [],
  );

  const toast = useCallback((msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice((m) => (m === msg ? null : m)), 3200);
  }, []);

  const readOnly = source?.role === 'viewer';

  // ---------- Accounts ----------

  const loadAccounts = useCallback(async (preferId?: string): Promise<Account[]> => {
    const r = await api.accounts();
    setAccounts(r.accounts);
    const wanted = preferId ?? localStorage.getItem(LAST_ACCOUNT_KEY) ?? undefined;
    const pick = r.accounts.find((a) => a.id === wanted) ?? r.accounts[0] ?? null;
    setAccount(pick);
    if (pick) localStorage.setItem(LAST_ACCOUNT_KEY, pick.id);
    return r.accounts;
  }, []);

  useEffect(() => {
    if (!account) return;
    let alive = true;
    api
      .listTrees(account.id)
      .then((r) => alive && setTreeList(r.trees))
      .catch(() => alive && setTreeList([]));
    return () => {
      alive = false;
    };
  }, [account, homeRefresh]);

  const selectAccount = (a: Account) => {
    setAccount(a);
    localStorage.setItem(LAST_ACCOUNT_KEY, a.id);
  };

  const createAccount = async (name: string) => {
    setBusy(true);
    try {
      const created = await api.createAccount(name);
      await loadAccounts(created.id);
    } catch {
      toast(t(lang, 'syncError'));
    } finally {
      setBusy(false);
    }
  };

  // ---------- Opening and closing trees ----------

  const goHome = useCallback(() => {
    engine.current?.dispose();
    engine.current = null;
    setActiveMediaStore(null);
    setSource(null);
    dispatch({ type: 'close' });
    setSelectedId(undefined);
    setDraft(null);
    setEditing(false);
    setHomeRefresh((n) => n + 1);
    localStorage.removeItem(LAST_TREE_KEY);
    navigate({ name: 'home' });
  }, [navigate]);

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
        setSource({ id, name, role });
        dispatch({ type: 'load', tree: opened, fileName: name });
        setFocusId(defaultFocus(opened));
        setSelectedId(undefined);
        setEditing(false);
        setDraft(null);
        setShowReport(false);
        setView(defaultView);
        localStorage.setItem(LAST_TREE_KEY, JSON.stringify({ id, name, role }));
        navigate({ name: 'tree', id }, true);
      } catch (err) {
        eng.dispose();
        engine.current = null;
        setActiveMediaStore(null);
        toast(err instanceof ApiError && err.status === 404 ? t(lang, 'inviteInvalid') : t(lang, 'syncError'));
        localStorage.removeItem(LAST_TREE_KEY);
      }
    },
    [lang, toast, navigate, defaultView],
  );

  // Boot: URL parameters (sign-in result, invite).
  useEffect(() => {
    // Tokens arrive in the fragment (#signin=…, #invite=…): never sent to the server, stripped as soon as read.
    // Consumed on load and whenever the fragment changes, so a link opened into an already open tab works too.
    const consumeFragment = () => {
      const frag = new URLSearchParams(location.hash.replace(/^#/, ''));
      const signinToken = frag.get('signin');
      const inviteToken = frag.get('invite');
      if (!signinToken && !inviteToken) return null;
      window.history.replaceState(null, '', location.pathname + '#/');
      if (signinToken) {
        auth
          .verifyLink(signinToken)
          .then(() => toast(t(lang, 'signedIn')))
          .catch((err) => toast(t(lang, err instanceof ApiError && err.status === 403 ? 'signinOtherDevice' : 'signinExpired')));
      }
      if (inviteToken) sessionStorage.setItem(INVITE_KEY, inviteToken);
      return inviteToken;
    };
    consumeFragment();
    window.addEventListener('hashchange', consumeFragment);
    const token = sessionStorage.getItem(INVITE_KEY);
    if (token) {
      api
        .inviteInfo(token)
        .then((info) => setPendingInvite({ token, accountName: info.accountName }))
        .catch(() => {
          sessionStorage.removeItem(INVITE_KEY);
          window.setTimeout(() => toast(t(lang, 'inviteInvalid')), 0);
        });
    }
    return () => window.removeEventListener('hashchange', consumeFragment);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Signed in: accept a pending invite, load accounts, reopen the last tree.
  const bootedFor = useRef<string | null>(null);
  useEffect(() => {
    const user = auth.user;
    if (!user) {
      bootedFor.current = null;
      return;
    }
    if (bootedFor.current === user.id) return;
    bootedFor.current = user.id;
    (async () => {
      let prefer: string | undefined;
      const token = sessionStorage.getItem(INVITE_KEY);
      if (token) {
        try {
          const r = await api.acceptInvite(token);
          prefer = r.accountId;
        } catch {
          toast(t(lang, 'inviteInvalid'));
        }
        sessionStorage.removeItem(INVITE_KEY);
        setPendingInvite(null);
      }
      const list = await loadAccounts(prefer).catch(() => [] as Account[]);
      if (prefer) {
        navigate({ name: 'home' }, true);
        return; // just joined: show the account's trees
      }
      let last: Source | null = null;
      try {
        last = JSON.parse(localStorage.getItem(LAST_TREE_KEY) ?? 'null') as Source | null;
      } catch {
        /* ignore */
      }
      const r = route;
      if (r.name === 'tree' && list.length) {
        const known = r.id === last?.id ? last : undefined;
        if (known) await openCloud(known.id, known.name, known.role);
        else {
          try {
            const info = await api.getTree(r.id);
            await openCloud(r.id, info.name, info.role);
          } catch {
            navigate({ name: 'home' }, true);
          }
        }
      } else if (r.name === 'home' && last && list.length && !location.hash) {
        await openCloud(last.id, last.name, last.role);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user, loadAccounts, openCloud, lang, toast]);

  // Route changes after boot (back button, typed address): leaving a tree closes it; entering one opens it.
  const sourceRef = useRef(source);
  const treeListRef = useRef(treeList);
  useEffect(() => {
    sourceRef.current = source;
    treeListRef.current = treeList;
  }, [source, treeList]);
  useEffect(() => {
    const onHash = () => {
      const r = parseRoute(location.hash);
      const cur = sourceRef.current;
      // The resources page belongs to the open tree: the tree stays loaded behind it.
      const onTree = r.name === 'tree' || r.name === 'resources';
      if (!onTree && cur) {
        engine.current?.dispose();
        engine.current = null;
        setActiveMediaStore(null);
        setSource(null);
        dispatch({ type: 'close' });
        setSelectedId(undefined);
        setDraft(null);
        setEditing(false);
        setHomeRefresh((n) => n + 1);
      } else if (onTree && (!cur || cur.id !== r.id)) {
        const tr = treeListRef.current.find((x) => x.id === r.id);
        if (tr) void openCloud(tr.id, tr.name, tr.role);
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [openCloud]);

  const signOut = async () => {
    goHome();
    setAccounts(null);
    setAccount(null);
    await auth.logout();
  };

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

  // The report is live: import notes about people who no longer exist drop out, checks are recomputed, dismissals stick per device.
  const dismissKey = source ? `ramure.dismissed:${source.id}` : null;
  const readDismissed = (key: string | null): Set<string> => {
    if (!key) return new Set();
    try {
      return new Set(JSON.parse(localStorage.getItem(key) ?? '[]') as string[]);
    } catch {
      return new Set();
    }
  };
  // Reloaded when the open tree changes (React's adjust-state-during-render pattern).
  const [dismissedFor, setDismissedFor] = useState<{ key: string | null; set: Set<string> }>(() => ({
    key: dismissKey,
    set: readDismissed(dismissKey),
  }));
  if (dismissedFor.key !== dismissKey) setDismissedFor({ key: dismissKey, set: readDismissed(dismissKey) });
  const dismissed = dismissedFor.set;
  const setDismissed = (set: Set<string>) => setDismissedFor({ key: dismissKey, set });
  // Relationship mode: recomputed live, cleared when either person leaves the tree.
  const kinship = useMemo(() => {
    if (!kinshipIds || !tree || !tree.individuals[kinshipIds.a] || !tree.individuals[kinshipIds.b]) return null;
    return describeKinship(tree, kinshipIds.a, kinshipIds.b, lang);
  }, [kinshipIds, tree, lang]);
  const lit = useMemo(
    () => (kinship && kinship.path.length > 1 ? { ids: new Set(kinship.path), path: kinship.path } : undefined),
    [kinship],
  );
  const framedPath = useRef<string>('');
  const startKinship = (a: string, b: string) => {
    setKinshipIds({ a, b });
    setKinshipFrom(null);
    // The whole path has to be on the canvas: the overview shows everyone.
    if (tree) {
      const r = describeKinship(tree, a, b, lang);
      if (layout && r.path.some((id) => !layout.nodes.some((n) => n.id === id))) setView('all');
    }
  };
  const reportNotes = useMemo(() => {
    if (!tree) return [];
    const stillRelevant: CheckNote[] = tree.importNotes.filter((n) => !n.ids?.length || n.ids.some((id) => tree.individuals[id]));
    const all = [...stillRelevant, ...auditTree(tree)].filter((n) => !dismissed.has(noteKey(n)));
    // Impossible things first, then the merely unusual.
    return all.sort((a, b) => (a.level === b.level ? 0 : a.level === 'warning' ? -1 : 1));
  }, [tree, dismissed]);
  const dismissNote = (key: string) => {
    const next = new Set(dismissed);
    next.add(key);
    setDismissed(next);
    if (dismissKey) localStorage.setItem(dismissKey, JSON.stringify([...next]));
  };
  const hiddenCount = tree && layout ? count - new Set(layout.nodes.map((n) => n.id)).size : 0;

  useEffect(() => {
    if (!draft || !layout) return;
    const id = opSubject(draft.op, draft.preview);
    if (id && layout.nodes.some((n) => n.id === id)) requestAnimationFrame(() => canvas.current?.centerOn(id, true));
  }, [draft, layout]);

  const lastKey = useRef<string>('');
  const lastFocusRef = useRef<string | undefined>(undefined);
  const lastViewRef = useRef<ViewMode>(view);
  const sourceKey = source?.id ?? '';
  useEffect(() => {
    if (!layout || !tree) return;
    const loadedNew = lastKey.current !== sourceKey;
    const viewChanged = lastViewRef.current !== view;
    const focusChanged = lastFocusRef.current !== effectiveFocus;
    lastKey.current = sourceKey;
    lastFocusRef.current = effectiveFocus;
    lastViewRef.current = view;
    // A relationship being shown wins: frame its path as soon as the layout holds every person on it.
    const litKey = lit ? lit.path.join('>') : '';
    if (lit && litKey !== framedPath.current && lit.path.every((id) => layout.nodes.some((n) => n.id === id))) {
      framedPath.current = litKey;
      requestAnimationFrame(() => canvas.current?.fitTo(lit.path, true));
      return;
    }
    if (loadedNew) requestAnimationFrame(() => canvas.current?.initialView());
    else if (viewChanged && view === 'all')
      requestAnimationFrame(() => (effectiveFocus ? canvas.current?.centerOn(effectiveFocus, true) : canvas.current?.fit(true)));
    else if (viewChanged || focusChanged) requestAnimationFrame(() => effectiveFocus && canvas.current?.centerOn(effectiveFocus, true));
  }, [layout, tree, sourceKey, view, effectiveFocus, lit]);

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

  const onHandle = useCallback((kind: HandleKind, id: string, at: { x: number; y: number }) => {
    setSelectedId(id);
    if (kind === 'kin') {
      setAddMenu(null);
      setKinshipFrom((cur) => (cur === id ? null : id));
      return;
    }
    setKinshipFrom(null);
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
      if (e.key === 'Escape') setKinshipFrom(null);
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (e.key === 'Escape') {
        setSnapshots(null);
        setAddMenu(null);
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // ---------- Files and trees ----------
  const createTreeFrom = async (name: string, gedcom: string, thenEdit?: boolean) => {
    if (!account) return;
    setBusy(true);
    toast(t(lang, 'creatingTree'));
    try {
      const created = await api.createTree(account.id, name, gedcom);
      await openCloud(created.id, created.name, created.role);
      toast(t(lang, 'treeCreated'));
      if (thenEdit) {
        const first = engine.current?.current ? Object.keys(engine.current.current.individuals)[0] : undefined;
        if (first) {
          setSelectedId(first);
          setEditing(true);
        }
      }
    } catch {
      toast(t(lang, 'syncError'));
    } finally {
      setBusy(false);
    }
  };

  const openFile = async (file: File) => {
    if (file.size > 1_500_000) {
      toast(t(lang, 'treeTooLarge'));
      return;
    }
    const buf = await file.arrayBuffer();
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch {
      text = new TextDecoder('windows-1252').decode(buf);
    }
    await createTreeFrom(file.name.replace(/\.(ged|gedcom)$/i, ''), text);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && auth.user && account && account.role !== 'viewer') void openFile(f);
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

  const startNewTree = async () => {
    const name = await ask({
      title: t(lang, 'newTree'),
      input: { label: t(lang, 'treeName'), initial: account?.name ?? '' },
      confirmLabel: t(lang, 'create'),
    });
    if (name === null) return;
    const r = newTree('', '', 'U');
    void createTreeFrom(name.trim() || t(lang, 'newTreeName').replace(/\.ged$/, ''), serializeGedcom(r.tree), true);
  };

  const renameTree = async () => {
    if (!source) return;
    const answer = await ask({
      title: t(lang, 'renameTree'),
      input: { label: t(lang, 'treeName'), initial: source.name },
      confirmLabel: t(lang, 'save'),
    });
    const name = (answer ?? '').trim();
    if (!name || name === source.name) return;
    try {
      await api.renameTree(source.id, name);
      setSource({ ...source, name });
      dispatch({ type: 'rename', fileName: name });
      localStorage.setItem(LAST_TREE_KEY, JSON.stringify({ ...source, name }));
      setTreeList((l) => l.map((x) => (x.id === source.id ? { ...x, name } : x)));
      toast(t(lang, 'treeRenamed'));
    } catch {
      toast(t(lang, 'syncError'));
    }
  };

  const deleteTree = async (tr: TreeSummary) => {
    const answer = await ask({
      title: t(lang, 'deleteTreeTitle'),
      message: t(lang, 'deleteTreeMessage'),
      confirmLabel: t(lang, 'deleteTree'),
      danger: true,
      requireText: tr.name,
    });
    if (answer === null) return;
    try {
      await api.deleteTree(tr.id);
      void engine.current?.forget();
      if (source?.id === tr.id) goHome();
      setHomeRefresh((n) => n + 1);
      toast(t(lang, 'treeDeleted'));
    } catch {
      toast(t(lang, 'syncError'));
    }
  };

  const openSnapshots = async () => {
    if (!source) return;
    const r = await api.listSnapshots(source.id);
    setSnapshots(r.snapshots);
  };
  const saveVersion = async () => {
    if (!source) return;
    await engine.current?.sync();
    const label = await ask({
      title: t(lang, 'saveVersion'),
      input: { label: t(lang, 'versionLabel'), placeholder: t(lang, 'versionLabelHint') },
      confirmLabel: t(lang, 'save'),
    });
    if (label === null) return;
    try {
      await api.saveSnapshot(source.id, label);
      toast(t(lang, 'versionSaved'));
      if (snapshots) setSnapshots((await api.listSnapshots(source.id)).snapshots);
    } catch {
      toast(t(lang, 'syncError'));
    }
  };
  const restoreSnapshot = async (sid: string) => {
    if (!source) return;
    const answer = await ask({ title: t(lang, 'restoreTitle'), message: t(lang, 'restoreMessage'), confirmLabel: t(lang, 'restore') });
    if (answer === null) return;
    const s = await api.getSnapshot(source.id, sid);
    if (tree) commit(ops.replaceTree(s.doc), { select: false });
    setSnapshots(null);
    setSelectedId(undefined);
    toast(t(lang, 'versionRestored'));
  };

  // ---------- Search and misc ----------
  const matches = useMemo(() => {
    if (!tree || query.trim().length < 2) return [];
    const q = fold(query);
    return Object.values(tree.individuals)
      .filter((i) => fold(displayName(i)).includes(q))
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
  // The bar button flips between light and dark from what is actually displayed; « Auto » lives in Paramètres.
  const [systemDark, setSystemDark] = useState(
    () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches,
  );
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSystemDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const effectiveTheme: ThemeChoice = theme === 'auto' ? (systemDark ? 'dark' : 'light') : theme;
  const cycleTheme = () => setTheme(effectiveTheme === 'dark' ? 'light' : 'dark');
  const onBandChange = useCallback((b: DetailBand, zoom: number) => {
    setBand((prev) => (prev.band === b && Math.abs(prev.zoom - zoom) < 0.005 ? prev : { band: b, zoom }));
  }, []);

  const selected = displayTree && selectedId ? displayTree.individuals[selectedId] : undefined;
  // Both switches show what a click gives you, not the current state.
  const nextTheme: ThemeChoice = effectiveTheme === 'dark' ? 'light' : 'dark';
  const themeLabel = `${t(lang, 'theme')} : ${nextTheme === 'light' ? t(lang, 'themeLight') : t(lang, 'themeDark')}`;
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

  // ---------- Gate: everything behind sign-in ----------
  if (!auth.user) {
    return (
      <div className="app gate">
        <Login lang={lang} auth={auth} pendingInvite={pendingInvite} toast={toast} />
        <div className="gate-tools">
          <button className="btn icon" onClick={cycleTheme} aria-label={themeLabel} title={themeLabel}>
            <ThemeIcon choice={nextTheme} />
          </button>
        </div>
        {notice && (
          <div className="toast" role="status">
            {notice}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="app" onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
      <header className="topbar">
        <div className="brand">
          <button className="brand-name as-button" onClick={goHome} title={t(lang, 'library')}>
            {t(lang, 'appName')}
          </button>
          {source && tree && (
            <>
              <TreeMenu
                lang={lang}
                current={source}
                trees={treeList}
                owner={source.role === 'owner'}
                checkCount={reportNotes.length}
                onSwitch={(tr) => void openCloud(tr.id, tr.name, tr.role)}
                onNewTree={startNewTree}
                onRename={() => void renameTree()}
                onExport={exportGedcom}
                onSnapshots={() => void openSnapshots()}
                onSaveVersion={() => void saveVersion()}
                readOnly={readOnly}
                onReport={() => setShowReport(true)}
                onResources={() => navigate({ name: 'resources', id: source.id })}
                onDelete={() =>
                  void deleteTree({ id: source.id, name: source.name, version: 0, people: count, updated_at: 0, role: source.role })
                }
              />
              <span className="brand-file">
                {count} {t(lang, 'people')}
              </span>
              <button
                className={`sync-pill ${sync.status}`}
                onClick={() => void engine.current?.sync()}
                title={syncLabel}
                aria-label={syncLabel}
              >
                <span className="sync-dot" />
                <span className="sync-text">{syncLabel}</span>
              </button>
              {reportNotes.length > 0 && (
                <button
                  className="sync-pill checks"
                  onClick={() => setShowReport(true)}
                  title={t(lang, 'importReport')}
                  aria-label={t(lang, 'importReport')}
                >
                  <span className="sync-dot" />
                  <span className="sync-text">
                    {reportNotes.length} {t(lang, reportNotes.length === 1 ? 'checkPending' : 'checksPending')}
                  </span>
                </button>
              )}
            </>
          )}
        </div>
        {tree && source && (
          <button
            className={`btn icon resources-btn ${route.name === 'resources' ? 'on' : ''}`}
            onClick={() => navigate(route.name === 'resources' ? { name: 'tree', id: source.id } : { name: 'resources', id: source.id })}
            aria-label={t(lang, 'resources')}
            title={t(lang, 'resources')}
          >
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
              <path
                d="M4 3.5h5.5a2 2 0 0 1 1.5.7 2 2 0 0 1 1.5-.7H16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-3.5a1.5 1.5 0 0 0-1.5 1.5 1.5 1.5 0 0 0-1.5-1.5H4a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <path d="M11 5.5v10" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        )}
        {tree && route.name === 'tree' && (
          <div className={`search ${searchOpen ? 'open' : ''}`}>
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
                  setSearchOpen(false);
                }
                if (e.key === 'Escape') {
                  setQuery('');
                  setSearchOpen(false);
                }
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
                        setSearchOpen(false);
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
          {tree && (
            <button
              className="btn icon search-toggle"
              onClick={() => setSearchOpen((v) => !v)}
              aria-label={t(lang, 'searchShort')}
              title={t(lang, 'searchShort')}
            >
              ⌕
            </button>
          )}
          {tree && !readOnly && (
            <>
              <button
                className="btn icon"
                onClick={undo}
                disabled={!history.past.length}
                aria-label={t(lang, 'undo')}
                title={`${t(lang, 'undo')} (⌘Z)`}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M9 14 4 9l5-5" />
                  <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
                </svg>
              </button>
              <button
                className="btn icon"
                onClick={redo}
                disabled={!history.future.length}
                aria-label={t(lang, 'redo')}
                title={`${t(lang, 'redo')} (⇧⌘Z)`}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m15 14 5-5-5-5" />
                  <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
                </svg>
              </button>
            </>
          )}
          <button className="btn icon" onClick={cycleTheme} aria-label={themeLabel} title={themeLabel}>
            <ThemeIcon choice={nextTheme} />
          </button>
          <UserMenu
            lang={lang}
            user={auth.user}
            accountName={account?.name}
            onAccount={() => {
              setSettingsSection('account');
              navigate({ name: 'settings' });
            }}
            onSettings={() => {
              setSettingsSection(undefined);
              navigate({ name: 'settings' });
            }}
            onAdmin={() => navigate({ name: 'admin' })}
            onSignOut={() => void signOut()}
          />
        </div>
      </header>

      <main className={`stage ${tree && layout && route.name === 'tree' ? '' : 'page'}`}>
        {tree && layout && route.name === 'tree' ? (
          <>
            {mode === 'map' && (
              <MapView
                tree={displayTree ?? tree}
                lang={lang}
                selectedId={selectedId}
                readOnly={readOnly}
                dark={effectiveTheme === 'dark'}
                onSelect={(id) => {
                  setDraft(null);
                  setEditing(false);
                  setSelectedId(id);
                }}
                onGeocoded={(fixes) => {
                  if (commit(ops.geocodePlaces(fixes))) toast(`${fixes.length} ${t(lang, 'placesLocated')}`);
                }}
                onNotice={toast}
              />
            )}
            {mode === 'timeline' && (
              <Timeline
                tree={displayTree ?? tree}
                lang={lang}
                selectedId={selectedId}
                focusId={effectiveFocus}
                onSelect={(id) => {
                  setDraft(null);
                  setEditing(false);
                  setSelectedId(id);
                }}
                pxPerYear={pxPerYear}
                onPxPerYear={setPxPerYear}
              />
            )}
            {mode === 'tree' && (
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
                  setEditing(false);
                  setAddMenu(null);
                  if (kinshipFrom && kinshipFrom !== id) {
                    startKinship(kinshipFrom, id);
                    setKinshipFrom(null);
                    return;
                  }
                  setSelectedId(id);
                }}
                onFocus={focusOn}
                onHandle={onHandle}
                draftId={draft?.preview.focusId}
                lit={lit}
                onBandChange={onBandChange}
              />
            )}
            <div className="canvas-tools">
              <button
                className="btn mode-btn"
                onClick={() => {
                  setMode((m) => (m === 'tree' ? 'timeline' : m === 'timeline' ? 'map' : 'tree'));
                  setAddMenu(null);
                  setKinshipIds(null);
                  setKinshipFrom(null);
                }}
                title={t(lang, nextMode === 'timeline' ? 'modeTimeline' : nextMode === 'map' ? 'modeMap' : 'modeTree')}
              >
                {nextMode === 'timeline' ? (
                  <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
                    <path d="M3 5h9M3 10h14M3 15h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
                  </svg>
                ) : nextMode === 'map' ? (
                  <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
                    <path
                      d="M10 17s-5-4.6-5-8.5a5 5 0 0 1 10 0C15 12.4 10 17 10 17Z"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinejoin="round"
                      fill="none"
                    />
                    <circle cx="10" cy="8.5" r="1.8" fill="currentColor" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
                    <path d="M10 3v5M4 8h12M4 8v4M16 8v4M10 8v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
                  </svg>
                )}
                {t(lang, nextMode === 'timeline' ? 'modeTimeline' : nextMode === 'map' ? 'modeMap' : 'modeTree')}
              </button>
              {mode === 'map' ? null : mode === 'timeline' ? (
                <>
                  <button className="btn" onClick={() => setPxPerYear((v) => Math.max(MIN_PPY, v / 1.3))} aria-label={t(lang, 'zoomOut')}>
                    −
                  </button>
                  <button className="btn" onClick={() => setPxPerYear((v) => Math.min(MAX_PPY, v * 1.3))} aria-label={t(lang, 'zoomIn')}>
                    +
                  </button>
                  <button
                    className="btn"
                    onClick={() => {
                      const el = document.querySelector('.frise');
                      const tlYears = Number(el?.getAttribute('data-years') ?? 0);
                      if (el && tlYears) setPxPerYear(Math.min(MAX_PPY, Math.max(MIN_PPY, (el.clientWidth - 170) / tlYears)));
                    }}
                  >
                    {t(lang, 'fitYears')}
                  </button>
                </>
              ) : (
                <>
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
                </>
              )}
            </div>
            {mode === 'tree' && (
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
            )}
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
            {kinshipFrom && tree.individuals[kinshipFrom] && !kinship && (
              <div className="kinship-banner armed" role="status">
                <span className="kinship-text">
                  {t(lang, 'kinshipArmed')} {displayName(tree.individuals[kinshipFrom]!)}
                </span>
                <button className="icon-btn" onClick={() => setKinshipFrom(null)} aria-label={t(lang, 'cancel')}>
                  ×
                </button>
              </div>
            )}
            {kinship && (
              <div className="kinship-banner" role="status">
                <span className="kinship-text">{kinship.sentence}</span>
                {kinshipIds && kinship.kind !== 'same' && (
                  <button className="btn small subtle" onClick={() => setKinshipIds({ a: kinshipIds.b, b: kinshipIds.a })}>
                    {t(lang, 'kinshipSwap')}
                  </button>
                )}
                <button className="icon-btn" onClick={() => setKinshipIds(null)} aria-label={t(lang, 'close')}>
                  ×
                </button>
              </div>
            )}
            {showReport && (
              <div className="report">
                <div className="report-head">
                  <strong>{t(lang, 'importReport')}</strong>
                  <span className="muted">
                    {reportNotes.length} · {t(lang, 'reportHint')}
                  </span>
                  <button className="icon-btn" onClick={() => setShowReport(false)} aria-label={t(lang, 'close')}>
                    ×
                  </button>
                </div>
                {reportNotes.length === 0 ? (
                  <p className="muted">{t(lang, 'reportEmpty')}</p>
                ) : (
                  <ul>
                    {reportNotes.map((n) => (
                      <li key={noteKey(n)} className={n.level}>
                        <span className="report-text">
                          {n.message}
                          {n.ids
                            ?.filter((id) => tree.individuals[id])
                            .map((id) => (
                              <button key={id} className="link" onClick={() => focusOn(id)}>
                                {displayName(tree.individuals[id]!)}
                              </button>
                            ))}
                        </span>
                        <span className="report-actions">
                          {n.fixId && tree.individuals[n.fixId] && !readOnly && (
                            <button
                              className="btn small"
                              onClick={() => {
                                focusOn(n.fixId!);
                                setEditing(true);
                              }}
                            >
                              {t(lang, 'fix')}
                            </button>
                          )}
                          <button className="btn small subtle" onClick={() => dismissNote(noteKey(n))} title={t(lang, 'dismissHint')}>
                            {t(lang, 'dismiss')}
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        ) : route.name === 'resources' && tree && source ? (
          <ResourcesPage
            lang={lang}
            tree={tree}
            treeName={source.name}
            readOnly={readOnly}
            onBack={() => navigate({ name: 'tree', id: source.id })}
            onNotice={toast}
            onSaveLinks={(r) => {
              if (commit(ops.updateTree({ resources: r }))) toast(t(lang, 'resourceSaved'));
            }}
            onSaveDocument={(media) => {
              const ids = tree.documentIds ?? [];
              const documentIds = ids.includes(media.id) ? ids : [...ids, media.id];
              if (commit(ops.updateTree({ media: [media], documentIds })))
                toast(t(lang, ids.includes(media.id) ? 'saved' : 'documentAdded'));
            }}
            onDeleteDocument={(mediaId) => {
              void (async () => {
                const answer = await ask({
                  title: t(lang, 'deleteDocument'),
                  message: t(lang, 'deleteDocumentMessage'),
                  confirmLabel: t(lang, 'delete'),
                  danger: true,
                });
                if (!answer) return;
                if (commit(ops.updateTree({ documentIds: (tree.documentIds ?? []).filter((m) => m !== mediaId) }))) {
                  void mediaStore.delete(mediaId);
                  toast(t(lang, 'documentDeleted'));
                }
              })();
            }}
          />
        ) : route.name === 'admin' && auth.user.isAdmin ? (
          <Admin lang={lang} onBack={() => navigate({ name: 'home' })} toast={toast} ask={ask} />
        ) : route.name === 'settings' ? (
          <Settings
            lang={lang}
            user={auth.user}
            account={account}
            accounts={accounts ?? []}
            theme={theme}
            defaultView={defaultView}
            section={settingsSection}
            onSelectAccount={selectAccount}
            onAccountRenamed={(name) => {
              if (account) setAccount({ ...account, name });
              void loadAccounts(account?.id);
              toast(t(lang, 'saved'));
            }}
            onLeftAccount={() => {
              void loadAccounts();
              navigate({ name: 'home' });
            }}
            onProfileRenamed={() => {
              void auth.refresh();
              toast(t(lang, 'saved'));
            }}
            onDeletionChanged={() => void auth.refresh()}
            onLang={(l) => {
              setLang(l);
              saveLang(l);
            }}
            onTheme={setTheme}
            onDefaultView={setDefaultView}
            onBack={() => navigate({ name: 'home' })}
            toast={toast}
            ask={ask}
          />
        ) : (
          <Home
            lang={lang}
            accounts={accounts}
            account={account}
            onSelectAccount={selectAccount}
            onCreateAccount={createAccount}
            onOpenTree={(tr) => void openCloud(tr.id, tr.name, tr.role)}
            onImport={() => fileInput.current?.click()}
            onNewTree={startNewTree}
            onTrees={setTreeList}
            refreshKey={homeRefresh}
            busy={busy}
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
              {!readOnly && (
                <div className="row" style={{ marginBottom: 10 }}>
                  <button className="btn primary" onClick={() => void saveVersion()}>
                    {t(lang, 'saveVersion')}
                  </button>
                </div>
              )}
              {snapshots.length === 0 ? (
                <p className="muted">{t(lang, 'noSnapshots')}</p>
              ) : (
                <ul className="snapshots">
                  {snapshots.map((s, i) => (
                    <li key={s.id}>
                      <span className="mono">{new Date(s.created_at).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB')}</span>
                      <span>
                        <strong>{s.label ?? t(lang, 'automaticVersion')}</strong>
                        <span className="muted small">
                          {' '}
                          · {t(lang, 'versionN')} {snapshots.length - i}
                          {s.by ? ` · ${t(lang, 'by')} ${s.by}` : ''}
                        </span>
                      </span>
                      <button
                        className="btn small"
                        onClick={() => void restoreSnapshot(s.id)}
                        disabled={source?.role !== 'owner'}
                        title={source?.role !== 'owner' ? t(lang, 'adminsOnly') : undefined}
                      >
                        {t(lang, 'restore')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
        {notice && (
          <div className="toast" role="status">
            {notice}
          </div>
        )}
        <Modal pending={pending} lang={lang} />
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
            setEditing(false);
            if (kinshipFrom && kinshipFrom !== id) {
              startKinship(kinshipFrom, id);
              setKinshipFrom(null);
              return;
            }
            setSelectedId(id);
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
          onDeletePerson={(id) => {
            if (commit(ops.deletePerson(id), { select: false })) toast(t(lang, 'personDeleted'));
          }}
          onSaveFamily={(id, patch: FamilyPatch) => {
            if (commit(ops.updateFamily(id, patch))) toast(t(lang, 'saved'));
          }}
          onAddChild={(pid, fid) => startDraft('child', pid, fid)}
          onLinkPartner={(pid, partner) => {
            if (commit(ops.linkPartner(pid, partner))) toast(t(lang, 'linked'));
          }}
          onLinkChild={(fid, cid) => {
            if (commit(ops.linkChild(fid, cid))) toast(t(lang, 'linked'));
          }}
          onUnlinkChild={(fid, cid) => {
            if (commit(ops.unlinkChild(fid, cid))) toast(t(lang, 'unlinked'));
          }}
          onMerge={(keep, drop) => {
            if (commit(ops.mergePeople(keep, drop))) toast(t(lang, 'merged'));
          }}
          onSetPortrait={(id, media) => {
            if (draft) return;
            if (commit(ops.updatePerson(id, { portrait: media }))) toast(t(lang, 'photoSaved'));
          }}
          onSaveDocument={(id, media) => {
            if (draft) return;
            const person = tree.individuals[id];
            if (!person) return;
            const mediaIds = person.mediaIds.includes(media.id) ? person.mediaIds : [...person.mediaIds, media.id];
            if (commit(ops.updatePerson(id, { media: [media], mediaIds })))
              toast(t(lang, person.mediaIds.includes(media.id) ? 'saved' : 'documentAdded'));
          }}
          onDeleteDocument={(id, mediaId) => {
            if (draft) return;
            void (async () => {
              const answer = await ask({
                title: t(lang, 'deleteDocument'),
                message: t(lang, 'deleteDocumentMessage'),
                confirmLabel: t(lang, 'delete'),
                danger: true,
              });
              if (!answer) return;
              const person = tree.individuals[id];
              if (!person) return;
              if (commit(ops.updatePerson(id, { mediaIds: person.mediaIds.filter((m) => m !== mediaId) }))) {
                void mediaStore.delete(mediaId);
                toast(t(lang, 'documentDeleted'));
              }
            })();
          }}
          onSaveLeads={(id, leads) => {
            if (draft) return;
            if (commit(ops.updatePerson(id, { leads }))) toast(t(lang, 'saved'));
          }}
          onNotice={toast}
        />
      )}
    </div>
  );
}
