import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, putCover, toJpeg } from '../lib/api';
import { looksLikeIsbn } from '../lib/isbn';
import type { Book } from '../lib/types';
import { useBooks } from '../state/books';
import { Button, Field, Input, Msg, Textarea } from '../components/ui';

const FIELDS: [string, string, boolean?][] = [['publisher', 'Editore'], ['year', 'Anno', true], ['edition', 'Edizione'], ['language', 'Lingua'], ['pages', 'Pagine', true]];

export function ManualForm() {
  const nav = useNavigate();
  const { state } = useLocation() as { state: { query?: string } | null };
  const { upsert } = useBooks();
  const t = (state?.query || '').trim();
  const [f, setF] = useState<Record<string, string>>({ title: looksLikeIsbn(t) ? '' : t, isbn: looksLikeIsbn(t) ? t : '', authors: '', publisher: '', year: '', edition: '', language: '', pages: '', notes: '' });
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    const body = { manual: true, ...f, authors: f.authors.split(',').map((x) => x.trim()).filter(Boolean) };
    try {
      let r: { book: Book; status: string };
      try { r = await api('POST', '/api/books', body); } catch (e) {
        if ((e as { status?: number }).status !== 409) throw e;
        if (!confirm(`${(e as Error).message}. Aggiungerlo comunque?`)) { setMsg((e as Error).message); setBusy(false); return; }
        r = await api('POST', '/api/books', { ...body, force: true });
      }
      let book = r.book;
      let note = r.status === 'saved' ? 'Salvato' : 'Già in libreria';
      if (file && r.status === 'saved') {
        try { book = (await putCover<{ book: Book }>(book.isbn, await toJpeg(file))).book; } catch (e) { note = `Salvato, ma la copertina no: ${(e as Error).message}`; }
      }
      upsert(book);
      nav(`/libro/${book.isbn}`, { state: { note } });
    } catch (e) { setMsg((e as Error).message); setBusy(false); }
  }

  return (
    <section>
      <h2 className="text-xl font-bold text-plum">Aggiungi a mano</h2>
      <form onSubmit={(e) => void submit(e)}>
        <Field label="Titolo (obbligatorio)"><Input value={f.title} onChange={set('title')} required maxLength={300} /></Field>
        <Field label="Autori (separati da virgola)"><Input value={f.authors} onChange={set('authors')} /></Field>
        {FIELDS.map(([k, label, num]) => <Field key={k} label={label}><Input value={f[k]} onChange={set(k)} inputMode={num ? 'numeric' : undefined} /></Field>)}
        <Field label="ISBN (se c’è)"><Input value={f.isbn} onChange={set('isbn')} inputMode="numeric" autoComplete="off" /></Field>
        <Field label="Note"><Textarea rows={3} maxLength={1000} value={f.notes} onChange={set('notes')} /></Field>
        <label className="flex min-h-11 items-center justify-center rounded-lg bg-blue text-white">
          Copertina (foto o immagine)
          <input type="file" accept="image/*" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <p>{file?.name}</p>
        <div className="flex flex-col gap-2">
          <Button type="submit" disabled={busy}>Salva</Button>
          <Button variant="secondary" onClick={() => nav('/scansiona')}>Annulla</Button>
        </div>
      </form>
      <Msg text={msg} error />
    </section>
  );
}
