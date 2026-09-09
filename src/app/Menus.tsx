/** The two bar menus: the tree switcher on the tree name, and the user menu under the avatar. */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { t, type Lang } from '../i18n';
import type { Me, TreeSummary } from '../sync/api';

function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

export function Dropdown({
  open,
  onClose,
  children,
  align = 'left',
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: 'left' | 'right';
}) {
  const ref = useDismiss(open, onClose);
  if (!open) return null;
  return (
    <div ref={ref} className={`dropdown ${align}`} role="menu">
      {children}
    </div>
  );
}

interface TreeMenuProps {
  lang: Lang;
  current: { id: string; name: string; role: string };
  trees: TreeSummary[];
  owner: boolean;
  readOnly?: boolean;
  checkCount: number;
  onSwitch(tree: TreeSummary): void;
  onNewTree(): void;
  onRename(): void;
  onExport(): void;
  onSnapshots(): void;
  onSaveVersion(): void;
  onReport(): void;
  onResources(): void;
  onReload(): void;
  onDelete(): void;
}

/** Tree name → switch between the account's trees, then this tree's own actions. */
export function TreeMenu(p: TreeMenuProps) {
  const { lang } = p;
  const [open, setOpen] = useState(false);
  const others = p.trees.filter((tr) => tr.id !== p.current.id);
  const item = (label: string, action: () => void, extra = '') => (
    <button
      role="menuitem"
      className={`dd-item ${extra}`}
      onClick={() => {
        setOpen(false);
        action();
      }}
    >
      {label}
    </button>
  );
  return (
    <div className="tree-menu">
      <button
        className="tree-name-btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t(lang, 'switchTree')}
      >
        <span className="tree-name-text">{p.current.name}</span>
        <svg className="chev" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <Dropdown open={open} onClose={() => setOpen(false)}>
        <div className="dd-section">{t(lang, 'trees')}</div>
        <button role="menuitem" className="dd-item current" disabled>
          ✓ {p.current.name}
        </button>
        {others.map((tr) => (
          <button
            key={tr.id}
            role="menuitem"
            className="dd-item"
            onClick={() => {
              setOpen(false);
              p.onSwitch(tr);
            }}
          >
            {tr.name}
            <span className="dd-meta">
              {tr.people} {t(lang, 'people')}
            </span>
          </button>
        ))}
        {item(`+ ${t(lang, 'newTree')}`, p.onNewTree, 'accent')}
        <div className="dd-sep" />
        <div className="dd-section">{t(lang, 'thisTree')}</div>
        {p.owner && item(t(lang, 'renameTree'), p.onRename)}
        {item(t(lang, 'export'), p.onExport)}
        {!p.readOnly && item(t(lang, 'saveVersion'), p.onSaveVersion)}
        {item(t(lang, 'versionHistory'), p.onSnapshots)}
        <button
          role="menuitem"
          className="dd-item"
          onClick={() => {
            setOpen(false);
            p.onReport();
          }}
        >
          {t(lang, 'importReport')}
          {p.checkCount > 0 && <span className="dd-meta">{p.checkCount}</span>}
        </button>
        {item(t(lang, 'resources'), p.onResources)}
        {item(t(lang, 'reloadFromServer'), p.onReload)}
        {p.owner && item(t(lang, 'deleteTree'), p.onDelete, 'danger')}
      </Dropdown>
    </div>
  );
}

interface UserMenuProps {
  lang: Lang;
  user: Me;
  accountName?: string;
  onAccount(): void;
  onSettings(): void;
  onAdmin?(): void;
  onSignOut(): void;
}

export function UserMenu(p: UserMenuProps) {
  const { lang } = p;
  const [open, setOpen] = useState(false);
  const initial = (p.user.name || p.user.email).trim().charAt(0).toUpperCase();
  const item = (label: string, action: () => void, extra = '') => (
    <button
      role="menuitem"
      className={`dd-item ${extra}`}
      onClick={() => {
        setOpen(false);
        action();
      }}
    >
      {label}
    </button>
  );
  return (
    <div className="user-menu">
      <button
        className="avatar"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t(lang, 'account')}
        title={p.user.email}
      >
        {initial}
      </button>
      <Dropdown open={open} onClose={() => setOpen(false)} align="right">
        <div className="dd-section">
          {p.user.name && <div className="dd-strong">{p.user.name}</div>}
          <div className="dd-meta-line">{p.user.email}</div>
          {p.accountName && <div className="dd-meta-line">{p.accountName}</div>}
        </div>
        <div className="dd-sep" />
        {item(t(lang, 'accountMembers'), p.onAccount)}
        {item(t(lang, 'settings'), p.onSettings)}
        {p.user.isAdmin && p.onAdmin && item(t(lang, 'administration'), p.onAdmin)}
        <div className="dd-sep" />
        {item(t(lang, 'signOut'), p.onSignOut)}
      </Dropdown>
    </div>
  );
}
