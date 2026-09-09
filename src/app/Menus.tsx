/** The two bar menus: the tree switcher on the tree name, and the user menu under the avatar. */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { t, tn, type Lang } from '../i18n';
import type { Me, TreeSummary } from '../sync/api';

const ITEMS = '[role="menuitem"]:not([disabled])';

/** Close on a click outside or Escape; move through the items with the arrow keys; give focus back to the trigger. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const items = () => Array.from(ref.current?.querySelectorAll<HTMLElement>(ITEMS) ?? []);
    items()[0]?.focus();
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
      const list = items();
      if (!list.length) return;
      e.preventDefault();
      const i = list.indexOf(document.activeElement as HTMLElement);
      const next =
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? list.length - 1
            : e.key === 'ArrowDown'
              ? (i + 1) % list.length
              : (i - 1 + list.length) % list.length;
      list[next]?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      before?.focus?.();
    };
  }, [open, close]);
  return ref;
}

/** A few related actions folded under one line; opens in place so it works with a finger as well as a mouse. */
function Group({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`dd-group ${open ? 'open' : ''}`}>
      <button
        role="menuitem"
        aria-haspopup="true"
        aria-expanded={open}
        className="dd-item dd-group-head"
        onClick={() => setOpen((v) => !v)}
      >
        {label}
        <svg className="chev" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && <div className="dd-subitems">{children}</div>}
    </div>
  );
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
  onPrint(): void;
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
            <span className="dd-meta">{tn(lang, 'peopleCount', tr.people)}</span>
          </button>
        ))}
        {item(`+ ${t(lang, 'newTree')}`, p.onNewTree, 'accent')}
        <div className="dd-sep" />
        <div className="dd-section">{t(lang, 'thisTree')}</div>
        {item(t(lang, 'resources'), p.onResources)}
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
        {p.owner && item(t(lang, 'renameTree'), p.onRename)}
        <Group label={t(lang, 'exportMenu')}>
          {item(t(lang, 'export'), p.onExport)}
          {item(t(lang, 'print'), p.onPrint)}
        </Group>
        <Group label={t(lang, 'versionsMenu')}>
          {!p.readOnly && item(t(lang, 'saveVersion'), p.onSaveVersion)}
          {item(t(lang, 'versionHistory'), p.onSnapshots)}
        </Group>
        {p.owner && (
          <>
            <div className="dd-sep" />
            {item(t(lang, 'deleteTree'), p.onDelete, 'danger')}
          </>
        )}
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
