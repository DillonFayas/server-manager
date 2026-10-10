import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError } from '@/lib/api';

type SessionState = 'loading' | 'authenticated' | 'unauthenticated';

interface SessionContextValue {
  state: SessionState;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>('loading');

  const refresh = useCallback(async () => {
    try {
      await api.session();
      setState('authenticated');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setState('unauthenticated');
      } else {
        // Network/server error: treat as unauthenticated so Login is reachable
        setState('unauthenticated');
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (password: string) => {
    await api.login(password);
    setState('authenticated');
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setState('unauthenticated');
    }
  }, []);

  const value = useMemo(() => ({ state, login, logout, refresh }), [state, login, logout, refresh]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
