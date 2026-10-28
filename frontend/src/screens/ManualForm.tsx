import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, putCover, toJpeg } from '../lib/api';
import { looksLikeIsbn } from '../lib/isbn';
import type { Book } from '../lib/types';
import { useBooks } from '../state/books';
import { Confirm } from '../components/Confirm';
import { SubPage } from '../components/SubPage';
import { Button, Field, Input, Textarea } from '../components/ui';

const FIELDS: [string, string, boolean?][] = [['publisher', 'Editore'], ['year', 'Anno', true], ['edition', 'Edizione'], ['language', 'Lingua'], ['pages', 'Pagine', true]];

export function ManualForm() {
  const nav = useNavigate();
  const { state } = useLocation() as { state: { query?: string } | null };
  const { upsert } = useBooks();
  const t = (state?.query || '').trim();
  const [f, setF] = useState<Record<string, string>>({ title: looksLikeIsbn(t) ? '' : t, isbn: looksLikeIsbn(t) ? t : '', authors: '', publisher: '', year: '', edition: '', language: '', pages: '', notes: '' });
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState('');
  const [titleErr, setTitleErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [dup, setDup] = useState('');
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function send(force: boolean) {
    if (busy) return;
    setBusy(true);
    setErr('');
    const body = { manual: true, ...f, authors: f.authors.split(',').map((x) => x.trim()).filter(Boolean), ...(force ? { force: true } : {}) };
    try {
      const r = await api<{ book: Book; status: string }>('POST', '/api/books', body);
      let book = r.book;
      let note = r.status === 'saved' ? 'Salvato' : 'Già in libreria';
      if (file && r.status === 'saved') {
        try { book = (await putCover<{ book: Book }>(book.isbn, await toJpeg(file))).book; } catch (e) { note = `Salvato, ma la copertina no: ${(e as Error).message}`; }
      }
      upsert(book);
      nav(`/libro/${book.isbn}`, { replace: true, state: { note } });
    } catch (e) {
      if ((e as { status?: number }).status === 409) setDup((e as Error).message); else setErr((e as Error).message);
      setBusy(false);
    }
  }

  function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!f.title.trim()) { setTitleErr('Il titolo è obbligatorio'); return; }
    setTitleErr('');
    void send(false);
  }

  return (
    <SubPage title="Aggiungi a mano" fallback="/scansiona">
      <form onSubmit={submit} noValidate>
        <Field label="Titolo (obbligatorio)" error={titleErr}><Input value={f.title} onChange={set('title')} maxLength={300} /></Field>
        <Field label="Autori (separati da virgola)"><Input value={f.authors} onChange={set('authors')} /></Field>
        {FIELDS.map(([k, label, num]) => <Field key={k} label={label}><Input value={f[k]} onChange={set(k)} inputMode={num ? 'numeric' : undefined} /></Field>)}
        <Field label="ISBN (se c’è)"><Input value={f.isbn} onChange={set('isbn')} inputMode="numeric" autoComplete="off" /></Field>
        <Field label="Note"><Textarea rows={3} maxLength={1000} value={f.notes} onChange={set('notes')} /></Field>
        <label className="my-3 flex min-h-12 cursor-pointer items-center justify-center rounded-xl bg-lilac-soft px-3 text-center font-medium text-plum">
          {file ? file.name : 'Aggiungi la copertina (foto o immagine)'}
          <input type="file" accept="image/*" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        {err && <p role="alert" className="text-ko">{err}</p>}
        <div className="mt-4 flex flex-col gap-2">
          <Button type="submit" disabled={busy}>Salva</Button>
          <Button variant="ghost" onClick={() => nav('/scansiona')}>Annulla</Button>
        </div>
      </form>
      <Confirm open={dup !== ''} onOpenChange={(o) => !o && setDup('')} title="Aggiungerlo comunque?" action="Aggiungi comunque" onConfirm={() => void send(true)}>{dup}</Confirm>
    </SubPage>
  );
}
