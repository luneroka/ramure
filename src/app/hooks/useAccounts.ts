/** The signed-in person's family accounts, the chosen one, and its trees. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type Account, type TreeSummary } from '@/sync/api';

const LAST_ACCOUNT_KEY = 'ramure.lastAccount';

export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [treeList, setTreeList] = useState<TreeSummary[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  /** The last load failed: the server is out of reach, not the person out of accounts. */
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async (preferId?: string): Promise<Account[] | null> => {
    let r: { accounts: Account[] };
    try {
      r = await api.accounts();
    } catch {
      setUnavailable(true);
      return null;
    }
    setUnavailable(false);
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
  }, [account, refreshKey]);

  const select = useCallback((a: Account) => {
    setAccount(a);
    localStorage.setItem(LAST_ACCOUNT_KEY, a.id);
  }, []);

  const clear = useCallback(() => {
    setAccounts(null);
    setAccount(null);
  }, []);

  const refresh = useCallback(() => setRefreshKey((n) => n + 1), []);

  return useMemo(
    () => ({ accounts, account, setAccount, treeList, setTreeList, load, select, clear, refresh, refreshKey, unavailable }),
    [accounts, account, treeList, load, select, clear, refresh, refreshKey, unavailable],
  );
}
