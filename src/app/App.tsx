/**
 * The shell: who is signed in, which route, which tree. Everything below it
 * reads the UI context and the workspace; this file only wires them.
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { t } from '../i18n';
import { api, ApiError, type Role, type TreeSummary } from '../sync/api';
import { SyncEngine } from '../sync/engine';
import { Admin } from './Admin';
import { Home } from './Home';
import { Login } from './Login';
import type { DefaultView } from './Settings';
import { historyReducer, initialHistory } from './history';
import { useAccounts } from './hooks/useAccounts';
import { useBoot } from './hooks/useBoot';
import { useEngineEvents } from './hooks/useEngineEvents';
import { useInvites } from './hooks/useInvites';
import { useSnapshots } from './hooks/useSnapshots';
import { useTreeFiles } from './hooks/useTreeFiles';
import { useTreeSession } from './hooks/useTreeSession';
import { useWorkspaceState } from './hooks/useWorkspaceState';
import { useHashRoute } from './router';
import { WorkspaceProvider } from './session/Workspace';
import { PersonPanelHost } from './stage/PersonPanelHost';
import { PrintPage } from './PrintPage';
import { ResourcesHost } from './stage/ResourcesHost';
import { SettingsHost } from './stage/SettingsHost';
import { SnapshotsDialog } from './stage/SnapshotsDialog';
import { TopBar } from './stage/TopBar';
import { TreeStage } from './stage/TreeStage';
import { defaultFocus } from './hooks/useTreeLayout';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { ThemeIcon } from './ui/icons';
import { UiProvider, useUi } from './ui/UiContext';
import { UpdateBanner } from './ui/UpdateBanner';
import { reportError } from './report';
import { useAuth } from './useAuth';

const DEFAULT_VIEW_KEY = 'ramure.defaultView';

export function App() {
  return (
    <ErrorBoundary>
      <UiProvider>
        <Shell />
        <UpdateBanner />
      </UiProvider>
    </ErrorBoundary>
  );
}

function Shell() {
  const ui = useUi();
  const { lang, toast, ask } = ui;
  const auth = useAuth();
  const [route, navigate] = useHashRoute();
  const accounts = useAccounts();
  const [history, historyDispatch] = useReducer(historyReducer, initialHistory);
  const committing = useRef(false);
  const [settingsSection, setSettingsSection] = useState<'account' | undefined>();
  const [defaultView, setDefaultViewState] = useState<DefaultView>(() =>
    localStorage.getItem(DEFAULT_VIEW_KEY) === 'all' ? 'all' : 'hourglass',
  );
  const setDefaultView = (v: DefaultView) => {
    setDefaultViewState(v);
    localStorage.setItem(DEFAULT_VIEW_KEY, v);
  };
  const fileInput = useRef<HTMLInputElement>(null);

  // Promises nobody awaited still deserve a message rather than silence.
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason instanceof Error ? e.reason.message : String(e.reason);
      toast(`${t(lang, 'unexpectedError')} : ${reason}`);
      reportError('rejection', e.reason);
    };
    const onError = (e: ErrorEvent) => reportError('error', e.error ?? e.message);
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('error', onError);
    return () => {
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('error', onError);
    };
  }, [lang, toast]);

  // ---------- The open tree ----------
  const goHomeRef = useRef<() => void>(() => {});
  const setCommitting = useCallback((on: boolean) => {
    committing.current = on;
  }, []);
  const events = useEngineEvents({ lang, toast, historyDispatch, committing, goHome: goHomeRef, refreshAuth: auth.refresh });
  const session = useTreeSession(events.onEvent);
  const { source, sync, engine } = session;

  const [snapshotsOpen, setSnapshotsOpen] = useState(false);
  const onEscape = useCallback(() => setSnapshotsOpen(false), []);
  const { editor, dispatch, workspace, onHandle } = useWorkspaceState({
    lang,
    userId: auth.user?.id,
    history,
    historyDispatch,
    source,
    sync,
    engine,
    setCommitting,
    toast,
    ask,
    onEscape,
  });

  const closeTree = useCallback(() => {
    session.close();
    historyDispatch({ type: 'close' });
    dispatch({ type: 'treeClosed' });
    accounts.refresh();
  }, [session, accounts, dispatch]);

  const goHome = useCallback(() => {
    closeTree();
    navigate({ name: 'home' });
  }, [closeTree, navigate]);
  useEffect(() => {
    goHomeRef.current = goHome;
  }, [goHome]);

  const openTree = useCallback(
    async (id: string, name: string, role: Role, thenEdit?: boolean) => {
      try {
        const opened = await session.open(id, name, role);
        if (!opened) return;
        events.reset();
        historyDispatch({ type: 'load', tree: opened, fileName: name });
        dispatch({ type: 'treeOpened', focusId: defaultFocus(opened), view: defaultView });
        navigate({ name: 'tree', id }, true);
        const first = thenEdit ? Object.keys(opened.individuals)[0] : undefined;
        if (first) {
          dispatch({ type: 'select', id: first });
          dispatch({ type: 'setEditing', editing: true });
        }
      } catch (err) {
        toast(err instanceof ApiError && err.status === 404 ? t(lang, 'inviteInvalid') : t(lang, 'syncError'));
      }
    },
    [session, events, dispatch, defaultView, navigate, toast, lang],
  );
  const openSummary = useCallback((tr: TreeSummary) => void openTree(tr.id, tr.name, tr.role), [openTree]);

  // Leaving with unsynced edits deserves a warning; they are stored, but the person may not know.
  useEffect(() => {
    if (!sync.pending) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [sync.pending]);

  const invites = useInvites(auth, lang, toast);
  useBoot({
    auth,
    lang,
    route,
    navigate,
    source,
    treeList: accounts.treeList,
    loadAccounts: accounts.load,
    openTree,
    closeTree,
    onInviteSettled: () => invites.setPendingInvite(null),
    toast,
  });

  const files = useTreeFiles({
    lang,
    account: accounts.account,
    source,
    tree: history.tree,
    toast,
    ask,
    openTree,
    onRenamed: (name) => {
      session.rename(name);
      historyDispatch({ type: 'rename', fileName: name });
      accounts.setTreeList((l) => l.map((x) => (x.id === source?.id ? { ...x, name } : x)));
    },
    onDeleted: (id) => {
      if (source?.id === id) {
        void engine.current?.forget();
        goHome();
      } else {
        void new SyncEngine(id, true).forget();
        accounts.refresh();
      }
    },
  });

  const snaps = useSnapshots({
    lang,
    source,
    engine,
    toast,
    ask,
    commit: (op, opts) => workspace?.commit(op, opts) ?? false,
    onRestored: () => dispatch({ type: 'select', id: undefined }),
  });
  const openSnapshots = () => {
    setSnapshotsOpen(true);
    void snaps.openSnapshots();
  };

  const createAccount = async (name: string) => {
    try {
      await accounts.load((await api.createAccount(name)).id);
    } catch {
      toast(t(lang, 'syncError'));
    }
  };
  const signOut = async () => {
    goHome();
    accounts.clear();
    await auth.logout();
  };

  // ---------- Gate: everything behind sign-in ----------
  if (!auth.user) {
    const nextTheme = ui.effectiveTheme === 'dark' ? 'light' : 'dark';
    const themeLabel = `${t(lang, 'theme')} : ${nextTheme === 'light' ? t(lang, 'themeLight') : t(lang, 'themeDark')}`;
    return (
      <div className="app gate">
        <Login lang={lang} auth={auth} pendingInvite={invites.pendingInvite} toast={toast} />
        <div className="gate-tools">
          <button className="btn icon" onClick={ui.cycleTheme} aria-label={themeLabel} title={themeLabel}>
            <ThemeIcon choice={nextTheme} />
          </button>
        </div>
      </div>
    );
  }

  const account = accounts.account;
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && account && account.role !== 'viewer') void files.openFile(f);
  };
  const onTree = workspace && (route.name === 'tree' || route.name === 'resources' || route.name === 'print');

  return (
    <div className="app" onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
      <input
        ref={fileInput}
        type="file"
        accept=".ged,.gedcom,text/plain"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void files.openFile(f);
          e.target.value = '';
        }}
      />
      <TopBar
        workspace={workspace}
        user={auth.user}
        accountName={account?.name}
        trees={accounts.treeList}
        route={route}
        navigate={navigate}
        onHome={goHome}
        onOpenTree={openSummary}
        onNewTree={() => void files.startNewTree()}
        onRename={() => void files.renameTree()}
        onExport={files.exportGedcom}
        onSnapshots={openSnapshots}
        onSaveVersion={() => void snaps.saveVersion()}
        onReload={() => void engine.current?.reloadFromServer().then(() => toast(t(lang, 'reloaded')))}
        onDeleteTree={() =>
          source && void files.deleteTree({ id: source.id, name: source.name, version: 0, people: 0, updated_at: 0, role: source.role })
        }
        onSettings={(section) => {
          setSettingsSection(section);
          navigate({ name: 'settings' });
        }}
        onSignOut={() => void signOut()}
      />

      <main className={`stage ${onTree && route.name === 'tree' ? '' : 'page'}`}>
        {onTree ? (
          <WorkspaceProvider value={workspace}>
            {route.name === 'tree' ? (
              <TreeStage onHandle={onHandle} />
            ) : route.name === 'print' ? (
              <PrintPage navigate={navigate} />
            ) : (
              <ResourcesHost navigate={navigate} />
            )}
          </WorkspaceProvider>
        ) : route.name === 'admin' && auth.user.isAdmin ? (
          <Admin lang={lang} onBack={() => navigate({ name: 'home' })} toast={toast} ask={ask} />
        ) : route.name === 'settings' ? (
          <SettingsHost
            auth={auth}
            accounts={accounts}
            section={settingsSection}
            defaultView={defaultView}
            onDefaultView={setDefaultView}
            navigate={navigate}
            onSignedOutEverywhere={() => void signOut()}
          />
        ) : (
          <Home
            lang={lang}
            accounts={accounts.accounts}
            account={account}
            onSelectAccount={accounts.select}
            onCreateAccount={createAccount}
            onOpenTree={openSummary}
            onImport={() => fileInput.current?.click()}
            onNewTree={() => void files.startNewTree()}
            onTrees={accounts.setTreeList}
            refreshKey={accounts.refreshKey}
            busy={files.busy}
            unavailable={accounts.unavailable}
            onRetry={() => void accounts.load()}
          />
        )}
        {snapshotsOpen && snaps.snapshots && workspace && (
          <SnapshotsDialog
            snapshots={snaps.snapshots}
            readOnly={workspace.readOnly}
            owner={workspace.source.role === 'owner'}
            onClose={() => setSnapshotsOpen(false)}
            onSaveVersion={() => void snaps.saveVersion()}
            onRestore={(id) => {
              setSnapshotsOpen(false);
              void snaps.restoreSnapshot(id);
            }}
          />
        )}
      </main>

      {workspace && editor.selectedId && (
        <WorkspaceProvider value={workspace}>
          <PersonPanelHost />
        </WorkspaceProvider>
      )}
    </div>
  );
}
