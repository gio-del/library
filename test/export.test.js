'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { toCsv, parseImport } = require('../lib/exporter');

test('CSV: intestazione, virgolette, a capo e protezione dalle formule', () => {
  const csv = toCsv([
    { isbn: '9780306406157', title: 'Dire "ciao", a tutti', authors: ['A B', 'C D'], publisher: '=cmd()', year: '1999', read: true, genres: ['Narrativa'], notes: 'riga1\nriga2' },
    { isbn: 'm0123456789ab', title: '+1', authors: [], year: '', read: false, genres: [], notes: '@x' },
  ]);
  const lines = csv.replace(/^﻿/, '').split('\r\n');
  assert.strictEqual(lines[0], 'ISBN,Titolo,Autori,Editore,Anno,Letto,Generi,Note');
  assert.ok(lines[1].startsWith('9780306406157,"Dire ""ciao"", a tutti",A B; C D,\'=cmd(),1999,sì,Narrativa,"riga1\nriga2"'));
  assert.strictEqual(lines[2], ",'+1,,,,no,,'@x");
});

test('import: libro valido, ripulito dai campi non ammessi', () => {
  const r = parseImport(JSON.stringify([{ isbn: '978-0-306-40615-7', title: ' T ', authors: ['A'], read: true, genres: ['Narrativa', 'Altro'], cover: '../x.jpg', evil: 1 }]));
  assert.strictEqual(r.invalid, 0);
  assert.strictEqual(r.books.length, 1);
  const b = r.books[0];
  assert.strictEqual(b.isbn, '9780306406157');
  assert.strictEqual(b.title, 'T');
  assert.strictEqual(b.cover, null);
  assert.deepStrictEqual(b.genres, ['Narrativa']);
  assert.ok(!('evil' in b));
});

test('import: JSON malformato, forma sbagliata, libri non validi e doppioni nel file', () => {
  assert.match(parseImport('{no').error, /JSON/);
  assert.ok(parseImport('"x"').error);
  const r = parseImport(JSON.stringify([{ isbn: '123' }, { title: 'x' }, null, { isbn: '9780306406157', title: 5 },
    { isbn: '9780306406157' }, { isbn: '9780306406157' }]));
  assert.strictEqual(r.books.length, 1);
  assert.strictEqual(r.invalid, 4);
  assert.strictEqual(parseImport(JSON.stringify({ books: [{ isbn: '9780306406157' }] })).books.length, 1);
});
