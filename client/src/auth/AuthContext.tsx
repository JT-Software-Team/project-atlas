import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, onUnauthorized } from '../lib/api';
import type { User } from '../lib/types';

interface AuthState {
  user: User | null;
  status: 'loading' | 'authenticated' | 'anonymous';
  login: (email: string, password: string, remember: boolean) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  isSuperAdmin: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthState['status']>('loading');

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<{ user?: User }>('/auth/me');
      if (!res?.user?.id || !res?.user?.role) {
        setUser(null);
        setStatus('anonymous');
        return;
      }
      setUser(res.user);
      setStatus('authenticated');
    } catch {
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => onUnauthorized(() => { setUser(null); setStatus('anonymous'); }), []);

  const login = useCallback(async (email: string, password: string, remember: boolean) => {
    await api.post('/auth/login', { email, password, remember });
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } finally {
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  const value = useMemo<AuthState>(() => ({
    user, status, login, logout, refresh,
    isSuperAdmin: user?.role === 'super_admin',
    isAdmin: user?.role === 'super_admin' || user?.role === 'project_admin',
  }), [user, status, login, logout, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
