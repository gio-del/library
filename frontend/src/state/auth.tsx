import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setUnauthorizedHandler } from '../lib/api';

type Status = 'loading' | 'in' | 'out';
interface AuthValue {
  status: Status;
  coverRead: boolean;
  login(user: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [coverRead, setCoverRead] = useState(false);

  useEffect(() => {
    setUnauthorizedHandler(() => setStatus('out'));
    api<{ authenticated: boolean; coverRead?: boolean }>('GET', '/api/auth/status')
      .then((s) => { setCoverRead(Boolean(s.coverRead)); setStatus(s.authenticated ? 'in' : 'out'); })
      .catch(() => setStatus('out'));
  }, []);

  const login = useCallback(async (user: string, password: string) => {
    await api('POST', '/api/login', { user: user || undefined, password });
    setStatus('in');
  }, []);
  const logout = useCallback(async () => {
    await api('POST', '/api/logout').catch(() => {});
    setStatus('out');
  }, []);

  const value = useMemo(() => ({ status, coverRead, login, logout }), [status, coverRead, login, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('AuthProvider mancante');
  return v;
}
