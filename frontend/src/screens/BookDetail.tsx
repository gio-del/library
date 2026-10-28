import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, putCover, toJpeg } from '../lib/api';
import { bookGenres, bookTitle, hasIsbn, needsRetry } from '../lib/books';
import { isbn10Of } from '../lib/isbn';
import type { Book } from '../lib/types';
import { useBooks } from '../state/books';
import { useLock } from '../hooks/useLock';
import { Badge, Button, Field, Input, Msg, Textarea } from '../components/ui';

const SOURCES: Record<string, string> = { openlibrary: 'Open Library', sbn: 'SBN', amazon: 'Amazon' };
const EDIT = ['title', 'edition', 'publisher', 'year', 'series', 'pages', 'language', 'notes'] as const;
const LABELS: Record<(typeof EDIT)[number], string> = { title: 'Titolo', edition: 'Edizione', publisher: 'Editore', year: 'Anno', series: 'Collana', pages: 'Pagine', language: 'Lingua', notes: 'Note' };
const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

function rows(b: Book): [string, string][] {
  const added = b.added && !Number.isNaN(Date.parse(b.added)) ? new Date(b.added).toLocaleDateString('it-IT') : '';
  const all: [string, unknown][] = [
    ['Autori', (b.authors || []).join(', ')], ['Edizione', b.edition], ['Editore', b.publisher], ['Anno', b.year],
    ['Generi', bookGenres(b).join(', ')], ['Collana', b.series], ['Pagine', b.pages], ['Lingua', b.language],
    ['Note', b.notes], ['ISBN-13', hasIsbn(b) ? b.isbn : ''], ['ISBN-10', isbn10Of(b.isbn)],
    ['Fonte dei dati', b.source && (SOURCES[b.source] || b.source)], ['Aggiunto il', added],
  ];
  return all.filter(([, v]) => v).map(([k, v]) => [k, String(v)]);
}

export function BookDetail() {
  const { isbn = '' } = useParams();
  const nav = useNavigate();
  const loc = useLocation() as { state: { note?: string } | null };
  const { books, loaded, load, upsert, remove } = useBooks();
  const book = books.find((b) => b.isbn === isbn);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState(loc.state?.note ?? '');
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [coverV, setCoverV] = useState(0);
  const say = (t: string, e = false) => { setMsg(t); setErr(e); };
  const lock = useLock();

  useEffect(() => { if (!loaded) load().catch(() => {}); }, [loaded, load]);

  if (!book) return <section><Link to="/libreria">← Torna all’elenco</Link><Msg text={loaded ? 'Libro non trovato' : 'Carico…'} /></section>;

  async function patch(body: unknown, done: string) {
    return lock('patch', async () => {
      setBusy(true);
      try {
        const r = await api<{ book: Book }>('PATCH', `/api/books/${isbn}`, body);
        upsert(r.book);
        say(done);
        return true;
      } catch (e) { say((e as Error).message, true); return false; } finally { setBusy(false); }
    });
  }

  function startEdit() {
    const f: Record<string, string> = { authors: (book!.authors || []).join(', '), genres: (book!.genres || []).join(', ') };
    for (const k of EDIT) f[k] = String(book![k] ?? '');
    setForm(f);
    setEditing(true);
  }

  async function save(ev: FormEvent) {
    ev.preventDefault();
    const body: Record<string, unknown> = { authors: list(form.authors) };
    const genres = list(form.genres);
    if (genres.join('|') !== (book!.genres || []).join('|')) body.genres = genres;
    for (const k of EDIT) body[k] = form[k];
    if (await patch(body, 'Salvato')) setEditing(false);
  }

  async function changeCover(file?: File) {
    if (!file) return;
    say('Carico la copertina…');
    try {
      const r = await putCover<{ book: Book }>(isbn, await toJpeg(file));
      upsert(r.book);
      setCoverV(Date.now());
      say('Copertina cambiata');
    } catch (e) { say((e as Error).message, true); }
  }

  async function again() {
    setBusy(true);
    say('Cerco…');
    try {
      const r = await api<{ book: Book }>('POST', `/api/books/${isbn}/lookup`);
      upsert(r.book);
      say(r.book.lookup === 'failed' ? 'Dati ancora non trovati' : r.book.cover ? 'Trovato' : 'Copertina ancora non trovata');
    } catch (e) { say((e as Error).message, true); }
    setBusy(false);
  }

  async function del() {
    if (!confirm(`Eliminare «${bookTitle(book!)}»?`)) return;
    try { await api('DELETE', `/api/books/${isbn}`); remove(isbn); nav('/libreria'); } catch (e) { say((e as Error).message, true); }
  }

  return (
    <section className="flex flex-col gap-2.5">
      <Link to="/libreria" className="flex min-h-11 items-center">← Torna all’elenco</Link>
      {book.cover && <img src={`/covers/${book.cover}${coverV ? `?v=${coverV}` : ''}`} alt="" className="max-h-96 max-w-full self-center rounded" />}
      <h2 className="m-0 text-xl font-bold text-plum [overflow-wrap:anywhere]">{book.title || 'Titolo sconosciuto'}</h2>
      <span className="self-start"><Badge read={book.read} /></span>
      <dl className="m-0">
        {rows(book).map(([k, v]) => <div key={k}><dt className="mt-2 text-sm text-muted">{k}</dt><dd className="m-0 [overflow-wrap:anywhere]">{v}</dd></div>)}
      </dl>
      <Msg text={msg} error={err} />
      {editing ? (
        <form onSubmit={(e) => void save(e)}>
          <Field label="Titolo"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Autori (separati da virgola)"><Input value={form.authors} onChange={(e) => setForm({ ...form, authors: e.target.value })} /></Field>
          <Field label="Generi (separati da virgola)"><Input value={form.genres} onChange={(e) => setForm({ ...form, genres: e.target.value })} /></Field>
          {EDIT.filter((k) => k !== 'title' && k !== 'notes').map((k) => (
            <Field key={k} label={LABELS[k]}><Input value={form[k]} inputMode={k === 'year' || k === 'pages' ? 'numeric' : undefined} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></Field>
          ))}
          <Field label="Note"><Textarea rows={3} maxLength={1000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <div className="flex flex-col gap-2">
            <Button type="submit" disabled={busy}>Salva</Button>
            <Button variant="secondary" onClick={() => setEditing(false)}>Annulla</Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-2">
          <Button disabled={busy} onClick={() => void patch({ read: !book.read }, '')}>{book.read ? 'Segna come da leggere' : 'Segna come letto'}</Button>
          {needsRetry(book) && <Button variant="secondary" disabled={busy} onClick={() => void again()}>Cerca di nuovo</Button>}
          <Button variant="secondary" onClick={startEdit}>Modifica</Button>
          <label className="flex min-h-11 items-center justify-center rounded-lg bg-blue text-white">
            Cambia copertina
            <input type="file" accept="image/*" hidden onChange={(e) => { void changeCover(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          <Button variant="danger" onClick={() => void del()}>Elimina</Button>
        </div>
      )}
    </section>
  );
}
