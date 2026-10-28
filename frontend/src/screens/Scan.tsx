import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { looksLikeIsbn } from '../lib/isbn';
import type { Book } from '../lib/types';
import { useBooks } from '../state/books';
import { useScanner } from '../hooks/useScanner';
import { Button, Cover, Input, Msg } from '../components/ui';
import { cn } from '../lib/cn';

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
      const status = (e as { status?: number }).status;
      if (status !== 404) { setVerdict(null); say((e as Error).message, true); return; }
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
      say(found.length === 1 ? 'Ce l’hai già' : `${found.length} libri trovati`);
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
  return (
    <section>
      <video ref={scanner.videoRef} playsInline muted hidden={!scanner.active} className="mb-2.5 block aspect-[4/3] max-h-[32vh] w-full rounded-lg bg-black object-cover" />
      <Button className="w-full" onClick={() => void scanner.start()}>Apri la fotocamera</Button>
      <Msg text={msg} error={err} />
      {verdict && book && (
        <article className={cn('flex flex-col items-center rounded-lg p-4 text-center text-white', verdict.yes ? 'bg-ok' : 'bg-ko')}>
          <h2 className="mb-2 text-3xl font-bold text-white">{verdict.text}</h2>
          {verdict.yes && book.cover && <Cover book={book} className="max-h-32" />}
          <p>{book.title}</p>
          <p>{(book.authors || []).join(', ')}</p>
          {!verdict.yes && book.isbn && <Button variant="soft" className="mt-2.5 w-full" disabled={saving} onClick={() => void add()}>Aggiungi alla libreria</Button>}
          {verdict.yes && book.isbn && <Button variant="soft" className="mt-2.5 w-full" onClick={() => nav(`/libro/${book.isbn}`)}>Apri scheda</Button>}
        </article>
      )}
      <form onSubmit={submit}>
        <label className="my-2.5 block">ISBN, titolo o autore
          <Input value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" placeholder="978… oppure titolo" />
        </label>
        <Button type="submit">Controlla</Button>
      </form>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0 py-2">
        {results.map((b) => (
          <li key={b.isbn}><Button className="w-full py-2 text-left" onClick={() => show(true, b)}>{[b.title || 'Senza titolo', (b.authors || []).join(', ')].filter(Boolean).join(' — ')}</Button></li>
        ))}
      </ul>
      <Link to="/scansiona/manuale" state={{ query }} className="mt-2.5 flex min-h-11 w-full items-center justify-center rounded-lg bg-plum-2 text-white">Non lo trovo: aggiungilo a mano</Link>
    </section>
  );
}
