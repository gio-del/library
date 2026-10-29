import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { bookGenres, bookTitle, genreCounts, matchRead, norm, ratingOf, sortBooks, type ReadFilter, type SortOrder } from '../lib/books';
import { cn } from '../lib/cn';
import type { Book } from '../lib/types';
import { useBooks } from '../state/books';
import { Badge, Cover, Input, Msg } from '../components/ui';
import { Sheet } from '../components/Sheet';

const STATES: [ReadFilter, string][] = [['all', 'Tutti'], ['toread', 'Da leggere'], ['read', 'Letti']];
const ORDERS: [SortOrder, string][] = [['recent', 'Aggiunti di recente'], ['title', 'Titolo A→Z'], ['author', 'Autore A→Z'], ['rating', 'Voto']];
const matchText = (b: Book, q: string) => !q || norm([b.title, ...b.authors].filter(Boolean).join(' ')).includes(q);

export function Library() {
  const { books, loaded, load } = useBooks();
  const [state, setState] = useState<ReadFilter>('all');
  const [genre, setGenre] = useState('');
  const [minRating, setMinRating] = useState(0);
  const [order, setOrder] = useState<SortOrder>('recent');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');
  const { key } = useLocation();

  // Un tocco su «Libreria» in alto naviga di nuovo qui (nuova key): azzera ricerca e filtri.
  useEffect(() => { setState('all'); setGenre(''); setMinRating(0); setQuery(''); setOrder('recent'); }, [key]);

  useEffect(() => { load().catch((e: Error & { status?: number }) => { if (e.status !== 401) setErr(e.message); }); }, [load]);

  const q = norm(query.trim());
  // I conteggi dello stato e dei generi tengono conto della ricerca, così i numeri sui chip sono quelli che si vedranno.
  const searched = useMemo(() => books.filter((b) => matchText(b, q)), [books, q]);
  const shown = useMemo(() => sortBooks(searched.filter((b) => matchRead(b, state) && (!genre || bookGenres(b).includes(genre)) && ratingOf(b) >= minRating), order), [searched, state, genre, minRating, order]);
  const genres = genreCounts(searched, state, genre);
  const count = (f: ReadFilter) => searched.filter((b) => matchRead(b, f)).length;
  const active = state !== 'all' || genre !== '' || minRating > 0 || q !== '' || order !== 'recent';

  let status = '';
  if (err) status = err;
  else if (loaded && !books.length) status = 'La libreria è vuota. Scansiona un libro per iniziare.';
  else if (loaded && !shown.length) status = 'Nessun libro corrisponde ai filtri.';

  return (
    <section>
      <div data-sticky-bar className="sticky top-[calc(3.75rem+3px+env(safe-area-inset-top))] z-10 -mx-4 bg-cream px-4 pb-2 pt-1">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" />
            <Input type="search" aria-label="Cerca per titolo o autore" placeholder="Cerca per titolo o autore" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-10 pr-11 [&::-webkit-search-cancel-button]:hidden" />
            {query && <button type="button" aria-label="Cancella la ricerca" onClick={() => setQuery('')} className="absolute right-0 top-0 flex size-12 items-center justify-center text-muted"><X aria-hidden className="size-5" /></button>}
          </div>
          <button type="button" aria-label="Filtri" onClick={() => setOpen(true)} className="relative flex size-12 shrink-0 items-center justify-center rounded-xl bg-plum-2 text-white">
            <SlidersHorizontal aria-hidden />
            {(genre || minRating > 0) && <span aria-hidden data-testid="filter-dot" className="absolute right-2 top-2 size-2.5 rounded-full bg-gold ring-2 ring-plum-2" />}
          </button>
        </div>
        <div role="group" aria-label="Stato" className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-lilac-soft p-1">
          {STATES.map(([f, label]) => (
            <button key={f} type="button" aria-pressed={state === f} onClick={() => setState(f)} className={cn('min-h-11 min-w-0 rounded-lg px-1 text-center text-sm font-medium leading-tight', state === f ? 'bg-plum text-white' : 'text-plum')}>{label} ({count(f)})</button>
          ))}
        </div>
        {(genre || minRating > 0) && (
          <div data-testid="active-filters" className="mt-2 flex flex-wrap gap-2">
            {genre && <button type="button" onClick={() => setGenre('')} aria-label={`Togli il filtro ${genre}`} className="flex min-h-11 max-w-full items-center gap-1.5 rounded-full bg-gold px-4 text-sm font-medium text-plum"><span className="min-w-0 [overflow-wrap:anywhere]">{genre}</span><X aria-hidden className="size-4 shrink-0" /></button>}
            {minRating > 0 && <button type="button" onClick={() => setMinRating(0)} aria-label={`Togli il filtro Voto minimo ${minRating}`} className="flex min-h-11 max-w-full items-center gap-1.5 rounded-full bg-gold px-4 text-sm font-medium text-plum"><span className="min-w-0">Voto minimo {minRating}</span><X aria-hidden className="size-4 shrink-0" /></button>}
          </div>
        )}
      </div>

      {status && <Msg text={status} error={!!err} />}
      <p aria-live="polite" className="sr-only">{loaded && shown.length ? `${shown.length} libri` : ''}</p>
      <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 pt-2 sm:grid-cols-3">
        {shown.map((b) => (
          <li key={b.isbn}>
            <Link to={`/libro/${b.isbn}`} className="relative isolate flex h-full flex-col gap-1.5 rounded-xl bg-paper p-2 shadow-sm">
              <Badge read={b.read} className="absolute left-3.5 top-3.5 z-10 shadow" />
              <Cover book={b}>{bookTitle(b)}</Cover>
              <span className="line-clamp-2 text-sm font-semibold leading-snug [overflow-wrap:anywhere]">{bookTitle(b)}</span>
              <span className="line-clamp-1 text-sm text-muted">{b.authors.join(', ')}</span>
            </Link>
          </li>
        ))}
      </ul>

      <Sheet open={open} onOpenChange={setOpen} title="Filtri">
        <p className="mb-2 text-sm font-medium text-muted">Ordina per</p>
        <div role="group" aria-label="Ordina per" className="mb-4 flex flex-col gap-2">
          {ORDERS.map(([o, label]) => (
            <button key={o} type="button" aria-pressed={order === o} onClick={() => setOrder(o)} className={cn('flex min-h-12 items-center rounded-xl px-4 text-left font-medium', order === o ? 'bg-plum text-white' : 'bg-lilac-soft text-plum')}>{label}</button>
          ))}
        </div>
        <p className="mb-2 text-sm font-medium text-muted">Voto minimo</p>
        <div role="group" aria-label="Voto minimo" className="mb-4 grid grid-cols-3 gap-2">
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-pressed={minRating === n} onClick={() => setMinRating(n)} className={cn('min-h-12 rounded-xl px-2 text-center font-medium', minRating === n ? 'bg-plum text-white' : 'bg-lilac-soft text-plum')}>{n ? `${n} ${n === 1 ? 'stella' : 'stelle'}` : 'Tutti'}</button>
          ))}
        </div>
        <p className="mb-2 text-sm font-medium text-muted">Genere</p>
        <div role="group" aria-label="Genere" className="flex flex-col gap-2">
          <GenreRow label="Tutti i generi" count={count(state)} on={genre === ''} onPick={() => { setGenre(''); setOpen(false); }} />
          {genres.map(([g, c]) => <GenreRow key={g} label={g} count={c} on={genre === g} onPick={() => { setGenre(g); setOpen(false); }} />)}
        </div>
        <button type="button" disabled={!active} onClick={() => { setState('all'); setGenre(''); setMinRating(0); setQuery(''); setOrder('recent'); setOpen(false); }} className="mt-4 min-h-11 w-full rounded-xl bg-lilac-soft font-medium text-plum disabled:opacity-50">Azzera tutto</button>
      </Sheet>
    </section>
  );
}

function GenreRow({ label, count, on, onPick }: { label: string; count: number; on: boolean; onPick(): void }) {
  return (
    <button type="button" aria-pressed={on} onClick={onPick} className={cn('flex min-h-12 items-center justify-between rounded-xl px-4 text-left', on ? 'bg-plum text-white' : 'bg-lilac-soft text-plum')}>
      <span className="font-medium">{label}</span><span className={cn('text-sm', on ? 'text-white/80' : 'text-muted')}>{count}</span>
    </button>
  );
}
