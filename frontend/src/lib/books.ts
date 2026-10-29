import type { Book } from './types';

export const hasIsbn = (b: Book) => /^\d{13}$/.test(b.isbn);
export const needsRetry = (b: Book) => hasIsbn(b) && (b.lookup === 'failed' || !b.cover);
export const bookTitle = (b: Book) => b.title || (hasIsbn(b) ? b.isbn : 'Senza titolo');

// I generi che il server sa assegnare (lib/genres.js); la scheda del libro li offre per la correzione a mano.
export const GENRES = ['Fantasy', 'Romantasy', 'Young adult', 'Distopico', 'Fantascienza', 'Giallo', 'Romance', 'Horror', 'Storico', 'Classici', 'Narrativa', 'Biografia', 'Saggio', 'Fumetti', 'Poesia', 'Teatro', 'Ragazzi'];
export const MAX_GENRES = 5;
export const UNCLASSIFIED = 'Da classificare';

// «Altro» e «Senza genere» non esistono più (anche nei dati vecchi): senza generi il libro è «Da classificare».
export function bookGenres(b: Book): string[] {
  const g = (Array.isArray(b.genres) ? b.genres : []).filter((x) => x !== 'Senza genere' && x !== 'Altro');
  return g.length ? g : [UNCLASSIFIED];
}

export type ReadFilter = 'all' | 'toread' | 'read';
export const matchRead = (b: Book, f: ReadFilter) => f === 'all' || (f === 'read') === !!b.read;

export function genreCounts(books: Book[], f: ReadFilter, selected: string): [string, number][] {
  const counts = new Map<string, number>();
  for (const b of books.filter((x) => matchRead(x, f))) for (const g of bookGenres(b)) counts.set(g, (counts.get(g) || 0) + 1);
  if (selected && !counts.has(selected)) counts.set(selected, 0);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'it'));
}

export function filterBooks(books: Book[], f: ReadFilter, genre: string): Book[] {
  return books.filter((b) => matchRead(b, f) && (!genre || bookGenres(b).includes(genre)));
}

// Il voto conta solo se il libro è letto ed è un intero da 1 a 5.
export const ratingOf = (b: Book) => (b.read && Number.isInteger(b.rating) && b.rating! >= 1 && b.rating! <= 5 ? b.rating! : 0);
export const todayIso = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export type SortOrder = 'recent' | 'title' | 'author' | 'rating';
export const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

// Solo per la lista: i libri senza il valore da confrontare vanno in fondo, a parità resta l'ordine di arrivo.
export function sortBooks(books: Book[], order: SortOrder): Book[] {
  const text = (b: Book) => norm((order === 'title' ? b.title : b.authors.find(Boolean)) || '').trim();
  return [...books].sort((a, b) => {
    if (order === 'rating') {
      const x = ratingOf(a), y = ratingOf(b);
      return x && y ? y - x : x ? -1 : y ? 1 : 0;
    }
    if (order === 'recent') {
      if (!a.added || !b.added) return a.added ? -1 : b.added ? 1 : 0;
      return a.added < b.added ? 1 : a.added > b.added ? -1 : 0;
    }
    const x = text(a), y = text(b);
    if (!x || !y) return x ? -1 : y ? 1 : 0;
    return x.localeCompare(y, 'it');
  });
}

export interface LibraryStats {
  total: number;
  read: number;
  toRead: number;
  genres: [string, number][];
  months: { key: string; label: string; count: number }[];
  readMonths: { key: string; label: string; count: number }[];
  rated: number;
  avgRating: number | null;
}

export const STATS_GENRES = 8;
export const STATS_MONTHS = 6;

// Stessi conteggi della Libreria (matchRead, genreCounts); i mesi sono gli ultimi 6 fino a `now`, in ora locale.
export function libraryStats(books: Book[], now: Date): LibraryStats {
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const blank = () => Array.from({ length: STATS_MONTHS }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (STATS_MONTHS - 1 - i), 1);
    return { key: key(d), label: d.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' }), count: 0 };
  });
  const months = blank();
  const readMonths = blank();
  for (const b of books) {
    const m = b.read && b.readAt ? /^(\d{4}-\d{2})-\d{2}$/.exec(b.readAt) : null;
    const slot = m && readMonths.find((x) => x.key === m[1]);
    if (slot) slot.count++;
  }
  const ratings = books.map(ratingOf).filter(Boolean);
  for (const b of books) {
    const d = b.added ? new Date(b.added) : null;
    if (!d || Number.isNaN(d.getTime())) continue;
    const m = months.find((x) => x.key === key(d));
    if (m) m.count++;
  }
  return {
    total: books.length,
    read: books.filter((b) => matchRead(b, 'read')).length,
    toRead: books.filter((b) => matchRead(b, 'toread')).length,
    genres: genreCounts(books, 'all', '').slice(0, STATS_GENRES),
    months,
    readMonths,
    rated: ratings.length,
    avgRating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
  };
}
