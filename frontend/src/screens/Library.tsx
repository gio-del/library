import { Check, CheckSquare, Search, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { authorCounts, bookGenres, languageCounts, languageOf, publisherCounts, publisherOf, hasAuthor, isIncomplete, bookTitle, genreCounts, matchesQuery, matchRead, norm, ratingOf, seriesCounts, seriesKey, seriesOf, groupStarts, sortBooks, type ReadFilter, type SortOrder } from '../lib/books';
import { cn } from '../lib/cn';
import { useBooks, type BulkAction } from '../state/books';
import { useToast } from '../components/Toast';
import { Confirm } from '../components/Confirm';
import { useLibraryView, type LibraryView } from '../state/libraryView';
import { Badge, Button, Cover, Input, Msg } from '../components/ui';
import { Sheet } from '../components/Sheet';
import { LetterRail, type RailGroup } from '../components/LetterRail';

const STATES: [ReadFilter, string][] = [['all', 'Tutti'], ['toread', 'Da leggere'], ['read', 'Letti']];
const ORDERS: [SortOrder, string][] = [['recent', 'Aggiunti di recente'], ['read', 'Letti di recente'], ['year', 'Anno di pubblicazione'], ['title', 'Titolo A→Z'], ['author', 'Autore A→Z'], ['rating', 'Voto']];
const DEFAULT_ORDER: SortOrder = 'author';

const MIN_RAIL = 12;
const LONG_PRESS_MS = 500;

export function Library() {
  const { books, loaded, load, bulk } = useBooks();
  const { toast } = useToast();
  const store = useLibraryView();
  const { key, state: navState } = useLocation();
  // Tornando dalla scheda di un libro (stessa voce di cronologia) si riprende da dove si era.
  const saved = useRef(store.current?.key === key ? store.current : null).current;
  const [state, setState] = useState<ReadFilter>(saved?.state ?? 'all');
  const [genre, setGenre] = useState(saved?.genre ?? '');
  const [series, setSeries] = useState(saved?.series ?? '');
  const [language, setLanguage] = useState(saved?.language ?? '');
  const [publisher, setPublisher] = useState(saved?.publisher ?? '');
  const [author, setAuthor] = useState(saved?.author ?? '');
  const [incomplete, setIncomplete] = useState(saved?.incomplete ?? false);
  const [minRating, setMinRating] = useState(saved?.minRating ?? 0);
  const [order, setOrder] = useState<SortOrder>(saved?.order ?? DEFAULT_ORDER);
  const [query, setQuery] = useState(saved?.query ?? '');
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [genreOpen, setGenreOpen] = useState(false);
  const [newGenre, setNewGenre] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const press = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const longPressed = useRef(false);
  const first = useRef(true);
  const pendingScroll = useRef<number | null>(saved ? saved.scrollY : null);
  const view = useRef<Omit<LibraryView, 'scrollY'>>({ key, state, genre, series, language, publisher, author, incomplete, minRating, order, query });
  view.current = { key, state, genre, series, language, publisher, author, incomplete, minRating, order, query };

  // Un tocco su «Libreria» in alto naviga di nuovo qui (nuova key): azzera ricerca, filtri e posizione.
  // Dalla scheda del libro si arriva con l'autore scelto nello stato di navigazione.
  useEffect(() => {
    if (first.current) { first.current = false; if (saved) return; }
    pendingScroll.current = null;
    setState('all'); setGenre(''); setSeries(typeof navState?.series === 'string' ? navState.series : ''); setLanguage(''); setPublisher(''); setAuthor(typeof navState?.author === 'string' ? navState.author : ''); setIncomplete(false); setMinRating(0); setQuery(''); setOrder(DEFAULT_ORDER); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // All'uscita dalla Libreria si salvano i filtri e la posizione di scorrimento.
  useLayoutEffect(() => () => { store.current = { ...view.current, scrollY: window.scrollY }; }, [store]);

  useEffect(() => { load().catch((e: Error & { status?: number }) => { if (e.status !== 401) setErr(e.message); }); }, [load]);

  const q = norm(query.trim());
  // I conteggi dello stato e dei generi tengono conto della ricerca, così i numeri sui chip sono quelli che si vedranno.
  const searched = useMemo(() => books.filter((b) => matchesQuery(b, q)), [books, q]);
  const shown = useMemo(() => sortBooks(searched.filter((b) => matchRead(b, state) && (!genre || bookGenres(b).includes(genre)) && (!series || seriesKey(seriesOf(b)) === seriesKey(series)) && (!language || norm(languageOf(b)) === norm(language)) && (!publisher || norm(publisherOf(b)) === norm(publisher)) && (!author || hasAuthor(b, author)) && (!incomplete || isIncomplete(b)) && ratingOf(b) >= minRating), order), [searched, state, genre, series, language, publisher, author, incomplete, minRating, order]);
  useEffect(() => {
    if (pendingScroll.current === null || !loaded) return;
    window.scrollTo({ top: pendingScroll.current });
    pendingScroll.current = null;
  }, [loaded, shown]);
  // Si agisce solo sui libri scelti che i filtri mostrano ancora.
  const selected = useMemo(() => shown.filter((b) => picked.has(b.isbn)).map((b) => b.isbn), [shown, picked]);
  const toggle = (isbn: string) => setPicked((cur) => { const n = new Set(cur); if (!n.delete(isbn)) n.add(isbn); return n; });
  const stopSelecting = () => { setSelecting(false); setPicked(new Set()); };
  const startPress = (isbn: string, e: React.PointerEvent) => {
    if (selecting || e.pointerType === 'mouse') return;
    cancelPress();
    press.current = { x: e.clientX, y: e.clientY, timer: setTimeout(() => { longPressed.current = true; press.current = null; setSelecting(true); setPicked(new Set([isbn])); }, LONG_PRESS_MS) };
  };
  const cancelPress = () => { if (press.current) clearTimeout(press.current.timer); press.current = null; };
  const movePress = (e: React.PointerEvent) => { if (press.current && Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 10) cancelPress(); };
  useEffect(() => cancelPress, []);
  const run = async (action: BulkAction, value?: string) => {
    const isbns = selected;
    if (!isbns.length || busy) return;
    setBusy(true);
    try {
      const r = await bulk(isbns, action, value);
      const word = (n: number) => `${n} ${n === 1 ? 'libro' : 'libri'}`;
      const rest = r.failed + r.unchanged;
      toast(rest ? `Aggiornati ${word(r.done)}, ${rest} non aggiornati.` : `Aggiornati ${word(r.done)}.`, rest > 0);
      stopSelecting();
    } catch (e) {
      if ((e as ApiError).status !== 401) toast(`Nessun libro aggiornato: ${isbns.length} non aggiornati. ${(e as Error).message}`, true);
    } finally { setBusy(false); }
  };
  const groups = useMemo(() => groupStarts(shown, order), [shown, order]);
  const jump = (g: RailGroup) => {
    const el = document.getElementById(`libro-${g.isbn}`);
    if (!el) return;
    const bar = document.querySelector('[data-sticky-bar]')?.getBoundingClientRect().bottom ?? 0;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - bar - 8 });
  };
  const genres = genreCounts(searched, state, genre);
  const seriesList = seriesCounts(searched, state, series);
  const languageList = languageCounts(searched, state, language);
  const publisherList = publisherCounts(searched, state, publisher);
  const authorList = authorCounts(searched, state, author);
  const incompleteCount = searched.filter((b) => matchRead(b, state) && isIncomplete(b)).length;
  const count = (f: ReadFilter) => searched.filter((b) => matchRead(b, f)).length;
  const active = state !== 'all' || genre !== '' || series !== '' || language !== '' || publisher !== '' || author !== '' || incomplete || minRating > 0 || q !== '' || order !== DEFAULT_ORDER;

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
            <Input type="search" aria-label="Cerca nella libreria" placeholder="Cerca nella libreria" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-10 pr-11 [&::-webkit-search-cancel-button]:hidden" />
            {query && <button type="button" aria-label="Cancella la ricerca" onClick={() => setQuery('')} className="absolute right-0 top-0 flex size-12 items-center justify-center text-muted"><X aria-hidden className="size-5" /></button>}
          </div>
          <button type="button" aria-label="Seleziona" aria-pressed={selecting} onClick={() => (selecting ? stopSelecting() : setSelecting(true))} className={cn('flex size-12 shrink-0 items-center justify-center rounded-xl', selecting ? 'bg-gold text-title' : 'bg-plum-2 text-white')}>
            <CheckSquare aria-hidden />
          </button>
          <button type="button" aria-label="Filtri" onClick={() => setOpen(true)} className="relative flex size-12 shrink-0 items-center justify-center rounded-xl bg-plum-2 text-white">
            <SlidersHorizontal aria-hidden />
            {(genre || series || language || publisher || author || incomplete || minRating > 0) && <span aria-hidden data-testid="filter-dot" className="absolute right-2 top-2 size-2.5 rounded-full bg-gold ring-2 ring-plum-2" />}
          </button>
        </div>
        <div role="group" aria-label="Stato" className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-lilac-soft p-1">
          {STATES.map(([f, label]) => (
            <button key={f} type="button" aria-pressed={state === f} onClick={() => setState(f)} className={cn('min-h-11 min-w-0 rounded-lg px-1 text-center text-sm font-medium leading-tight', state === f ? 'bg-plum text-white' : 'text-title')}>{label} ({count(f)})</button>
          ))}
        </div>
        {(genre || series || language || publisher || author || incomplete || minRating > 0 || q) && (
          <div data-testid="active-filters" className="mt-2 flex flex-wrap gap-2">
            {q && <button type="button" onClick={() => setQuery('')} aria-label={`Togli il filtro Testo ${query.trim()}`} className="flex min-h-11 max-w-full items-center gap-1.5 rounded-full bg-gold px-4 text-sm font-medium text-title"><span className="min-w-0 [overflow-wrap:anywhere]">Testo {query.trim()}</span><X aria-hidden className="size-4 shrink-0" /></button>}
            {genre && <button type="button" onClick={() => setGenre('')} aria-label={`Togli il filtro ${genre}`} className="flex min-h-11 max-w-full items-center gap-1.5 rounded-full bg-gold px-4 text-sm font-medium text-title"><span className="min-w-0 [overflow-wrap:anywhere]">{genre}</span><X aria-hidden className="size-4 shrink-0" /></button>}
            {series && <button type="button" onClick={() => setSeries('')} aria-label={`Togli il filtro Collana ${series}`} className="flex min-h-11 max-w-full items-center gap-1.5 rounded-full bg-gold px-4 text-sm font-medium text-title"><span className="min-w-0 [overflow-wrap:anywhere]">Collana {series}</span><X aria-hidden className="size-4 shrink-0" /></button>}
            {language && <button type="button" onClick={() => setLanguage('')} aria-label={`Togli il filtro Lingua ${language}`} className="flex min-h-11 max-w-full items-center gap-1.5 rounded-full bg-gold px-4 text-sm font-medium text-title"><span className="min-w-0 [overflow-wrap:anywhere]">Lingua {language}</span><X aria-hidden className="size-4 shrink-0" /></button>}
            {publisher && <button type="button" onClick={() => setPublisher('')} aria-label={`Togli il filtro Editore ${publisher}`} className="flex min-h-11 max-w-full items-center gap-1.5 rounded-full bg-gold px-4 text-sm font-medium text-title"><span className="min-w-0 [overflow-wrap:anywhere]">Editore {publisher}</span><X aria-hidden className="size-4 shrink-0" /></button>}
            {author && <button type="button" onClick={() => setAuthor('')} aria-label={`Togli il filtro Autore ${author}`} className="flex min-h-11 max-w-full items-center gap-1.5 rounded-full bg-gold px-4 text-sm font-medium text-title"><span className="min-w-0 [overflow-wrap:anywhere]">Autore {author}</span><X aria-hidden className="size-4 shrink-0" /></button>}
            {incomplete && <button type="button" onClick={() => setIncomplete(false)} aria-label="Togli il filtro Da completare" className="flex min-h-11 max-w-full items-center gap-1.5 rounded-full bg-gold px-4 text-sm font-medium text-title"><span className="min-w-0">Da completare</span><X aria-hidden className="size-4 shrink-0" /></button>}
            {minRating > 0 && <button type="button" onClick={() => setMinRating(0)} aria-label={`Togli il filtro Voto minimo ${minRating}`} className="flex min-h-11 max-w-full items-center gap-1.5 rounded-full bg-gold px-4 text-sm font-medium text-title"><span className="min-w-0">Voto minimo {minRating}</span><X aria-hidden className="size-4 shrink-0" /></button>}
          </div>
        )}
      </div>

      {status && <Msg text={status} error={!!err} />}
      <p aria-live="polite" className="sr-only">{loaded && shown.length ? `${shown.length} ${shown.length === 1 ? 'libro' : 'libri'}` : ''}</p>
      <ul className={cn('m-0 grid list-none grid-cols-2 gap-3 p-0 pt-2 sm:grid-cols-3', selecting && 'pb-44')}>
        {shown.map((b) => (
          <li key={b.isbn} id={`libro-${b.isbn}`}>
            {selecting ? (
              <button type="button" aria-pressed={picked.has(b.isbn)} aria-label={`Seleziona ${bookTitle(b)}`} onClick={() => toggle(b.isbn)} className={cn('relative isolate flex h-full w-full min-w-0 flex-col gap-1.5 rounded-xl bg-paper p-2 text-left shadow-sm', picked.has(b.isbn) && 'ring-4 ring-plum')}>
                <span aria-hidden className={cn('absolute right-3.5 top-3.5 z-10 flex size-7 items-center justify-center rounded-full border-2 border-plum shadow', picked.has(b.isbn) ? 'bg-plum text-white' : 'bg-paper')}>{picked.has(b.isbn) && <Check className="size-4" />}</span>
                <Badge read={b.read} className="absolute left-3.5 top-3.5 z-10 shadow" />
                <Cover book={b}>{bookTitle(b)}</Cover>
                <span className="line-clamp-2 text-sm font-semibold leading-snug [overflow-wrap:anywhere]">{bookTitle(b)}</span>
                <span className="line-clamp-1 text-sm text-muted">{b.authors.join(', ')}</span>
              </button>
            ) : (
              <Link to={`/libro/${b.isbn}`} onPointerDown={(e) => startPress(b.isbn, e)} onPointerUp={cancelPress} onPointerCancel={cancelPress} onPointerMove={movePress} onContextMenu={(e) => e.preventDefault()} onClick={(e) => { if (longPressed.current) { longPressed.current = false; e.preventDefault(); } }} className="relative isolate flex h-full select-none flex-col gap-1.5 rounded-xl bg-paper p-2 shadow-sm [-webkit-touch-callout:none]">
                <Badge read={b.read} className="absolute left-3.5 top-3.5 z-10 shadow" />
                <Cover book={b}>{bookTitle(b)}</Cover>
                <span className="line-clamp-2 text-sm font-semibold leading-snug [overflow-wrap:anywhere]">{bookTitle(b)}</span>
                <span className="line-clamp-1 text-sm text-muted">{b.authors.join(', ')}</span>
              </Link>
            )}
          </li>
        ))}
      </ul>

      {selecting && (
        <div role="toolbar" aria-label="Azioni sui libri selezionati" className="fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 mx-auto max-w-2xl rounded-t-2xl border-t border-lilac/60 bg-paper p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p aria-live="polite" className="min-w-0 font-semibold text-title">{selected.length} {selected.length === 1 ? 'selezionato' : 'selezionati'}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPicked(new Set(shown.map((b) => b.isbn)))} className="min-h-11 rounded-xl bg-lilac-soft px-3 text-sm font-medium text-title">Seleziona tutti i visibili</button>
              <button type="button" aria-label="Fine selezione" onClick={stopSelecting} className="flex size-11 items-center justify-center rounded-xl bg-lilac-soft text-title"><X aria-hidden /></button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={!selected.length || busy} onClick={() => void run('read')}>Segna come letti</Button>
            <Button disabled={!selected.length || busy} onClick={() => void run('unread')}>Segna da leggere</Button>
            <Button variant="ghost" disabled={!selected.length || busy} onClick={() => setGenreOpen(true)}>Aggiungi genere</Button>
            <Button variant="danger" disabled={!selected.length || busy} onClick={() => setConfirmDelete(true)}>Elimina</Button>
          </div>
        </div>
      )}
      <Confirm open={confirmDelete} onOpenChange={setConfirmDelete} title="Eliminare i libri?" action="Elimina" danger onConfirm={() => void run('delete')}>
        {selected.length === 1 ? 'Verrà eliminato 1 libro dalla libreria.' : `Verranno eliminati ${selected.length} libri dalla libreria.`} L’azione non si può annullare.
      </Confirm>
      <Sheet open={genreOpen} onOpenChange={setGenreOpen} title="Aggiungi genere">
        <div role="group" aria-label="Genere da aggiungere" className="flex flex-col gap-2">
          {genreCounts(books, 'all', '').map(([g]) => (
            <button key={g} type="button" onClick={() => { setGenreOpen(false); void run('addGenre', g); }} className="flex min-h-12 items-center rounded-xl bg-lilac-soft px-4 text-left font-medium text-title [overflow-wrap:anywhere]">{g}</button>
          ))}
        </div>
        <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); const g = newGenre.trim(); if (!g) return; setNewGenre(''); setGenreOpen(false); void run('addGenre', g); }}>
          <Input aria-label="Nuovo genere" placeholder="Nuovo genere" maxLength={40} value={newGenre} onChange={(e) => setNewGenre(e.target.value)} />
          <Button type="submit" disabled={!newGenre.trim()}>Aggiungi</Button>
        </form>
      </Sheet>
      {groups.length > 1 && shown.length >= MIN_RAIL && <LetterRail groups={groups} letters={order !== 'recent'} onJump={jump} />}
      <Sheet open={open} onOpenChange={setOpen} title="Filtri">
        <p className="mb-2 text-sm font-medium text-muted">Ordina per</p>
        <div role="group" aria-label="Ordina per" className="mb-4 flex flex-col gap-2">
          {ORDERS.map(([o, label]) => (
            <button key={o} type="button" aria-pressed={order === o} onClick={() => setOrder(o)} className={cn('flex min-h-12 items-center rounded-xl px-4 text-left font-medium', order === o ? 'bg-plum text-white' : 'bg-lilac-soft text-title')}>{label}</button>
          ))}
        </div>
        <p className="mb-2 text-sm font-medium text-muted">Voto minimo</p>
        <div role="group" aria-label="Voto minimo" className="mb-4 grid grid-cols-3 gap-2">
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-pressed={minRating === n} onClick={() => setMinRating(n)} className={cn('min-h-12 rounded-xl px-2 text-center font-medium', minRating === n ? 'bg-plum text-white' : 'bg-lilac-soft text-title')}>{n ? `${n} ${n === 1 ? 'stella' : 'stelle'}` : 'Tutti'}</button>
          ))}
        </div>
        <p className="mb-2 text-sm font-medium text-muted">Dati mancanti</p>
        <div role="group" aria-label="Dati mancanti" className="mb-4 flex flex-col gap-2">
          <GenreRow label="Da completare" count={incompleteCount} on={incomplete} onPick={() => { setIncomplete(!incomplete); setOpen(false); }} />
        </div>
        <p className="mb-2 text-sm font-medium text-muted">Genere</p>
        <div role="group" aria-label="Genere" className="flex flex-col gap-2">
          <GenreRow label="Tutti i generi" count={count(state)} on={genre === ''} onPick={() => { setGenre(''); setOpen(false); }} />
          {genres.map(([g, c]) => <GenreRow key={g} label={g} count={c} on={genre === g} onPick={() => { setGenre(g); setOpen(false); }} />)}
        </div>
        {seriesList.length > 0 && (
          <>
            <p className="mb-2 mt-4 text-sm font-medium text-muted">Collana</p>
            <div role="group" aria-label="Collana" className="flex flex-col gap-2">
              <GenreRow label="Tutte le collane" count={count(state)} on={series === ''} onPick={() => { setSeries(''); setOpen(false); }} />
              {seriesList.map(([s, c]) => <GenreRow key={s} label={s} count={c} on={series === s} onPick={() => { setSeries(s); setOpen(false); }} />)}
            </div>
          </>
        )}
        {(languageList.length >= 2 || language !== '') && (
          <>
            <p className="mb-2 mt-4 text-sm font-medium text-muted">Lingua</p>
            <div role="group" aria-label="Lingua" className="flex flex-col gap-2">
              <GenreRow label="Tutte le lingue" count={count(state)} on={language === ''} onPick={() => { setLanguage(''); setOpen(false); }} />
              {languageList.map(([s, c]) => <GenreRow key={s} label={s} count={c} on={norm(language) === norm(s)} onPick={() => { setLanguage(s); setOpen(false); }} />)}
            </div>
          </>
        )}
        {(publisherList.length >= 2 || publisher !== '') && (
          <>
            <p className="mb-2 mt-4 text-sm font-medium text-muted">Editore</p>
            <div role="group" aria-label="Editore" className="flex flex-col gap-2">
              <GenreRow label="Tutti gli editori" count={count(state)} on={publisher === ''} onPick={() => { setPublisher(''); setOpen(false); }} />
              {publisherList.map(([s, c]) => <GenreRow key={s} label={s} count={c} on={norm(publisher) === norm(s)} onPick={() => { setPublisher(s); setOpen(false); }} />)}
            </div>
          </>
        )}
        {authorList.length > 0 && (
          <>
            <p className="mb-2 mt-4 text-sm font-medium text-muted">Autore</p>
            <div role="group" aria-label="Autore" className="flex flex-col gap-2">
              <GenreRow label="Tutti gli autori" count={count(state)} on={author === ''} onPick={() => { setAuthor(''); setOpen(false); }} />
              {authorList.map(([a, c]) => <GenreRow key={a} label={a} count={c} on={norm(author) === norm(a)} onPick={() => { setAuthor(a); setOpen(false); }} />)}
            </div>
          </>
        )}
        <button type="button" disabled={!active} onClick={() => { setState('all'); setGenre(''); setSeries(''); setLanguage(''); setPublisher(''); setAuthor(''); setIncomplete(false); setMinRating(0); setQuery(''); setOrder(DEFAULT_ORDER); setOpen(false); }} className="mt-4 min-h-11 w-full rounded-xl bg-lilac-soft font-medium text-title disabled:opacity-50">Azzera tutto</button>
      </Sheet>
    </section>
  );
}

function GenreRow({ label, count, on, onPick }: { label: string; count: number; on: boolean; onPick(): void }) {
  return (
    <button type="button" aria-pressed={on} onClick={onPick} className={cn('flex min-h-12 items-center justify-between rounded-xl px-4 text-left', on ? 'bg-plum text-white' : 'bg-lilac-soft text-title')}>
      <span className="min-w-0 font-medium [overflow-wrap:anywhere]">{label}</span><span className={cn('ml-3 shrink-0 text-sm', on ? 'text-white/80' : 'text-muted')}>{count}</span>
    </button>
  );
}
