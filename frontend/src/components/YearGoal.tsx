import { useEffect, useState, type FormEvent } from 'react';
import { Pencil } from 'lucide-react';
import { api } from '../lib/api';
import { Button, Field, Input, Msg } from './ui';

// Libri letti nell'anno `year` (data di lettura `AAAA-MM-GG`).
export function readInYear(books: { read?: boolean; readAt?: string | null }[], year: number): number {
  return books.filter((b) => b.read && typeof b.readAt === 'string' && b.readAt.startsWith(`${year}-`)).length;
}

export function YearGoal({ year, done }: { year: number; done: number }) {
  const [goal, setGoal] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api<{ goal: number | null }>('GET', '/api/goal')
      .then((r) => { if (live) setGoal(r.goal); })
      .catch(() => {})
      .finally(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, []);

  const edit = () => { setValue(goal === null ? '' : String(goal)); setError(''); setEditing(true); };
  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = Number(value);
    if (!/^\d{1,3}$/.test(value.trim()) || n < 1) { setError('Scrivi un numero intero da 1 a 999'); return; }
    setBusy(true);
    try {
      const r = await api<{ goal: number }>('PUT', '/api/goal', { goal: n });
      setGoal(r.goal);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore');
    } finally {
      setBusy(false);
    }
  }

  const pct = goal ? Math.min(100, Math.round((done / goal) * 100)) : 0;
  const h = 'mb-2 text-sm font-semibold uppercase tracking-wide text-muted';
  return (
    <section aria-labelledby="st-obj">
      <h2 id="st-obj" className={h}>Obiettivo {year}</h2>
      {!ready ? <Msg text="Carico…" /> : editing ? (
        <form onSubmit={(e) => void submit(e)} noValidate>
          <Field label="Libri da leggere quest’anno" error={error}>
            <Input type="text" inputMode="numeric" autoComplete="off" autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>Salva</Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>Annulla</Button>
          </div>
        </form>
      ) : goal === null ? (
        <Button variant="soft" onClick={edit}>Imposta un obiettivo</Button>
      ) : (
        <>
          <p className="text-lg"><strong className="text-plum">{done} di {goal}</strong> {goal === 1 ? 'libro' : 'libri'}</p>
          <div role="progressbar" aria-label={`Obiettivo ${year}`} aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(done, goal)} aria-valuetext={`${done} di ${goal} libri (${pct}%)`} className="mt-2 h-4 overflow-hidden rounded-full bg-lilac-soft">
            <div className="h-full rounded-full bg-ok transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
          </div>
          <Button variant="ghost" className="mt-3" onClick={edit}><Pencil aria-hidden className="size-4" />Modifica obiettivo</Button>
        </>
      )}
    </section>
  );
}
