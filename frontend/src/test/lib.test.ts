import { amazonSearchUrl, findOtherEdition, sameWork, bookGenres, filterBooks, genreCounts, libraryStats, groupStarts, matchesQuery, needsRetry, seriesCounts, authorCounts, sortBooks } from '../lib/books';
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
  it('conta le collane sullo stato attivo e ignora i libri senza collana', () => {
    const list = [b({ isbn: '1', series: 'Dune', read: true }), b({ isbn: '2', series: 'Dune' }), b({ isbn: '3', series: ' Narnia ' }), b({ isbn: '4' })];
    expect(seriesCounts(list, 'all', '')).toEqual([['Dune', 2], ['Narnia', 1]]);
    expect(seriesCounts(list, 'read', 'Narnia')).toEqual([['Dune', 1], ['Narnia', 0]]);
    expect(seriesCounts([b({})], 'all', '')).toEqual([]);
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
  it('autore: per cognome, anche con particelle e forma «Cognome, Nome»', () => {
    const l = [b({ isbn: 't', authors: ['Anna Todd'] }), b({ isbn: 'a', authors: ['Jane Austen'] }), b({ isbn: 'b', authors: ['Frances Eliza Burnett'] }), b({ isbn: 'd', authors: ['Edmondo De Amicis'] }), b({ isbn: 'e', authors: ['Umberto Eco'] }), b({ isbn: 'm', authors: ['Gabriel García Márquez'] }), b({ isbn: 'c', authors: ['Calvino, Italo'] }), b({ isbn: 'x', authors: ['Omero'] })];
    expect(ids(sortBooks(l, 'author'))).toEqual(['a', 'b', 'c', 'd', 'e', 'm', 'x', 't']);
  });
  it('titolo e autore ignorano accenti e maiuscole, i mancanti vanno in fondo', () => {
    const l = [b({ isbn: 'a', title: 'zeta', authors: ['Zed'] }), b({ isbn: 'n' }), b({ isbn: 'e', title: 'Èco', authors: ['Eco'] }), b({ isbn: 'd', title: 'dune', authors: ['Álvaro'] })];
    expect(ids(sortBooks(l, 'title'))).toEqual(['d', 'e', 'a', 'n']);
    expect(ids(sortBooks(l, 'author'))).toEqual(['d', 'e', 'a', 'n']);
  });
});

describe('voto', () => {
  it('ordina dal più alto, senza voto in fondo (anche i non letti)', () => {
    const l = [b({ isbn: 'n' }), b({ isbn: 'a', read: true, rating: 3 }), b({ isbn: 'z', read: true, rating: 5 }), b({ isbn: 'u', rating: 5 })];
    expect(sortBooks(l, 'rating').map((x) => x.isbn)).toEqual(['z', 'a', 'n', 'u']);
  });
  it('statistiche: media dei voti e letti per mese di lettura', () => {
    const s = libraryStats([
      b({ read: true, rating: 4, readAt: '2026-10-03' }), b({ read: true, rating: 5, readAt: '2026-10-20' }),
      b({ read: true, readAt: '2026-08-01' }), b({ rating: 1, readAt: '2026-10-01' }),
    ], new Date(2026, 9, 29));
    expect(s.avgRating).toBe(4.5);
    expect(s.rated).toBe(2);
    expect(s.readMonths.map((m) => m.count)).toEqual([0, 0, 0, 1, 0, 2]);
    expect(libraryStats([b({})], new Date(2026, 9, 29)).avgRating).toBeNull();
  });
});

