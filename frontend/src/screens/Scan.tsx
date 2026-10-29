import { Camera, CircleCheck, CircleX, Search } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { looksLikeIsbn } from '../lib/isbn';
import { cn } from '../lib/cn';
import type { Book } from '../lib/types';
import { useBooks } from '../state/books';
import { useScanner } from '../hooks/useScanner';
import { Button, Cover, Input, Msg } from '../components/ui';

interface Verdict { yes: boolean; book: Partial<Book>; text: string }

const buzz = (p: number | number[]) => { if (navigator.vibrate) navigator.vibrate(p); };

export function Scan() {
  const nav = useNavigate();
  const { upsert } = useBooks();
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [results, setResults] = useState<Book[]>([]);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const seq = useRef(0);
  const say = (t: string, e = false) => { setMsg(t); setErr(e); };

  const show = (yes: boolean, book: Partial<Book>) =>
    setVerdict({ yes, book, text: yes ? 'Ce l’hai già' : book.isbn ? 'Non ce l’hai: lo aggiungo?' : 'Non ce l’hai' });

  async function checkIsbn(isbn: string) {
    const my = ++seq.current;
    setResults([]);
    say('Controllo…');
    try {
      const book = await api<Book>('GET', `/api/books/${encodeURIComponent(isbn)}`);
      if (my !== seq.current) return;
      say('');
      show(true, book);
      buzz(200);
    } catch (e) {
      if (my !== seq.current) return;
      if ((e as { status?: number }).status !== 404) { setVerdict(null); say((e as Error).message, true); return; }
      say('');
      const norm = isbn.replace(/[\s-]/g, '');
      show(false, { isbn: norm });
      buzz([80, 60, 80]);
      api<Partial<Book>>('GET', `/api/lookup/${encodeURIComponent(norm)}`).then((f) => { if (my === seq.current && f.title) show(false, f); }).catch(() => {});
    }
  }

  // Ricerca per titolo o autore tra i libri già in libreria.
  async function searchText(q: string) {
    const my = ++seq.current;
    setVerdict(null);
    say('Cerco…');
    try {
      const found = await api<Book[]>('GET', `/api/books?q=${encodeURIComponent(q)}`);
      if (my !== seq.current) return;
      if (!found.length) { setVerdict({ yes: false, book: {}, text: 'Non ce l’hai' }); say(''); return; }
      say(found.length === 1 ? '' : `${found.length} libri trovati`);
      setResults(found.slice(0, 20));
      if (found.length === 1) show(true, found[0]);
    } catch (e) { if (my === seq.current) say((e as Error).message, true); }
  }

  const scanner = useScanner((isbn) => void checkIsbn(isbn), (m) => say(m, true));

  function submit(e: FormEvent) {
    e.preventDefault();
    const v = query.trim();
    if (!v) return;
    setResults([]);
    if (looksLikeIsbn(v)) void checkIsbn(v); else void searchText(v);
  }

  async function add() {
    if (saving || !verdict?.book.isbn) return;
    setSaving(true);
    try {
      const r = await api<{ book: Book; status: string }>('POST', '/api/books', { isbn: verdict.book.isbn });
      upsert(r.book);
      setVerdict({ yes: true, book: r.book, text: r.status === 'saved' ? 'Aggiunto alla libreria' : 'Ce l’hai già' });
      say('');
    } catch (e) { say((e as Error).message, true); }
    setSaving(false);
  }

  const book = verdict?.book;
  const Icon = verdict?.yes ? CircleCheck : CircleX;
  return (
    <section className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-2xl bg-paper shadow-sm">
        <video ref={scanner.videoRef} playsInline muted hidden={!scanner.active} className="block aspect-[4/3] max-h-[32dvh] w-full bg-black object-cover" />
        {!scanner.active && <p className="flex items-center justify-center gap-2 bg-lilac-soft py-6 text-plum"><Camera aria-hidden className="size-8" />Inquadra il codice a barre</p>}
        <div className="p-3">
          {scanner.active
            ? <Button key="close" variant="ghost" className="w-full" onClick={scanner.stop}>Chiudi la fotocamera</Button>
            : <Button key="open" className="w-full" onClick={() => void scanner.start()}>Apri la fotocamera</Button>}
        </div>
      </div>
      <Msg text={msg} error={err} />

      {verdict && book && (
        <article aria-live="polite" className={cn('rounded-2xl p-4 text-white shadow', verdict.yes ? 'bg-ok' : 'bg-ko')}>
          <h2 className="m-0 flex items-center gap-2 text-2xl font-bold"><Icon aria-hidden className="size-7 shrink-0" />{verdict.text}</h2>
          {(book.title || (book.authors || []).length > 0 || (verdict.yes && book.cover)) && (
            <div className="mt-3 flex items-center gap-3">
              {verdict.yes && book.cover && <Cover book={book} className="w-16 shrink-0" />}
              <div className="min-w-0 [overflow-wrap:anywhere]">
                <p className="m-0 font-semibold">{book.title}</p>
                <p className="m-0 text-white/90">{(book.authors || []).join(', ')}</p>
              </div>
            </div>
          )}
          {!verdict.yes && book.isbn && <Button variant="soft" className="mt-3 w-full" disabled={saving} onClick={() => void add()}>Aggiungi alla libreria</Button>}
          {verdict.yes && book.isbn && <Button variant="soft" className="mt-3 w-full" onClick={() => nav(`/libro/${book.isbn}`)}>Apri scheda</Button>}
        </article>
      )}

      <form onSubmit={submit} className="flex gap-2">
        <label className="relative flex-1">
          <span className="sr-only">ISBN, titolo o autore</span>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" placeholder="ISBN, titolo o autore" className="pl-10" />
        </label>
        <Button type="submit" className="h-12">Controlla</Button>
      </form>
      {results.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {results.map((b) => (
            <li key={b.isbn}><Button variant="ghost" className="w-full justify-start py-2 text-left" onClick={() => show(true, b)}>{[b.title || 'Senza titolo', (b.authors || []).join(', ')].filter(Boolean).join(' — ')}</Button></li>
          ))}
        </ul>
      )}
      <Link to="/scansiona/manuale" state={{ query }} className="flex min-h-11 items-center justify-center text-plum underline underline-offset-4">Non lo trovo: aggiungilo a mano</Link>
    </section>
  );
}
