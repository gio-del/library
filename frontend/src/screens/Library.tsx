import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { bookTitle, filterBooks, genreCounts, matchRead, needsRetry, type ReadFilter } from '../lib/books';
import { cn } from '../lib/cn';
import type { Book } from '../lib/types';
import { useBooks } from '../state/books';
import { useLock } from '../hooks/useLock';
import { Badge, Button, Cover, Msg } from '../components/ui';

const FILTERS: [ReadFilter, string][] = [['all', 'Tutti'], ['toread', 'Da leggere'], ['read', 'Letti']];

export function Library() {
  const { books, loaded, load, setAll, upsert, remove } = useBooks();
  const [filter, setFilter] = useState<ReadFilter>('all');
  const [genre, setGenre] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const say = (t: string, e = false) => { setMsg(t); setErr(e); };
  const lock = useLock();

  useEffect(() => { load().catch((e: Error & { status?: number }) => { if (e.status !== 401) say(e.message, true); }); }, [load]);

  const shown = filterBooks(books, filter, genre);
  const count = (f: ReadFilter) => books.filter((b) => matchRead(b, f)).length;
  const status = !loaded ? '' : !books.length ? 'La libreria è vuota' : shown.length ? `${shown.length} libri` : 'Nessun libro in questo elenco';

  async function run(label: string, fn: () => Promise<string>) {
    await lock('run', async () => {
      setBusy(true);
      say(label);
      try { say(await fn()); } catch (e) { say((e as Error).message, true); }
      setBusy(false);
    });
  }

  async function toggle(b: Book) {
    await lock(b.isbn, async () => {
      try { upsert((await api<{ book: Book }>('PATCH', `/api/books/${b.isbn}`, { read: !b.read })).book); } catch (e) { say((e as Error).message, true); }
    });
  }
  async function del(b: Book) {
    if (!confirm(`Eliminare «${bookTitle(b)}»?`)) return;
    try { await api('DELETE', `/api/books/${b.isbn}`); remove(b.isbn); } catch (e) { say((e as Error).message, true); }
  }

  const chip = (on: boolean) => cn('min-h-11 rounded-lg px-3 text-white', on ? 'bg-blue outline-[3px] outline-gold' : 'bg-plum-2');

  return (
    <section>
      <Msg text={msg || status} error={err} />
      <div role="group" aria-label="Filtro" className="mb-3 flex gap-1.5">
        {FILTERS.map(([f, label]) => <button key={f} type="button" className={cn(chip(filter === f), 'flex-1')} onClick={() => setFilter(f)}>{label} ({count(f)})</button>)}
      </div>
      {books.length > 0 && (
        <div role="group" aria-label="Genere" className="mb-3 flex flex-wrap gap-1.5">
          <button type="button" className={chip(genre === '')} onClick={() => setGenre('')}>Tutti i generi ({count(filter)})</button>
          {genreCounts(books, filter, genre).map(([g, c]) => <button key={g} type="button" className={chip(genre === g)} onClick={() => setGenre(g)}>{g} ({c})</button>)}
        </div>
      )}
      {books.some(needsRetry) && (
        <Button className="mb-2 w-full" disabled={busy} onClick={() => void run('Cerco i libri incompleti…', async () => {
          const r = await api<{ found: number; retried: number }>('POST', '/api/books/lookup-failed');
          await load();
          return `Aggiornati ${r.found} libri su ${r.retried}`;
        })}>Cerca di nuovo i libri senza dati o copertina</Button>
      )}
      <Button className="mb-3 w-full" disabled={busy} onClick={() => void run('Rileggo i generi…', async () => {
        const r = await api<{ books: Book[]; changed: number }>('POST', '/api/books/classify');
        setAll(r.books);
        return `Generi aggiornati su ${r.changed} libri`;
      })}>Rileggi i generi (senza toccare quelli corretti)</Button>
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3 p-0">
        {shown.map((b) => (
          <li key={b.isbn} className="relative flex flex-col items-center gap-1 rounded-lg bg-paper p-2 text-center shadow">
            <span className="absolute left-3 top-3"><Badge read={b.read} /></span>
            <Link to={`/libro/${b.isbn}`} className="flex w-full flex-col items-center gap-1">
              <Cover book={b} />
              <span className="font-semibold [overflow-wrap:anywhere]">{bookTitle(b)}</span>
              <span className="text-sm text-muted">{b.authors.join(', ')}</span>
            </Link>
            <Button onClick={() => void toggle(b)}>{b.read ? 'Segna da leggere' : 'Segna letto'}</Button>
            <Button variant="danger" onClick={() => void del(b)}>Elimina</Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
