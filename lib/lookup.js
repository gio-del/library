'use strict';

const OL = 'https://openlibrary.org';
const SBN = 'https://opac.sbn.it';
const COVERS = 'https://covers.openlibrary.org';
const TIMEOUT_MS = 10000;
const MAX_COVER = 2 * 1024 * 1024;

async function getJson(fetchFn, url) {
  const res = await fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'application/json' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const str = (v, max = 300) => (typeof v === 'string' ? v.slice(0, max) : '');

// Open Library. Ritorna { title, authors, publisher, year } oppure null se non trovato; lancia su errore/timeout.
async function fromOpenLibrary(isbn, fetchFn) {
  const data = await getJson(fetchFn, `${OL}/isbn/${isbn}.json`);
  if (!data) return null;
  const authors = [];
  for (const a of Array.isArray(data.authors) ? data.authors.slice(0, 5) : []) {
    const key = a && a.key;
    if (typeof key !== 'string' || !/^\/authors\/OL\d+A$/.test(key)) continue;
    try {
      const au = await getJson(fetchFn, `${OL}${key}.json`);
      if (au && str(au.name)) authors.push(str(au.name));
    } catch { /* l'autore manca, il libro resta */ }
  }
  return {
    title: str(data.title),
    authors,
    publisher: Array.isArray(data.publishers) ? str(data.publishers[0], 200) : '',
    year: (str(data.publish_date, 50).match(/\d{4}/) || [''])[0],
  };
}

// "Austen, Jane" -> "Jane Austen"
function invertName(name) {
  const parts = str(name).split(',').map((p) => p.trim()).filter(Boolean);
  return parts.length === 2 ? `${parts[1]} ${parts[0]}` : parts.join(' ');
}

// Catalogo SBN (OPAC). Stessa forma di fromOpenLibrary; risposta malformata = non trovato.
async function fromSbn(isbn, fetchFn) {
  const data = await getJson(fetchFn, `${SBN}/opacmobilegw/search.json?isbn=${isbn}`);
  const rec = data && Array.isArray(data.briefRecords) ? data.briefRecords[0] : null;
  if (!rec || typeof rec !== 'object') return null;
  const title = str(str(rec.titolo, 1000).split(' / ')[0].trim());
  if (!title) return null;
  const author = invertName(rec.autorePrincipale);
  return {
    title,
    authors: author ? [author] : [],
    publisher: str(rec.editore || rec.pubblicazione, 200).trim(),
    year: (str(rec.annoPubblicazione || rec.anno || rec.pubblicazione, 100).match(/\d{4}/) || [''])[0],
  };
}

const SOURCES = [['openlibrary', fromOpenLibrary], ['sbn', fromSbn]];

async function fetchCover(isbn, fetchFn) {
  try {
    const res = await fetchFn(`${COVERS}/b/isbn/${isbn}-M.jpg?default=false`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 0 && buf.length <= MAX_COVER && buf[0] === 0xff && buf[1] === 0xd8) return buf;
    }
  } catch { /* nessuna copertina */ }
  return null;
}

// Prova le fonti in ordine, la prima che trova vince. Ritorna
// { title, authors, publisher, year, source, cover: Buffer|null } oppure null se nessuna fonte lo trova
// (o se tutte sono in errore/timeout).
async function lookup(isbn, fetchFn = fetch) {
  for (const [source, fn] of SOURCES) {
    let found;
    try { found = await fn(isbn, fetchFn); } catch { continue; }
    if (found) return { ...found, source, cover: await fetchCover(isbn, fetchFn) };
  }
  return null;
}

module.exports = { lookup };
