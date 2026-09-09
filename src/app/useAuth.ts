import { useCallback, useEffect, useState } from 'react';
import { api, type Me } from '../sync/api';

export interface Auth {
  user: Me | null;
  /** True until the first /me answer, so the library does not flash the sign-in box. */
  loading: boolean;
  /** True when the API is unreachable (static hosting without a Worker, or offline). */
  unavailable: boolean;
  requestLink(email: string): Promise<{ link?: string; code?: string }>;
  /** The six-digit code from the mail; resolves once the session is open. */
  verifyCode(email: string, code: string): Promise<void>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
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
        setUnavailable(false);
      })
      .catch(() => alive && setUnavailable(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [tick]);

  const requestLink = useCallback(async (email: string) => {
    const r = await api.requestLink(email);
    return { link: r.link, code: r.code };
  }, []);
  const verifyCode = useCallback(async (email: string, code: string) => {
    await api.verifyCode(email, code);
    const r = await api.me();
    setUser(r.user);
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  return { user, loading, unavailable, requestLink, verifyCode, logout, refresh };
}
