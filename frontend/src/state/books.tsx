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
}

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

  const value = useMemo(() => ({ books, loaded, load, setAll: setBooks, upsert, remove }), [books, loaded, load, upsert, remove]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBooks(): BooksValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('BooksProvider mancante');
  return v;
}
