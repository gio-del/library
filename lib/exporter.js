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

// Cella CSV: apice davanti alle formule, virgolette se serve.
function cell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(books) {
  const rows = [['ISBN', 'Titolo', 'Autori', 'Editore', 'Anno', 'Letto', 'Generi', 'Note']];
  for (const b of books) {
    rows.push([/^\d{13}$/.test(b.isbn) ? b.isbn : '', b.title, (b.authors || []).join('; '), b.publisher, b.year, b.read ? 'sì' : 'no', (b.genres || []).join('; '), b.notes]);
  }
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

// Legge un JSON esportato (lista di libri, o {books: [...]}): { books, invalid } oppure { error }.
function parseImport(text) {
  let data;
  try { data = JSON.parse(text); } catch { return { error: 'JSON non valido' }; }
  if (data && !Array.isArray(data) && Array.isArray(data.books)) data = data.books;
  if (!Array.isArray(data)) return { error: 'Il file non contiene una lista di libri' };
  if (data.length > MAX_IMPORT_BOOKS) return { error: 'Troppi libri nel file' };
  const books = [];
  let invalid = 0;
  const seen = new Set();
  for (const b of data) {
    const book = cleanBook(b);
    if (!book || seen.has(book.isbn)) { if (!book) invalid++; continue; }
    seen.add(book.isbn);
    books.push(book);
  }
  return { books, invalid };
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
  if (b.manual === true || !/^\d{13}$/.test(isbn)) book.manual = true;
  if (b.lookup === 'failed') book.lookup = 'failed';
  return book;
}

module.exports = { EDITABLE, cleanFields, toCsv, parseImport, MAX_IMPORT_BOOKS };