describe('libraryStats', () => {
  const now = new Date(2026, 9, 29);
  const list = [
    b({ genres: ['Narrativa'], read: true, added: new Date(2026, 9, 2).toISOString() }),
    b({ genres: ['Narrativa', 'Saggio'], added: new Date(2026, 4, 20).toISOString() }),
    b({ added: new Date(2026, 3, 20).toISOString() }),
    b({ added: 'non una data' }),
  ];
  it('conta come la Libreria', () => {
    const s = libraryStats(list, now);
    expect([s.total, s.read, s.toRead]).toEqual([4, 1, 3]);
    expect(s.genres).toEqual(genreCounts(list, 'all', ''));
  });
  it('limita i generi a 8 e raggruppa gli ultimi 6 mesi', () => {
    const many = Array.from({ length: 10 }, (_, i) => b({ genres: [`G${i}`] }));
    expect(libraryStats(many, now).genres).toHaveLength(8);
    const m = libraryStats(list, now).months;
    expect(m.map((x) => x.key)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(m.map((x) => x.count)).toEqual([1, 0, 0, 0, 0, 1]);
  });
  it('con libreria vuota non fallisce', () => {
    expect(libraryStats([], now)).toMatchObject({ total: 0, read: 0, toRead: 0, genres: [] });
  });
});

describe('amazonSearchUrl', () => {
  it('con ISBN-13 cerca per ISBN', () => {
    expect(amazonSearchUrl({ isbn: '9780804429573', title: 'Dune', authors: ['F'] })).toBe('https://www.amazon.it/s?k=9780804429573');
  });
  it('con codice manuale cerca per titolo e autori, codificati', () => {
    expect(amazonSearchUrl({ isbn: 'm123', title: 'Il nome & la rosa', authors: ['Umberto Eco'] })).toBe('https://www.amazon.it/s?k=Il%20nome%20%26%20la%20rosa%20Umberto%20Eco');
  });

  it('matchesQuery cerca in titolo, autori, collana e note senza maiuscole né accenti', () => {
    const b = { isbn: '1', title: 'Perché leggere', authors: ['Italo Calvino'], series: 'Saggi', notes: 'Copertina blu' } as Book;
    for (const q of ['', '  ', 'perche', 'CALVINO', 'saggi', 'blu ']) expect(matchesQuery(b, q)).toBe(true);
    expect(matchesQuery(b, 'rosso')).toBe(false);
    expect(matchesQuery({ isbn: '2', authors: [] } as Book, 'x')).toBe(false);
  });
});

describe('groupStarts', () => {
  const b = (isbn: string, title: string, authors: string[], added = '2026-01-01'): Book => ({ isbn, title, authors, added });
  it('per autore usa il cognome, senza accenti; senza autore va sotto #', () => {
    const list = sortBooks([b('1', 'A', ['Anna Todd']), b('2', 'B', ['Èco Umberto']), b('3', 'C', ['Rebecca Yarros']), b('4', 'D', []), b('5', 'E', ['Jane Austen'])], 'author');
    expect(groupStarts(list, 'author')).toEqual([{ label: 'A', isbn: '5' }, { label: 'T', isbn: '1' }, { label: 'U', isbn: '2' }, { label: 'Y', isbn: '3' }, { label: '#', isbn: '4' }]);
  });
  it('per titolo usa l’iniziale, per voto non c’è scorrimento', () => {
    const list = sortBooks([b('1', 'Narnia', ['X']), b('2', 'Àlbum', ['Y']), b('3', 'Dune', ['Z'])], 'title');
    expect(groupStarts(list, 'title').map((g) => g.label)).toEqual(['A', 'D', 'N']);
    expect(groupStarts(list, 'rating')).toEqual([]);
  });
  it('per recenti raggruppa per mese', () => {
    const list = sortBooks([b('1', 'A', ['X'], '2026-03-05'), b('2', 'B', ['X'], '2026-03-01'), b('3', 'C', ['X'], '2026-01-09')], 'recent');
    expect(groupStarts(list, 'recent').map((g) => g.isbn)).toEqual(['1', '3']);
  });
});

describe('sameWork / findOtherEdition', () => {
  const a = b({ isbn: '1', title: 'Il Nome della Rosa!', authors: ['Umberto Eco'] });
  it('ignora maiuscole, accenti e punteggiatura', () => {
    expect(sameWork(a, b({ isbn: '2', title: 'il nome della rosa', authors: ['umberto eco'] }))).toBe(true);
    expect(sameWork(b({ title: 'Perché?', authors: ['X'] }), b({ title: 'PERCHE', authors: ['x'] }))).toBe(true);
  });
  it('autori diversi, mancanti o titolo vuoto: no', () => {
    expect(sameWork(a, b({ title: 'Il nome della rosa', authors: ['Altro Autore'] }))).toBe(false);
    expect(sameWork(b({ title: 'T', authors: [] }), b({ title: 'T', authors: [] }))).toBe(false);
    expect(sameWork(b({ title: '', authors: ['A'] }), b({ title: '', authors: ['A'] }))).toBe(false);
  });
  it('trova un altro ISBN, non lo stesso', () => {
    const t = b({ isbn: '2', title: 'il nome della rosa', authors: ['Umberto Eco'] });
    expect(findOtherEdition([a], t)?.isbn).toBe('1');
    expect(findOtherEdition([a], { ...t, isbn: '1' })).toBeUndefined();
  });

  it('authorCounts raggruppa gli autori ignorando maiuscole e accenti e conta una volta per libro', () => {
    const list = [
      { isbn: '1', title: 'A', authors: ['Jane Austen', 'jane austen'] },
      { isbn: '2', title: 'B', authors: ['JANE AUSTEN', 'Élodie Rossi'], read: true },
      { isbn: '3', title: 'C' },
    ] as Book[];
    expect(authorCounts(list, 'all', '')).toEqual([['Jane Austen', 2], ['Élodie Rossi', 1]]);
    expect(authorCounts(list, 'read', 'Zed')).toEqual([['Élodie Rossi', 1], ['JANE AUSTEN', 1], ['Zed', 0]]);
  });
});
