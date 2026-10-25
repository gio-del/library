'use strict';

const OL = 'https://openlibrary.org';
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

// Cerca un ISBN-13 su Open Library. Ritorna { title, authors, publisher, year, cover: Buffer|null }
// oppure null se non trovato; lancia in caso di errore di rete/timeout.
async function lookup(isbn, fetchFn = fetch) {
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
  const year = (str(data.publish_date, 50).match(/\d{4}/) || [''])[0];
  let cover = null;
  try {
    const res = await fetchFn(`${COVERS}/b/isbn/${isbn}-M.jpg?default=false`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 0 && buf.length <= MAX_COVER && buf[0] === 0xff && buf[1] === 0xd8) cover = buf;
    }
  } catch { /* nessuna copertina */ }
  return {
    title: str(data.title),
    authors,
    publisher: Array.isArray(data.publishers) ? str(data.publishers[0], 200) : '',
    year,
    cover,
  };
}

module.exports = { lookup };
