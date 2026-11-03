import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { needsRetry } from '../lib/books';
import type { Book } from '../lib/types';
import { useBooks } from '../state/books';

export interface RetryResult { book: Book; sources?: Record<string, string> }

/** Cerca di nuovo i dati di un libro già in libreria: il server riempie solo i campi ancora vuoti. */
export const retryLookup = (isbn: string) => api<RetryResult>('POST', `/api/books/${isbn}/lookup`);

/** Pausa fissa tra una richiesta e l'altra, per non esaurire la quota delle fonti (i test la accorciano). */
export const pacing = { ms: 1500 };

export interface Summary { completed: number; incomplete: number; unreached: number }
export type Phase = 'idle' | 'running' | 'done';

export function useCompleteMissing() {
  const { books, upsert } = useBooks();
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [summary, setSummary] = useState<Summary>({ completed: 0, incomplete: 0, unreached: 0 });
  const [stopped, setStopped] = useState(false);
  const stop = useRef(false);
  const wake = useRef<(() => void) | null>(null);
  const running = useRef(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; stop.current = true; wake.current?.(); }, []);

  const pending = books.filter(needsRetry).length;

  const halt = useCallback(() => { stop.current = true; wake.current?.(); }, []);
  const reset = useCallback(() => { if (!running.current) setPhase('idle'); }, []);

  const start = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    stop.current = false;
    const list = books.filter(needsRetry).map((b) => b.isbn);
    const sum: Summary = { completed: 0, incomplete: 0, unreached: 0 };
    setSummary({ ...sum });
    setStopped(false);
    setProgress({ done: 0, total: list.length });
    setPhase('running');
    let done = 0;
    for (const isbn of list) {
      if (stop.current) break;
      try {
        const r = await retryLookup(isbn);
        upsert(r.book);
        if (r.book.lookup !== 'failed' && r.book.cover) sum.completed++;
        else {
          sum.incomplete++;
          if (Object.values(r.sources || {}).includes('error')) sum.unreached++;
        }
      } catch { sum.incomplete++; sum.unreached++; }
      done++;
      if (!alive.current) break;
      setProgress({ done, total: list.length });
      setSummary({ ...sum });
      if (done < list.length && !stop.current) await new Promise<void>((res) => { wake.current = res; setTimeout(res, pacing.ms); });
      wake.current = null;
    }
    running.current = false;
    if (!alive.current) return;
    setStopped(stop.current && done < list.length);
    setPhase('done');
  }, [books, upsert]);

  return { phase, pending, progress, summary, stopped, start, halt, reset };
}
