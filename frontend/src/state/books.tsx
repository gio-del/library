import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import type { Book } from '../lib/types';

interface BooksValue {
  books: Book[];
  loaded: boolean;
  load(): Promise<void>;
  setAll(books: Book[]): void;
  upsert(book: Book): void;
  remove(isbn: string): void;
  bulk(isbns: string[], action: BulkAction, value?: string): Promise<BulkResult>;
}

export type BulkAction = 'read' | 'unread' | 'addGenre' | 'delete';
// done: libri cambiati; unchanged: già come richiesto (o senza posto per un altro genere); failed: non più presenti.
export interface BulkResult { done: number; failed: number; unchanged: number }

const Ctx = createContext<BooksValue | null>(null);

export function BooksProvider({ children }: { children: ReactNode }) {
  const [books, setBooks] = useState<Book[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setBooks(await api<Book[]>('GET', '/api/books'));
    setLoaded(true);
  }, []);
  const upsert = useCallback((b: Book) => setBooks((cur) => (cur.some((x) => x.isbn === b.isbn) ? cur.map((x) => (x.isbn === b.isbn ? b : x)) : [...cur, b])), []);
  const remove = useCallback((isbn: string) => setBooks((cur) => cur.filter((x) => x.isbn !== isbn)), []);

  const bulk = useCallback(async (isbns: string[], action: BulkAction, value?: string): Promise<BulkResult> => {
    const r = await api<BulkResult & { books: Book[]; removed: string[] }>('POST', '/api/books/bulk', { isbns, action, ...(value === undefined ? {} : { value }) });
    const upd = new Map(r.books.map((b) => [b.isbn, b]));
    const gone = new Set(r.removed);
    setBooks((cur) => cur.filter((b) => !gone.has(b.isbn)).map((b) => upd.get(b.isbn) ?? b));
    return { done: r.done, failed: r.failed, unchanged: r.unchanged };
  }, []);

  const value = useMemo(() => ({ books, loaded, load, setAll: setBooks, upsert, remove, bulk }), [books, loaded, load, upsert, remove, bulk]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBooks(): BooksValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('BooksProvider mancante');
  return v;
}
