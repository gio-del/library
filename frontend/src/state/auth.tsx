import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setUnauthorizedHandler } from '../lib/api';

type Status = 'loading' | 'in' | 'out';
interface AuthValue {
  status: Status;
  login(user: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    setUnauthorizedHandler(() => setStatus('out'));
    api<{ authenticated: boolean }>('GET', '/api/auth/status')
      .then((s) => setStatus(s.authenticated ? 'in' : 'out'))
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

  const value = useMemo(() => ({ status, login, logout }), [status, login, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('AuthProvider mancante');
  return v;
}
