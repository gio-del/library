import { useState, type FormEvent } from 'react';
import { useAuth } from '../state/auth';
import { Button, Field, Input, Msg } from '../components/ui';

export function Login() {
  const { login } = useAuth();
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    try { await login(user, password); setPassword(''); } catch (err) { setMsg((err as Error).message); }
  }

  return (
    <main className="mx-auto max-w-2xl p-4">
      <img src="/logo" alt="Logo della libreria" className="mx-auto my-4 block h-auto w-[min(18rem,80%)]" />
      <form onSubmit={submit}>
        <Field label="Utente"><Input value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" /></Field>
        <Field label="Password"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></Field>
        <Button type="submit">Accedi</Button>
        <Msg text={msg} error />
      </form>
    </main>
  );
}
