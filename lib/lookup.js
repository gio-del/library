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

const AMAZON = 'https://images-na.ssl-images-amazon.com';
const MIN_COVER = 1024;

// ISBN-13 che inizia con 978 -> ISBN-10 con cifra di controllo; null per 979 o input non valido.
function toIsbn10(isbn13) {
  if (typeof isbn13 !== 'string' || !/^978\d{10}$/.test(isbn13)) return null;
  const body = isbn13.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (10 - i) * Number(body[i]);
  const c = (11 - (sum % 11)) % 11;
  return body + (c === 10 ? 'X' : String(c));
}

// Scarica un'immagine e la accetta solo se è un vero JPEG di dimensione plausibile.
async function getJpeg(fetchFn, url, min) {
  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length >= min && buf.length <= MAX_COVER && buf[0] === 0xff && buf[1] === 0xd8) return buf;
    }
  } catch { /* nessuna copertina */ }
  return null;
}

// Open Library, poi Amazon (endpoint non ufficiale, ultima fonte: per un ISBN sconosciuto risponde 200 con una GIF 1x1).
async function fetchCover(isbn, fetchFn) {
  const ol = await getJpeg(fetchFn, `${COVERS}/b/isbn/${isbn}-M.jpg?default=false`, 1);
  if (ol) return ol;
  const isbn10 = toIsbn10(isbn);
  if (!isbn10) return null;
  return getJpeg(fetchFn, `${AMAZON}/images/P/${isbn10}.01.L.jpg`, MIN_COVER);
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

module.exports = { lookup, fetchCover, toIsbn10 };
