'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');

// Libri in DATA_DIR/books.json; scrittura atomica (file temporaneo + rename), una alla volta.
function createStore(dataDir) {
  const file = path.join(dataDir, 'books.json');
  let books = null;
  let chain = Promise.resolve();

  async function load() {
    if (books) return;
    try {
      books = JSON.parse(await fs.readFile(file, 'utf8'));
      if (!Array.isArray(books)) throw new Error('books.json non è una lista');
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      books = [];
    }
    // «Altro» e «Senza genere» non esistono più: si tolgono dai generi, il resto del libro resta com'è.
    let migrated = false;
    for (const b of books) {
      if (!Array.isArray(b.genres)) continue;
      const g = b.genres.filter((x) => x !== 'Altro' && x !== 'Senza genere');
      if (g.length !== b.genres.length) { b.genres = g; migrated = true; }
    }
    if (migrated) await save();
  }

  async function save() {
    await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(books, null, 2) + '\n', { mode: 0o600 });
    await fs.rename(tmp, file);
  }

  function serial(fn) {
    const run = chain.then(async () => { await load(); return fn(); });
    chain = run.catch(() => {});
    return run;
  }

  return {
    list: () => serial(() => books.slice()),
    get: (isbn) => serial(() => books.find((b) => b.isbn === isbn) || null),
    add: (book) => serial(async () => {
      if (books.some((b) => b.isbn === book.isbn)) return false;
      books.push(book);
      try { await save(); } catch (e) { books.pop(); throw e; }
      return true;
    }),
    replace: (book) => serial(async () => {
      const i = books.findIndex((b) => b.isbn === book.isbn);
      if (i < 0) return null;
      const old = books[i];
      books[i] = book;
      try { await save(); } catch (e) { books[i] = old; throw e; }
      return book;
    }),
    remove: (isbn) => serial(async () => {
      const i = books.findIndex((b) => b.isbn === isbn);
      if (i < 0) return null;
      const [gone] = books.splice(i, 1);
      try { await save(); } catch (e) { books.splice(i, 0, gone); throw e; }
      return gone;
    }),
  };
}

module.exports = { createStore };
