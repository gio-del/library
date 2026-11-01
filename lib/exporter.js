'use strict';
const { normalize } = require('./isbn');
const { MAX_GENRES } = require('./genres');

// campi di testo modificabili dall'utente, con la lunghezza massima
const EDITABLE = { title: 300, authors: 200, publisher: 200, year: 20, edition: 200, series: 200, pages: 10, language: 50, notes: 1000 };
const MAX_IMPORT_BOOKS = 5000;

// Valida e ripulisce i campi di testo modificabili presenti in `b`.
function cleanFields(b) {
  const fields = {};
  for (const [k, max] of Object.entries(EDITABLE)) {
    if (!(k in b)) continue;
    if (k === 'authors') {
      if (!Array.isArray(b.authors) || b.authors.length > 20 || b.authors.some((a) => typeof a !== 'string')) return { error: 'Autori non validi' };
      fields.authors = b.authors.map((a) => a.trim().slice(0, max)).filter(Boolean);
    } else {
      if (typeof b[k] !== 'string') return { error: 'Campo non valido' };
      fields[k] = b[k].trim().slice(0, max);
    }
  }
  return { fields };
}

// Voto (intero 1-5) e data di fine lettura (AAAA-MM-GG, giorno esistente).
const isRating = (v) => Number.isInteger(v) && v >= 1 && v <= 5;
function isReadAt(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || v < '1000') return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// Valida `rating` e `readAt` di una modifica: null li toglie. { set, unset } oppure { error }.
function cleanReading(b) {
  const set = {};
  const unset = [];
  if ('rating' in b) {
    if (b.rating === null) unset.push('rating');
    else if (isRating(b.rating)) set.rating = b.rating;
    else return { error: 'Voto non valido' };
  }
  if ('readAt' in b) {
    if (b.readAt === null) unset.push('readAt');
    else if (isReadAt(b.readAt)) set.readAt = b.readAt;
    else return { error: 'Data di lettura non valida' };
  }
  return { set, unset };
}

// Cella CSV: apice davanti alle formule, virgolette se serve.
function cell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(books) {
  const rows = [['ISBN', 'Titolo', 'Autori', 'Editore', 'Anno', 'Letto', 'Generi', 'Note', 'Voto', 'Data di lettura']];
  for (const b of books) {
    rows.push([/^\d{13}$/.test(b.isbn) ? b.isbn : '', b.title, (b.authors || []).join('; '), b.publisher, b.year, b.read ? 'sì' : 'no', (b.genres || []).join('; '), b.notes, b.rating, b.readAt]);
  }
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

// Legge un JSON esportato (lista di libri, {books} o {books, wishlist}): { books, wishlist, invalid } oppure { error }.
function parseImport(text) {
  let data;
  try { data = JSON.parse(text); } catch { return { error: 'JSON non valido' }; }
  let wishes = [];
  if (data && !Array.isArray(data) && Array.isArray(data.books)) {
    if (Array.isArray(data.wishlist)) wishes = data.wishlist;
    data = data.books;
  }
  if (!Array.isArray(data)) return { error: 'Il file non contiene una lista di libri' };
  if (data.length > MAX_IMPORT_BOOKS || wishes.length > MAX_IMPORT_BOOKS) return { error: 'Troppi libri nel file' };
  const books = [];
  const wishlist = [];
  let invalid = 0;
  const seen = new Set();
  for (const b of data) {
    const book = cleanBook(b);
    if (!book || seen.has(book.isbn)) { if (!book) invalid++; continue; }
    seen.add(book.isbn);
    books.push(book);
  }
  const seenWish = new Set();
  for (const w of wishes) {
    const wish = cleanWish(w);
    if (!wish || seenWish.has(wish.isbn)) { if (!wish) invalid++; continue; }
    seenWish.add(wish.isbn);
    wishlist.push(wish);
  }
  return { books, wishlist, invalid };
}

// Un desiderio esportato: ISBN valido, titolo, autori e data di aggiunta (la copertina non viaggia nel file).
function cleanWish(w) {
  if (!w || typeof w !== 'object' || Array.isArray(w) || typeof w.isbn !== 'string') return null;
  const isbn = normalize(w.isbn);
  if (!isbn) return null;
  const f = cleanFields({ title: w.title ?? '', authors: w.authors ?? [] });
  if (f.error) return null;
  const added = typeof w.added === 'string' && !Number.isNaN(Date.parse(w.added)) ? new Date(w.added).toISOString() : new Date().toISOString();
  return { isbn, title: f.fields.title, authors: f.fields.authors, cover: null, added };
}

function cleanBook(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b) || typeof b.isbn !== 'string') return null;
  const isbn = /^m[0-9a-f]{12}$/.test(b.isbn) ? b.isbn : normalize(b.isbn);
  if (!isbn) return null;
  const f = cleanFields(b);
  if (f.error) return null;
  const book = { isbn, title: '', authors: [], publisher: '', year: '', cover: null, ...f.fields, read: b.read === true };
  if (Array.isArray(b.genres)) {
    if (b.genres.length > MAX_GENRES || b.genres.some((g) => typeof g !== 'string')) return null;
    book.genres = [...new Set(b.genres.map((g) => g.trim().slice(0, 40)).filter((g) => g && g !== 'Altro' && g !== 'Senza genere'))];
    if (b.genresManual === true) book.genresManual = true;
  } else book.genres = [];
  if (typeof b.added === 'string' && !Number.isNaN(Date.parse(b.added))) book.added = new Date(b.added).toISOString();
  if (isRating(b.rating)) book.rating = b.rating;
  if (isReadAt(b.readAt)) book.readAt = b.readAt;
  if (b.manual === true || !/^\d{13}$/.test(isbn)) book.manual = true;
  if (b.lookup === 'failed') book.lookup = 'failed';
  return book;
}

module.exports = { EDITABLE, cleanFields, cleanReading, toCsv, parseImport, MAX_IMPORT_BOOKS };
