/**
 * What happens once someone is signed in: a pending family invitation is
 * accepted, the accounts load, and the tree they were on comes back
 * (from the device copy when the server is out of reach). Later route
 * changes open and close trees the same way.
 */

import { useEffect, useRef } from 'react';
import { t, type Lang } from '../../i18n';
import { api, type Account, type Role, type TreeSummary } from '../../sync/api';
import type { Auth } from '../useAuth';
import { parseRoute, type Route } from '../router';
import { INVITE_KEY } from './useInvites';
import { readLastTree, type Source } from './useTreeSession';

interface Args {
  auth: Auth;
  lang: Lang;
  route: Route;
  navigate(r: Route, replace?: boolean): void;
  source: Source | null;
  treeList: TreeSummary[];
  /** Resolves null when the server could not be reached. */
  loadAccounts(preferId?: string): Promise<Account[] | null>;
  openTree(id: string, name: string, role: Role): Promise<void>;
  closeTree(): void;
  onInviteSettled(): void;
  toast(msg: string): void;
}

export function useBoot(a: Args) {
  const latest = useRef(a);
  useEffect(() => {
    latest.current = a;
  });

  // Signed in: accept a pending invite, load accounts, reopen the last tree.
  const bootedFor = useRef<string | null>(null);
  useEffect(() => {
    const user = a.auth.user;
    if (!user) {
      bootedFor.current = null;
      return;
    }
    if (bootedFor.current === user.id) return;
    bootedFor.current = user.id;
    const { lang, toast, navigate, loadAccounts, openTree } = latest.current;
    void (async () => {
      let prefer: string | undefined;
      const token = sessionStorage.getItem(INVITE_KEY);
      if (token) {
        try {
          prefer = (await api.acceptInvite(token)).accountId;
        } catch {
          toast(t(lang, 'inviteInvalid'));
        }
        sessionStorage.removeItem(INVITE_KEY);
        latest.current.onInviteSettled();
      }
      const list = await loadAccounts(prefer);
      if (prefer) {
        navigate({ name: 'home' }, true);
        return; // just joined: show the account's trees
      }
      const last = readLastTree();
      const r = latest.current.route;
      if (r.name === 'tree' || r.name === 'resources') {
        if (last && r.id === last.id) await openTree(last.id, last.name, last.role);
        else {
          try {
            const info = await api.getTree(r.id);
            await openTree(r.id, info.name, info.role);
          } catch {
            navigate({ name: 'home' }, true);
          }
        }
      } else if (r.name === 'home' && last && !location.hash && (list === null || list.length)) {
        // No server answer: the device copy opens and the engine reports offline on its own.
        await openTree(last.id, last.name, last.role);
      }
    })();
  }, [a.auth.user]);

  // Route changes after boot (back button, typed address): leaving a tree closes it; entering one opens it.
  useEffect(() => {
    const onHash = () => {
      const r = parseRoute(location.hash);
      const { source, treeList, openTree, closeTree } = latest.current;
      // The resources page belongs to the open tree: the tree stays loaded behind it.
      const onTree = r.name === 'tree' || r.name === 'resources';
      if (!onTree && source) closeTree();
      else if (onTree && (!source || source.id !== r.id)) {
        const tr = treeList.find((x) => x.id === r.id);
        if (tr) void openTree(tr.id, tr.name, tr.role);
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
}
