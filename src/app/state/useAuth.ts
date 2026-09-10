/**
 * Who is signed in, and how sure we are. The session lives in a cookie the
 * browser sends on its own, so every load has to ask the Worker who that is —
 * and until it answers, the shell must show neither the app nor the sign-in
 * card. That is what `restoring` is for: a settled answer of "nobody" is the
 * only thing that opens the door.
 */

import { useCallback, useEffect, useState } from 'react';
import { api, type Me } from '@/sync/api';

/** Three states, not two: "not signed in" and "not asked yet" are different answers. */
export type AuthStatus = 'restoring' | 'authenticated' | 'unauthenticated';

/**
 * How long the session screen waits before falling back to the last known
 * identity. `api.me()` gives up after 20 seconds; offline fails at once, but a
 * stalled network sits in between, and a device that already knows who it
 * belongs to should open its copy of the tree rather than watch a spinner.
 */
const RESTORE_GRACE_MS = 2500;

export interface Auth {
  user: Me | null;
  /** `restoring` until the first /me answer, so a reload does not flash the sign-in box. */
  status: AuthStatus;
  /** True when the API is unreachable (static hosting without a Worker, or offline). */
  unavailable: boolean;
  requestLink(email: string): Promise<{ link?: string; code?: string }>;
  /** The six-digit code from the mail; resolves once the session is open. */
  verifyCode(email: string, code: string): Promise<void>;
  /** The token from a mailed link, posted from this browser. */
  verifyLink(token: string): Promise<void>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
}

const ME_KEY = 'ramure.me';

/** The last known identity, so a reload without network still opens the device copy of the tree. */
function readCachedMe(): Me | null {
  try {
    return JSON.parse(localStorage.getItem(ME_KEY) ?? 'null') as Me | null;
  } catch {
    return null;
  }
}

function cacheMe(me: Me | null): void {
  try {
    if (me) localStorage.setItem(ME_KEY, JSON.stringify(me));
    else localStorage.removeItem(ME_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function useAuth(): Auth {
  const [user, setUser] = useState<Me | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const [tick, setTick] = useState(0);
  const refresh = useCallback(async () => {
    setTick((n) => n + 1);
  }, []);

  useEffect(() => {
    let alive = true;
    // Only the first check waits behind the session screen. A later refresh() — the engine
    // reporting the session gone, say — must not put that screen back over a working app.
    const grace =
      tick === 0
        ? setTimeout(() => {
            if (!alive) return;
            const cached = readCachedMe();
            if (!cached) return;
            setUser(cached);
            setRestoring(false);
          }, RESTORE_GRACE_MS)
        : undefined;
    api
      .me()
      .then((r) => {
        if (!alive) return;
        setUser(r.user);
        cacheMe(r.user);
        setUnavailable(false);
      })
      .catch(() => {
        if (!alive) return;
        // Out of reach: carry on as the last known person; the sync engine reports offline on its own.
        const cached = readCachedMe();
        if (cached) setUser(cached);
        else setUnavailable(true);
      })
      .finally(() => {
        if (!alive) return;
        clearTimeout(grace);
        setRestoring(false);
      });
    return () => {
      alive = false;
      clearTimeout(grace);
    };
  }, [tick]);

  const requestLink = useCallback(async (email: string) => {
    const r = await api.requestLink(email);
    return { link: r.link, code: r.code };
  }, []);
  const verifyLink = useCallback(async (token: string) => {
    await api.verifyLink(token);
    const r = await api.me();
    setUser(r.user);
    cacheMe(r.user);
  }, []);
  const verifyCode = useCallback(async (email: string, code: string) => {
    await api.verifyCode(email, code);
    const r = await api.me();
    setUser(r.user);
    cacheMe(r.user);
  }, []);

  const logout = useCallback(async () => {
    cacheMe(null);
    setUser(null);
    await api.logout();
  }, []);

  const status: AuthStatus = restoring ? 'restoring' : user ? 'authenticated' : 'unauthenticated';

  return { user, status, unavailable, requestLink, verifyCode, verifyLink, logout, refresh };
}
