'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { constants: fsConstants } = require('node:fs');
const { cleanName } = require('./names');

// Libri in DATA_DIR/books.json; scrittura atomica (file temporaneo + rename), una alla volta.
function createStore(dataDir, { now = () => new Date() } = {}) {
  const file = path.join(dataDir, 'books.json');
  let books = null;
  const backup = `${file}.bak`;
  let chain = Promise.resolve();
  let fromBackup = false; // books.json rovinato: il .bak buono non va sovrascritto con la copia rovinata

  async function load() {
    if (books) return;
    const read = async (f) => {
      const v = JSON.parse(await fs.readFile(f, 'utf8'));
      if (!Array.isArray(v)) throw new Error(`${path.basename(f)} non è una lista`);
      return v;
    };
    try {
      books = await read(file);
    } catch (e) {
      if (e.code === 'ENOENT') books = [];
      else {
        try { books = await read(backup); } catch { throw e; }
        fromBackup = true;
        console.warn(`books.json illeggibile (${e.message}): si riparte da books.json.bak`);
      }
    }
    // «Altro» e «Senza genere» non esistono più: si tolgono dai generi, il resto del libro resta com'è.
    let migrated = false;
    for (const b of books) {
      if (!Array.isArray(b.genres)) continue;
      const g = b.genres.filter((x) => x !== 'Altro' && x !== 'Senza genere');
      if (g.length !== b.genres.length) { b.genres = g; migrated = true; }
    }
    // Nomi con date o parentesi dal catalogo («Rebecca 1981 Jarros»): puliti una volta sola, books.json.bak resta la copia di prima.
    for (const b of books) {
      if (!Array.isArray(b.authors)) continue;
      const a = b.authors.map((x) => (typeof x === 'string' ? cleanName(x) || x : x));
      if (a.some((x, i) => x !== b.authors[i])) { b.authors = a; migrated = true; }
    }
    if (migrated) await save();
  }

  // Prima copia del giorno in DATA_DIR/backups/books-AAAA-MM-GG.json (lo stato prima del salvataggio, se c'è); restano le ultime 14.
  async function dailyCopy(fallbackSrc) {
    const d = now();
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dir = path.join(dataDir, 'backups');
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    const dest = path.join(dir, `books-${day}.json`);
    const copy = async (src) => { await fs.copyFile(src, dest, fsConstants.COPYFILE_EXCL); await fs.chmod(dest, 0o600); };
    try {
      try { await copy(file); } catch (e) { if (e.code === 'ENOENT') await copy(fallbackSrc); else throw e; }
    } catch (e) { if (e.code !== 'EEXIST') throw e; }
    const old = (await fs.readdir(dir)).filter((n) => /^books-\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort().slice(0, -14);
    for (const n of old) await fs.unlink(path.join(dir, n));
  }

  async function save() {
    await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(books, null, 2) + '\n', { mode: 0o600 });
    if (!fromBackup) {
      try { await dailyCopy(tmp); } catch (e) { console.warn(`copia giornaliera non riuscita: ${e.message}`); }
    }
    if (!fromBackup) {
      try { await fs.copyFile(file, backup); await fs.chmod(backup, 0o600); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
    await fs.rename(tmp, file);
    fromBackup = false;
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
    // Applica fn a più libri con una sola scrittura. fn(book) torna il libro nuovo, null per eliminarlo, undefined per lasciarlo com'è (conta come non aggiornato).
    bulk: (keys, fn) => serial(async () => {
      const before = books;
      const next = books.slice();
      const out = { updated: [], removed: [], skipped: [], missing: [] };
      for (const k of new Set(keys)) {
        const i = next.findIndex((b) => b && b.isbn === k);
        if (i < 0) { out.missing.push(k); continue; }
        const r = fn(next[i]);
        if (r === undefined) { out.skipped.push(k); continue; }
        if (r === null) { out.removed.push(next[i]); next[i] = null; } else { next[i] = r; out.updated.push(r); }
      }
      if (!out.updated.length && !out.removed.length) return out;
      books = next.filter(Boolean);
      try { await save(); } catch (e) { books = before; throw e; }
      return out;
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
