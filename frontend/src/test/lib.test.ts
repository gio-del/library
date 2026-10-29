import { bookGenres, filterBooks, genreCounts, needsRetry, sortBooks } from '../lib/books';
import { isbn10Of, looksLikeIsbn, validIsbn13 } from '../lib/isbn';
import type { Book } from '../lib/types';

const b = (o: Partial<Book>): Book => ({ isbn: '9780306406157', authors: [], ...o });

describe('isbn', () => {
  it('valida la cifra di controllo', () => {
    expect(validIsbn13('9780306406157')).toBe(true);
    expect(validIsbn13('9780306406158')).toBe(false);
    expect(validIsbn13('5012345678900')).toBe(false);
  });
  it('riconosce un ISBN scritto a mano e ricava l’ISBN-10', () => {
    expect(looksLikeIsbn('978-0-306-40615-7')).toBe(true);
    expect(looksLikeIsbn('Mansfield Park')).toBe(false);
    expect(isbn10Of('9780306406157')).toBe('0306406152');
    expect(isbn10Of('9790306406157')).toBe('');
  });
});

describe('books', () => {
  it('«Altro», «Senza genere» e libri senza generi sono «Da classificare»', () => {
    expect(bookGenres(b({ genres: ['Senza genere'] }))).toEqual(['Da classificare']);
    expect(bookGenres(b({ genres: ['Altro'] }))).toEqual(['Da classificare']);
    expect(bookGenres(b({ genres: ['Altro', 'Fantasy'] }))).toEqual(['Fantasy']);
    expect(bookGenres(b({}))).toEqual(['Da classificare']);
    expect(bookGenres(b({ genres: ['Saggio'] }))).toEqual(['Saggio']);
  });
  it('filtra per stato e genere e conta i generi sul filtro attivo', () => {
    const list = [b({ isbn: '1', genres: ['Narrativa'], read: true }), b({ isbn: '2', genres: ['Narrativa'] }), b({ isbn: '3', genres: ['Saggio'] })];
    expect(filterBooks(list, 'toread', 'Narrativa').map((x) => x.isbn)).toEqual(['2']);
    expect(genreCounts(list, 'toread', '')).toEqual([['Narrativa', 1], ['Saggio', 1]]);
    expect(genreCounts(list, 'read', 'Saggio')).toEqual([['Narrativa', 1], ['Saggio', 0]]);
  });
  it('rifare la ricerca serve solo con ISBN e dati o copertina mancanti', () => {
    expect(needsRetry(b({ cover: null }))).toBe(true);
    expect(needsRetry(b({ cover: 'x.jpg' }))).toBe(false);
    expect(needsRetry(b({ isbn: 'm0123456789ab' }))).toBe(false);
  });
});

describe('sortBooks', () => {
  const ids = (l: Book[]) => l.map((x) => x.isbn);
  it('recenti: added decrescente, senza added in fondo', () => {
    const l = [b({ isbn: 'a' }), b({ isbn: 'b', added: '2026-01-01' }), b({ isbn: 'c', added: '2026-03-01' })];
    expect(ids(sortBooks(l, 'recent'))).toEqual(['c', 'b', 'a']);
  });
  it('titolo e autore ignorano accenti e maiuscole, i mancanti vanno in fondo', () => {
    const l = [b({ isbn: 'a', title: 'zeta', authors: ['Zed'] }), b({ isbn: 'n' }), b({ isbn: 'e', title: 'Èco', authors: ['Eco'] }), b({ isbn: 'd', title: 'dune', authors: ['Álvaro'] })];
    expect(ids(sortBooks(l, 'title'))).toEqual(['d', 'e', 'a', 'n']);
    expect(ids(sortBooks(l, 'author'))).toEqual(['d', 'e', 'a', 'n']);
  });
});
