import type { Book } from './types';

export const hasIsbn = (b: Book) => /^\d{13}$/.test(b.isbn);
export const needsRetry = (b: Book) => hasIsbn(b) && (b.lookup === 'failed' || !b.cover);
// Ricerca su Amazon: per ISBN-13, altrimenti (codice manuale) per titolo e autori. Solo testo pubblico del libro.
export function amazonSearchUrl(item: { isbn: string; title?: string; authors?: string[] }): string {
  const q = /^\d{13}$/.test(item.isbn) ? item.isbn : [item.title, ...(item.authors || [])].filter(Boolean).join(' ') || item.isbn;
  return `https://www.amazon.it/s?k=${encodeURIComponent(q)}`;
}
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

export const seriesOf = (b: Book) => (typeof b.series === 'string' ? b.series.trim() : '');

/** Chiave di confronto della collana: senza maiuscole né spazi in eccesso. */
export const seriesKey = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** Quanti libri ha la collana del libro (lui compreso) e quanti letti; null se non ne esistono altri. */
export function seriesSummary(books: Book[], book: Book): { name: string; total: number; read: number } | null {
  const name = seriesOf(book);
  if (!name) return null;
  const key = seriesKey(name);
  const same = books.filter((b) => b.isbn === book.isbn || seriesKey(seriesOf(b)) === key);
  if (!same.some((b) => b.isbn !== book.isbn)) return null;
  return { name, total: same.length, read: same.filter((b) => b.read).length };
}

export function seriesCounts(books: Book[], f: ReadFilter, selected: string): [string, number][] {
  const counts = new Map<string, number>();
  for (const b of books.filter((x) => matchRead(x, f))) {
    const s = seriesOf(b);
    if (s) counts.set(s, (counts.get(s) || 0) + 1);
  }
  if (selected && !counts.has(selected)) counts.set(selected, 0);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'it'));
}

export const authorsOf = (b: Book): string[] => (Array.isArray(b.authors) ? b.authors : []).filter((a): a is string => typeof a === 'string' && !!a.trim()).map((a) => a.trim());
export const hasAuthor = (b: Book, author: string) => authorsOf(b).some((a) => norm(a) === norm(author));

export function authorCounts(books: Book[], f: ReadFilter, selected: string): [string, number][] {
  const counts = new Map<string, [string, number]>();
  for (const b of books.filter((x) => matchRead(x, f))) {
    for (const k of new Set(authorsOf(b).map(norm))) {
      const e = counts.get(k) || [authorsOf(b).find((a) => norm(a) === k)!, 0];
      e[1]++;
      counts.set(k, e);
    }
  }
  if (selected && !counts.has(norm(selected))) counts.set(norm(selected), [selected, 0]);
  return [...counts.values()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'it'));
}

export interface AuthorTop { name: string; books: number; read: number }

/** I primi `limit` autori con almeno 2 libri: per libri decrescenti, poi per cognome. */
export function topAuthors(books: Book[], limit = 5): AuthorTop[] {
  const m = new Map<string, AuthorTop>();
  for (const b of books) {
    const names = authorsOf(b);
    for (const k of new Set(names.map(norm))) {
      const e = m.get(k) || { name: names.find((a) => norm(a) === k)!, books: 0, read: 0 };
      e.books++;
      if (b.read) e.read++;
      m.set(k, e);
    }
  }
  return [...m.values()]
    .filter((e) => e.books >= 2)
    .sort((a, b) => b.books - a.books || authorSortKey(a.name).localeCompare(authorSortKey(b.name), 'it'))
    .slice(0, limit);
}

export function filterBooks(books: Book[], f: ReadFilter, genre: string): Book[] {
  return books.filter((b) => matchRead(b, f) && (!genre || bookGenres(b).includes(genre)));
}

