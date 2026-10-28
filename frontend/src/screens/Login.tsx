import { useState, type FormEvent } from 'react';
import { useAuth } from '../state/auth';
import { Ornament } from '../components/Ornament';
import { Button, Field, Input } from '../components/ui';

export function Login() {
  const { login } = useAuth();
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try { await login(user, password); setPassword(''); } catch (err) { setMsg((err as Error).message); }
    setBusy(false);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-8">
      <Ornament className="mb-4 rounded" />
      <img src="/logo" alt="Logo della libreria" className="mx-auto mb-4 block h-auto w-[min(16rem,70%)]" />
      <form onSubmit={(e) => void submit(e)} className="rounded-2xl bg-paper p-5 shadow-sm">
        <Field label="Utente"><Input value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" /></Field>
        <Field label="Password" error={msg}><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></Field>
        <Button type="submit" className="mt-2 w-full" disabled={busy}>Accedi</Button>
      </form>
    </main>
  );
}
