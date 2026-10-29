'use strict';

const { normalize } = require('./isbn');

const OL = 'https://openlibrary.org';
const SBN = 'https://opac.sbn.it';
const TIMEOUT_MS = 10000;
const MAX = 8;
const LANGS = { ita: 'Italiano', eng: 'Inglese', fre: 'Francese', fra: 'Francese', ger: 'Tedesco', deu: 'Tedesco', spa: 'Spagnolo', por: 'Portoghese', lat: 'Latino' };

const str = (v, max = 300) => (typeof v === 'string' ? v.slice(0, max).trim() : '');
const year = (v) => (str(v, 100).match(/\d{4}/) || [''])[0];
const count = (v) => (Number.isInteger(v) && v > 0 && v < 10000 ? String(v) : '');

async function getJson(fetchFn, url) {
  const res = await fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function invertName(name) {
  const parts = str(name).split(',').map((p) => p.trim()).filter(Boolean);
  return parts.length === 2 ? `${parts[1]} ${parts[0]}` : parts.join(' ');
}

// Primo ISBN valido (normalizzato a ISBN-13) tra quelli dati, o ''.
function firstIsbn(list) {
  for (const x of [].concat(list)) {
    const n = typeof x === 'string' ? normalize(x) : null;
    if (n) return n;
  }
  return '';
}

async function searchOpenLibrary(title, author, fetchFn) {
  const q = new URLSearchParams({ title, limit: String(MAX), fields: 'title,author_name,publisher,first_publish_year,isbn,number_of_pages_median,language' });
  if (author) q.set('author', author);
  const data = await getJson(fetchFn, `${OL}/search.json?${q}`);
  if (!data || !Array.isArray(data.docs)) return [];
  const out = [];
  for (const d of data.docs) {
    if (!d || typeof d !== 'object' || !str(d.title)) continue;
    const langs = Array.isArray(d.language) ? d.language : [];
    out.push({
      isbn: firstIsbn(d.isbn || []),
      title: str(d.title),
      authors: (Array.isArray(d.author_name) ? d.author_name : []).filter((a) => typeof a === 'string' && a.trim()).slice(0, 5).map((a) => str(a, 200)),
      publisher: Array.isArray(d.publisher) ? str(d.publisher[0], 200) : '',
      year: count(d.first_publish_year) ? String(d.first_publish_year) : '',
      pages: count(d.number_of_pages_median),
      language: LANGS[langs[0]] || '',
      source: 'openlibrary',
    });
  }
  return out;
}

async function searchSbn(title, author, fetchFn) {
  const q = new URLSearchParams({ titolo: title, rows: String(MAX) });
  if (author) q.set('autore', author);
  const data = await getJson(fetchFn, `${SBN}/opacmobilegw/search.json?${q}`);
  if (!data || !Array.isArray(data.briefRecords)) return [];
  const out = [];
  for (const rec of data.briefRecords) {
    if (!rec || typeof rec !== 'object') continue;
    const t = str(str(rec.titolo, 1000).split(' / ')[0]);
    if (!t) continue;
    const a = invertName(rec.autorePrincipale);
    out.push({
      isbn: firstIsbn(rec.isbn || ''),
      title: t,
      authors: a ? [a] : [],
      publisher: str(rec.editore || rec.pubblicazione, 200),
      year: year(rec.annoPubblicazione || rec.anno || rec.pubblicazione),
      pages: '',
      language: '',
      source: 'sbn',
    });
  }
  return out;
}

// Candidati da Open Library e SBN (in parallelo, alternati), al massimo MAX, senza ISBN ripetuti.
// Una fonte in errore o in timeout non blocca l'altra; se falliscono tutte ritorna [].
async function searchBooks(title, author, fetchFn = fetch) {
  const lists = (await Promise.allSettled([searchOpenLibrary(title, author, fetchFn), searchSbn(title, author, fetchFn)]))
    .map((r) => (r.status === 'fulfilled' ? r.value : []));
  const seen = new Set();
  const out = [];
  for (let i = 0; out.length < MAX && lists.some((l) => i < l.length); i++) {
    for (const l of lists) {
      const c = l[i];
      if (!c || out.length >= MAX) continue;
      const key = c.isbn || `${c.title}|${c.authors.join(',')}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
  }
  return out;
}

module.exports = { searchBooks };
