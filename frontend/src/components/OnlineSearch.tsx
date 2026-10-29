import { Search } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api';
import type { Candidate } from '../lib/types';
import { Sheet } from './Sheet';
import { Button, Msg } from './ui';

const SOURCES: Record<string, string> = { openlibrary: 'Open Library', sbn: 'SBN' };

// Riempie solo i campi vuoti del modulo con quelli del candidato; ritorna il nuovo modulo e le chiavi riempite.
export function fillEmpty(form: Record<string, string>, c: Candidate, keys: string[]): { form: Record<string, string>; filled: string[] } {
  const next = { ...form };
  const filled: string[] = [];
  const cand: Record<string, string> = { isbn: c.isbn, authors: c.authors.join(', '), publisher: c.publisher, year: c.year, pages: c.pages, language: c.language };
  for (const k of keys) {
    if (!(form[k] || '').trim() && cand[k]) { next[k] = cand[k]; filled.push(k); }
  }
  return { form: next, filled };
}

// Pulsante «Cerca online i dati mancanti» e foglio con i candidati. Non salva nulla: passa la scelta a `onPick`.
export function OnlineSearch({ title, author, onPick, className }: { title: string; author: string; onPick(c: Candidate): void; className?: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<Candidate[] | null>(null);
  const [err, setErr] = useState('');

  async function search() {
    if (busy || !title.trim()) return;
    setBusy(true);
    setErr('');
    setFound(null);
    setOpen(true);
    try {
      const q = new URLSearchParams({ title: title.trim(), author: author.trim() });
      setFound((await api<{ candidates: Candidate[] }>('GET', `/api/search?${q}`)).candidates);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function choose(c: Candidate) {
    setOpen(false);
    onPick(c);
  }

  return (
    <>
      <Button variant="ghost" className={className} disabled={busy || !title.trim()} onClick={() => void search()}><Search aria-hidden className="size-5" />Cerca online i dati mancanti</Button>
      <Sheet open={open} onOpenChange={setOpen} title="Risultati online">
        {busy && <Msg text="Cerco…" />}
        {err && <Msg error text={err} />}
        {found && !found.length && <Msg text="Nessun risultato: i dati restano vuoti." />}
        {found && found.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {found.map((c, i) => (
              <li key={`${c.isbn}${i}`}>
                <button type="button" onClick={() => choose(c)} className="block min-h-11 w-full rounded-xl bg-lilac-soft px-3 py-2 text-left text-plum">
                  <span className="block font-semibold [overflow-wrap:anywhere]">{c.title}</span>
                  <span className="block text-sm [overflow-wrap:anywhere]">{[c.authors.join(', '), c.publisher, c.year].filter(Boolean).join(' · ') || 'Dati non disponibili'}</span>
                  <span className="block text-xs text-muted">{SOURCES[c.source] || c.source}{c.isbn ? ` · ISBN ${c.isbn}` : ''}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </>
  );
}
