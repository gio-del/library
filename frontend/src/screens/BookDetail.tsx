import { Pencil, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, putCover, toJpeg } from '../lib/api';
import { GENRES, MAX_GENRES, UNCLASSIFIED, bookGenres, bookTitle, hasIsbn, needsRetry, ratingOf, todayIso } from '../lib/books';
import { isbn10Of } from '../lib/isbn';
import type { Book, Candidate } from '../lib/types';
import { useBooks } from '../state/books';
import { useLock } from '../hooks/useLock';
import { useAuth } from '../state/auth';
import { fillFromRead, READ_LABELS, type CoverRead } from '../lib/coverRead';
import { ReadPhotoButton } from '../components/ReadPhotoButton';
import { CoverPicker } from '../components/CoverPicker';
import { Stars } from '../components/Stars';
import { CoverViewer } from '../components/CoverViewer';
import { Confirm } from '../components/Confirm';
import { SubPage } from '../components/SubPage';
import { useToast } from '../components/Toast';
import { OnlineSearch, fillEmpty } from '../components/OnlineSearch';
import { Badge, Button, Field, Input, Msg, Textarea } from '../components/ui';

const SOURCES: Record<string, string> = { openlibrary: 'Open Library', sbn: 'SBN', amazon: 'Amazon' };
const EDIT = ['title', 'edition', 'publisher', 'year', 'series', 'pages', 'language', 'notes'] as const;
const LABELS: Record<(typeof EDIT)[number], string> = { title: 'Titolo', edition: 'Edizione', publisher: 'Editore', year: 'Anno', series: 'Collana', pages: 'Pagine', language: 'Lingua', notes: 'Note' };
const lab = (cat: string[], k: string, label: string) => (cat.includes(k) ? `${label} · da catalogo` : label);
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
  const { toast } = useToast();
  const { books, loaded, load, upsert, remove } = useBooks();
  const book = books.find((b) => b.isbn === isbn);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string[]>([]);
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [cat, setCat] = useState<string[]>([]);
  const [coverV, setCoverV] = useState(0);
  const [askDelete, setAskDelete] = useState(false);
  const lock = useLock();
  const { coverRead } = useAuth();
  const [fromPhoto, setFromPhoto] = useState<string[]>([]);

  useEffect(() => { if (!loaded) load().catch(() => {}); }, [loaded, load]);
  useEffect(() => { if (loc.state?.note) toast(loc.state.note); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!book) return <SubPage title="Libro" fallback="/libreria"><Msg text={loaded ? 'Libro non trovato' : 'Carico…'} /></SubPage>;

  async function patch(body: unknown, done: string): Promise<boolean | undefined> {
    return lock('patch', async () => {
      setBusy(true);
      try {
        upsert((await api<{ book: Book }>('PATCH', `/api/books/${isbn}`, body)).book);
        if (done) toast(done);
        return true;
      } catch (e) { toast((e as Error).message, true); return false; } finally { setBusy(false); }
    });
  }

  function startEdit() {
    const f: Record<string, string> = { authors: (book!.authors || []).join(', ') };
    setPicked(bookGenres(book!).filter((g) => g !== UNCLASSIFIED));
    for (const k of EDIT) f[k] = String(book![k] ?? '');
    setForm(f);
    setFormErr('');
    setFromPhoto([]);
    setCat([]);
    setEditing(true);
  }

  async function save(ev: FormEvent) {
    ev.preventDefault();
    if (!form.title.trim()) { setFormErr('Il titolo non può essere vuoto'); return; }
    const body: Record<string, unknown> = { authors: list(form.authors) };
    if (picked.join('|') !== bookGenres(book!).filter((g) => g !== UNCLASSIFIED).join('|')) body.genres = picked;
    for (const k of EDIT) body[k] = form[k];
    if (await patch(body, 'Salvato')) setEditing(false);
  }

  async function fromCatalog(c: Candidate) {
    const r = fillEmpty(form, c, ['authors', 'publisher', 'year', 'pages', 'language']);
    setForm(r.form);
    const filled = [...r.filled];
    if (c.isbn && !picked.length) {
      try {
        const g = (await api<{ genres?: string[] }>('GET', `/api/lookup/${c.isbn}`)).genres;
        const ok = (g || []).filter((x) => x !== UNCLASSIFIED).slice(0, MAX_GENRES);
        if (ok.length) { setPicked(ok); filled.push('genres'); }
      } catch { /* i generi restano vuoti */ }
    }
    setCat((x) => [...new Set([...x, ...filled])]);
  }

  async function changeCover(file: Blob) {
    await lock('cover', async () => {
      toast('Carico la copertina…');
      try {
        upsert((await putCover<{ book: Book }>(isbn, await toJpeg(file))).book);
        setCoverV(Date.now());
        toast('Copertina cambiata');
      } catch (e) { toast((e as Error).message, true); }
    });
  }

  async function again() {
    await lock('again', async () => {
      toast('Cerco…');
      try {
        const r = await api<{ book: Book }>('POST', `/api/books/${isbn}/lookup`);
        upsert(r.book);
        toast(r.book.lookup === 'failed' ? 'Dati ancora non trovati' : r.book.cover ? 'Trovato' : 'Copertina ancora non trovata');
      } catch (e) { toast((e as Error).message, true); }
    });
  }

  async function del() {
    await lock('delete', async () => {
      try { await api('DELETE', `/api/books/${isbn}`); remove(isbn); nav('/libreria', { replace: true }); toast('Libro eliminato'); } catch (e) { toast((e as Error).message, true); }
    });
  }

  function applyRead(r: CoverRead): string {
    const { form: next, filled } = fillFromRead(form, r);
    setForm(next);
    setFromPhoto([...new Set([...fromPhoto, ...filled])]);
    return filled.length ? `Compilati dalla foto: ${filled.map((k) => READ_LABELS[k].toLowerCase()).join(', ')}. Controlla e premi «Salva».` : 'Niente da compilare: i campi sono già pieni o la foto non dice altro.';
  }
  const mark = (k: string) => (fromPhoto.includes(k) ? ' (dalla foto)' : '');
  const photo = async () => {
    const res = await fetch(`/covers/${book!.cover}`);
    if (!res.ok) throw new Error('Non riesco a leggere la copertina');
    return res.blob();
  };

  if (editing) {
    return (
      <SubPage title="Modifica" fallback="/libreria">
        <form onSubmit={(e) => void save(e)}>
          <Field label={`Titolo${mark('title')}`} error={formErr}><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label={`${lab(cat, 'authors', 'Autori (separati da virgola)')}${mark('authors')}`}><Input value={form.authors} onChange={(e) => { setForm({ ...form, authors: e.target.value }); setCat(cat.filter((x) => x !== 'authors')); setFromPhoto(fromPhoto.filter((x) => x !== 'authors')); }} /></Field>
          <OnlineSearch className="my-2 w-full" title={form.title} author={form.authors} onPick={(c) => void fromCatalog(c)} />
          <fieldset className="mt-4 min-w-0 border-0 p-0">
            <legend className="mb-1 text-sm font-medium text-muted">{lab(cat, 'genres', `Generi (fino a ${MAX_GENRES})`)}</legend>
            <div className="flex flex-wrap gap-2">
              {[...GENRES, ...picked.filter((g) => !GENRES.includes(g))].map((g) => {
                const on = picked.includes(g);
                return (
                  <label key={g} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-4 text-sm font-medium ${on ? 'bg-gold text-plum' : 'bg-lilac-soft text-plum'}`}>
                    <input type="checkbox" className="size-4" checked={on} disabled={!on && picked.length >= MAX_GENRES} onChange={() => setPicked(on ? picked.filter((x) => x !== g) : [...picked, g])} />
                    {g}
                  </label>
                );
              })}
            </div>
          </fieldset>
          {EDIT.filter((k) => k !== 'title' && k !== 'notes').map((k) => (
            <Field key={k} label={`${lab(cat, k, LABELS[k])}${mark(k)}`}><Input value={form[k]} inputMode={k === 'year' || k === 'pages' ? 'numeric' : undefined} onChange={(e) => { setForm({ ...form, [k]: e.target.value }); setCat(cat.filter((x) => x !== k)); setFromPhoto(fromPhoto.filter((x) => x !== k)); }} /></Field>
          ))}
          <Field label="Note"><Textarea rows={3} maxLength={1000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          {coverRead && book.cover && <div className="mt-4"><ReadPhotoButton getPhoto={photo} onRead={applyRead} disabled={busy} /></div>}
          <div className="mt-4 flex flex-col gap-2">
            <Button type="submit" disabled={busy}>Salva</Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>Annulla</Button>
          </div>
        </form>
      </SubPage>
    );
  }

  const tool = 'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl bg-lilac-soft px-2 text-sm font-medium text-plum';
  return (
    <SubPage title={bookTitle(book)} fallback="/libreria">
      <div className="flex flex-col gap-3">
        {book.cover && <CoverViewer src={`/covers/${book.cover}${coverV ? `?v=${coverV}` : ''}`} title={bookTitle(book)} className="mx-auto max-h-96 max-w-full rounded-lg shadow" />}
        <h2 className="m-0 text-xl font-bold text-plum [overflow-wrap:anywhere]">{book.title || 'Titolo sconosciuto'}</h2>
        <span className="self-start"><Badge read={book.read} /></span>
        <Button disabled={busy} onClick={() => void patch(book.read ? { read: false } : { read: true, ...(book.readAt ? {} : { readAt: todayIso() }) }, '')} aria-pressed={!!book.read}>{book.read ? 'Segna come da leggere' : 'Segna come letto'}</Button>
        {book.read && (
          <div className="flex flex-col gap-2 rounded-xl bg-paper p-4 shadow-sm">
            <Stars value={ratingOf(book)} disabled={busy} onChange={(v) => void patch({ rating: v || null }, '')} />
            <label className="text-sm font-medium text-plum" htmlFor="read-at">Finito di leggere il</label>
            <Input id="read-at" type="date" max={todayIso()} disabled={busy} value={book.readAt || ''} onChange={(e) => void patch({ readAt: e.target.value || null }, '')} />
          </div>
        )}
        {needsRetry(book) && <Button variant="ghost" onClick={() => void again()}>Cerca di nuovo i dati</Button>}
        <CoverPicker onPick={(f) => void changeCover(f)} />
        <div className="flex gap-2">
          <button type="button" className={tool} onClick={startEdit}><Pencil aria-hidden className="size-5" />Modifica</button>
          <button type="button" className={`${tool} !bg-ko/10 text-ko`} onClick={() => setAskDelete(true)}><Trash2 aria-hidden className="size-5" />Elimina</button>
        </div>
        <dl className="m-0 rounded-xl bg-paper p-4 shadow-sm">
          {rows(book).map(([k, v]) => <div key={k} className="py-1.5"><dt className="text-sm text-muted">{k}</dt><dd className="m-0 [overflow-wrap:anywhere]">{v}</dd></div>)}
        </dl>
      </div>
      <Confirm open={askDelete} onOpenChange={setAskDelete} title="Eliminare il libro?" action="Elimina" danger onConfirm={() => void del()}>«{bookTitle(book)}» sparirà dalla libreria.</Confirm>
    </SubPage>
  );
}