// Il voto conta solo se il libro è letto ed è un intero da 1 a 5.
export const ratingOf = (b: Book) => (b.read && Number.isInteger(b.rating) && b.rating! >= 1 && b.rating! <= 5 ? b.rating! : 0);
export const todayIso = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Chiave di confronto: minuscole, senza accenti né punteggiatura, spazi ridotti.
const workKey = (s: string | undefined) => norm(s || '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Stesso titolo normalizzato e stesso primo autore (entrambi presenti). */
export function sameWork(a: Partial<Book>, b: Partial<Book>): boolean {
  const ta = workKey(a.title), tb = workKey(b.title);
  const aa = workKey((a.authors || []).find(Boolean)), ab = workKey((b.authors || []).find(Boolean));
  return !!ta && ta === tb && !!aa && aa === ab;
}

/** Un libro già in libreria con un altro ISBN che è la stessa opera del candidato. */
export const findOtherEdition = (books: Book[], candidate: Partial<Book>): Book | undefined =>
  books.find((b) => b.isbn !== candidate.isbn && sameWork(b, candidate));

export type SortOrder = 'recent' | 'title' | 'author' | 'rating';
export const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

// Chiave d'ordine dell'autore: «cognome nome». Cognome = ultima parola con le particelle che la precedono («de», «van», «Le»…);
// un nome già «Cognome, Nome» vale com'è; un solo nome vale se stesso.
const PARTICLES = new Set(['de', 'da', 'di', 'del', 'della', 'dei', 'degli', 'delle', 'dal', 'dalla', 'van', 'von', 'der', 'den', 'la', 'le', 'lo', 'du', 'des', 'dos', 'das', 'el', 'al', 'ten', 'ter', 'bin', 'ibn']);
export function authorSortKey(name: string): string {
  const n = norm(name).replace(/\s+/g, ' ').trim();
  if (n.includes(',')) return n.replace(/\s*,\s*/g, ' ').trim();
  const w = n.split(' ');
  let i = w.length - 1;
  while (i > 0 && PARTICLES.has(w[i - 1])) i--;
  return [...w.slice(i), ...w.slice(0, i)].join(' ');
}

/** Il testo cercato (già normalizzato con `norm`) compare nel titolo, negli autori, nella collana o nelle note. */
export const matchesQuery = (b: Book, q: string) => {
  const needle = norm(q.trim());
  return !needle || norm([b.title, ...(b.authors || []), b.series, b.notes].filter((x) => typeof x === 'string' && x).join(' ')).includes(needle);
};

// Solo per la lista: i libri senza il valore da confrontare vanno in fondo, a parità resta l'ordine di arrivo.
export function sortBooks(books: Book[], order: SortOrder): Book[] {
  const text = (b: Book) => (order === 'title' ? norm(b.title || '').trim() : authorSortKey(b.authors.find(Boolean) || ''));
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

/** Etichetta del gruppo per lo scorrimento a lettere: iniziale della chiave d'ordine, mese per «recenti», `#` per il resto; `null` = niente scorrimento (voto). */
export function groupLabel(b: Book, order: SortOrder): string | null {
  if (order === 'rating') return null;
  if (order === 'recent') {
    const d = b.added ? new Date(b.added) : null;
    return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('it', { month: 'short', year: 'numeric' }) : '#';
  }
  const key = order === 'title' ? norm(b.title || '').trim() : authorSortKey(b.authors.find(Boolean) || '');
  const c = key.charAt(0).toUpperCase();
  return /^[A-Z]$/.test(c) ? c : '#';
}

/** I gruppi nell'ordine in cui compaiono nella lista già ordinata, con il primo libro di ciascuno. */
export function groupStarts(sorted: Book[], order: SortOrder): { label: string; isbn: string }[] {
  const out: { label: string; isbn: string }[] = [];
  for (const b of sorted) {
    const label = groupLabel(b, order);
    if (label !== null && out[out.length - 1]?.label !== label) out.push({ label, isbn: b.isbn });
  }
  return out;
}
