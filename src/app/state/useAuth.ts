import { useCallback, useEffect, useState } from 'react';
import { api, type Me } from '@/sync/api';

export interface Auth {
  user: Me | null;
  /** True until the first /me answer, so the library does not flash the sign-in box. */
  loading: boolean;
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
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const [tick, setTick] = useState(0);
  const refresh = useCallback(async () => {
    setTick((n) => n + 1);
  }, []);

  useEffect(() => {
    let alive = true;
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
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
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

  return { user, loading, unavailable, requestLink, verifyCode, verifyLink, logout, refresh };
}
