/** The bar: tree menu and status on the left, search and tools on the right. */

import { t, tn, type Lang, type StringKey } from '../../i18n';
import type { Me, TreeSummary } from '../../sync/api';
import type { SyncStatus } from '../../sync/engine';
import { TreeMenu, UserMenu } from '../Menus';
import type { Route } from '../router';
import type { Workspace } from '../session/Workspace';
import { RedoIcon, ResourcesIcon, ThemeIcon, UndoIcon } from '../ui/icons';
import { useUi } from '../ui/UiContext';
import { SearchBox } from './SearchBox';

const SYNC_KEYS: Partial<Record<SyncStatus, StringKey>> = {
  synced: 'syncSynced',
  syncing: 'syncSyncing',
  offline: 'syncOffline',
  readonly: 'syncReadonly',
  signedout: 'syncSignedOut',
  forbidden: 'syncForbidden',
  gone: 'syncGone',
  storage: 'syncStorage',
  locked: 'syncLocked',
  error: 'syncError',
};

export function syncLabel(lang: Lang, status: SyncStatus, pending: number): string {
  if (status === 'pending') return tn(lang, 'syncPendingCount', pending);
  return t(lang, SYNC_KEYS[status] ?? 'syncError');
}

interface Props {
  workspace: Workspace | null;
  user: Me;
  accountName: string | undefined;
  trees: TreeSummary[];
  route: Route;
  navigate(r: Route): void;
  onHome(): void;
  onOpenTree(tr: TreeSummary): void;
  onNewTree(): void;
  onRename(): void;
  onExport(): void;
  onSnapshots(): void;
  onSaveVersion(): void;
  onReload(): void;
  onDeleteTree(): void;
  onSettings(section?: 'account'): void;
  onSignOut(): void;
}

export function TopBar(p: Props) {
  const ui = useUi();
  const { lang } = ui;
  const w = p.workspace;
  const nextTheme = ui.effectiveTheme === 'dark' ? 'light' : 'dark';
  const themeLabel = `${t(lang, 'theme')} : ${nextTheme === 'light' ? t(lang, 'themeLight') : t(lang, 'themeDark')}`;
  const onTree = p.route.name === 'tree';
  return (
    <header className="topbar">
      <div className="brand">
        <button className="brand-name as-button" onClick={p.onHome} title={t(lang, 'library')}>
          {t(lang, 'appName')}
        </button>
        {w && (
          <>
            <TreeMenu
              lang={lang}
              current={w.source}
              trees={p.trees}
              owner={w.source.role === 'owner'}
              checkCount={w.reportNotes.length}
              onSwitch={p.onOpenTree}
              onNewTree={p.onNewTree}
              onRename={p.onRename}
              onExport={p.onExport}
              onSnapshots={p.onSnapshots}
              onSaveVersion={p.onSaveVersion}
              readOnly={w.readOnly}
              onReport={() => w.dispatch({ type: 'showReport', show: true })}
              onResources={() => p.navigate({ name: 'resources', id: w.source.id })}
              onPrint={() => p.navigate({ name: 'print', id: w.source.id })}
              onReload={p.onReload}
              onDelete={p.onDeleteTree}
            />
            <span className="brand-file">{tn(lang, 'peopleCount', w.count)}</span>
            <button
              className={`sync-pill ${w.sync.status}`}
              onClick={() => void w.engineRef.current?.sync()}
              title={syncLabel(lang, w.sync.status, w.sync.pending)}
              aria-label={syncLabel(lang, w.sync.status, w.sync.pending)}
            >
              <span className="sync-dot" />
              <span className="sync-text">{syncLabel(lang, w.sync.status, w.sync.pending)}</span>
            </button>
            {w.reportNotes.length > 0 && (
              <button
                className="sync-pill checks"
                onClick={() => w.dispatch({ type: 'showReport', show: true })}
                title={t(lang, 'importReport')}
                aria-label={t(lang, 'importReport')}
              >
                <span className="sync-dot" />
                <span className="sync-text">{tn(lang, 'checksPendingCount', w.reportNotes.length)}</span>
              </button>
            )}
          </>
        )}
      </div>
      {w && (
        <button
          className={`btn icon resources-btn ${p.route.name === 'resources' ? 'on' : ''}`}
          onClick={() =>
            p.navigate(p.route.name === 'resources' ? { name: 'tree', id: w.source.id } : { name: 'resources', id: w.source.id })
          }
          aria-label={t(lang, 'resources')}
          title={t(lang, 'resources')}
        >
          <ResourcesIcon />
        </button>
      )}
      {w && onTree && (
        <SearchBox
          tree={w.tree}
          lang={lang}
          open={w.editor.searchOpen}
          onOpenChange={(open) => w.dispatch({ type: 'setSearchOpen', open })}
          onPick={w.focusOn}
        />
      )}
      <div className="actions">
        {w && (
          <button
            className="btn icon search-toggle"
            onClick={() => w.dispatch({ type: 'setSearchOpen', open: !w.editor.searchOpen })}
            aria-label={t(lang, 'searchShort')}
            title={t(lang, 'searchShort')}
          >
            ⌕
          </button>
        )}
        {w && !w.readOnly && (
          <>
            <button
              className="btn icon"
              onClick={w.undo}
              disabled={!w.canUndo}
              aria-label={t(lang, 'undo')}
              title={`${t(lang, 'undo')} (⌘Z)`}
            >
              <UndoIcon />
            </button>
            <button
              className="btn icon"
              onClick={w.redo}
              disabled={!w.canRedo}
              aria-label={t(lang, 'redo')}
              title={`${t(lang, 'redo')} (⇧⌘Z)`}
            >
              <RedoIcon />
            </button>
          </>
        )}
        <button className="btn icon" onClick={ui.cycleTheme} aria-label={themeLabel} title={themeLabel}>
          <ThemeIcon choice={nextTheme} />
        </button>
        <UserMenu
          lang={lang}
          user={p.user}
          accountName={p.accountName}
          onAccount={() => p.onSettings('account')}
          onSettings={() => p.onSettings()}
          onAdmin={() => p.navigate({ name: 'admin' })}
          onSignOut={p.onSignOut}
        />
      </div>
    </header>
  );
}
