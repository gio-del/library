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
