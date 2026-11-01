'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { lookup } = require('../lib/lookup');
const { createServer, readConfig } = require('../server');

const json = (o, status = 200) => new Response(JSON.stringify(o), { status });
const ISBN = '9788893420938';
const sbnRec = { numFound: 1, briefRecords: [{ titolo: '  Persuasione  / Jane Austen', autorePrincipale: 'Austen, Jane', editore: 'Newton', annoPubblicazione: '2019' }] };

// fonti: ol = risposta Open Library, sbn = risposta SBN (Response o funzione che lancia)
function fake({ ol, sbn }) {
  return (url) => {
    const u = String(url);
    if (u.includes('openlibrary.org/isbn/')) return typeof ol === 'function' ? ol() : ol;
    if (u.includes('opac.sbn.it')) return typeof sbn === 'function' ? sbn() : sbn;
    return new Response('', { status: 404 });
  };
}
// SBN con record completo (Dewey): brief per l'ISBN, full per il bid
const sbnFull = (dewey) => (url) => (String(url).includes('full.json') ? json({ classificazioneDewey: dewey }) : json({ numFound: 1, briefRecords: [{ codiceIdentificativo: 'IT\\ICCU\\VIA\\0626314', ...sbnRec.briefRecords[0] }] }));
const notFound = () => new Response('', { status: 404 });
const timeout = () => Promise.reject(new DOMException('timeout', 'TimeoutError'));

test('Open Library trovato: SBN non interrogato', async () => {
  const f = fake({ ol: json({ title: 'T', publish_date: '2001' }), sbn: () => { throw new Error('non doveva essere chiamato'); } });
  const r = await lookup(ISBN, f);
  assert.deepStrictEqual([r.title, r.year, r.source], ['T', '2001', 'openlibrary']);
});

test('Open Library 404 → SBN: titolo, autore invertito, editore, anno', async () => {
  const r = await lookup(ISBN, fake({ ol: notFound(), sbn: json(sbnRec) }));
  assert.deepStrictEqual([r.title, r.authors, r.publisher, r.year, r.source], ['Persuasione', ['Jane Austen'], 'Newton', '2019', 'sbn']);
});

test('Open Library in timeout → SBN', async () => {
  const r = await lookup(ISBN, fake({ ol: timeout, sbn: json(sbnRec) }));
  assert.strictEqual(r.source, 'sbn');
});

test('entrambe le fonti senza risultato o in errore: null', async () => {
  assert.strictEqual(await lookup(ISBN, fake({ ol: notFound(), sbn: json({ numFound: 0, briefRecords: [] }) })), null);
  assert.strictEqual(await lookup(ISBN, fake({ ol: timeout, sbn: timeout })), null);
});

test('risposta SBN malformata: null, nessuna eccezione', async () => {
  for (const body of [{ briefRecords: 'x' }, { briefRecords: [null] }, { briefRecords: [{ titolo: 5 }] }, []]) {
    assert.strictEqual(await lookup(ISBN, fake({ ol: notFound(), sbn: json(body) })), null);
  }
  assert.strictEqual(await lookup(ISBN, fake({ ol: notFound(), sbn: new Response('<html>', { status: 200 }) })), null);
});

test('esito per fonte: trovato, non trovato, errore, risposta malformata', async () => {
  const run = async (opts) => { const outcomes = {}; await lookup(ISBN, fake(opts), { cover: false, outcomes }); return outcomes; };
  assert.deepStrictEqual(await run({ ol: notFound(), sbn: json({ numFound: 0, briefRecords: [] }) }), { openlibrary: 'notfound', sbn: 'notfound', googlebooks: 'notfound' });
  assert.deepStrictEqual(await run({ ol: timeout, sbn: json(sbnRec) }), { openlibrary: 'error', sbn: 'found' });
  assert.deepStrictEqual(await run({ ol: timeout, sbn: timeout }), { openlibrary: 'error', sbn: 'error', googlebooks: 'notfound' });
  assert.deepStrictEqual(await run({ ol: notFound(), sbn: new Response('<html>', { status: 200 }) }), { openlibrary: 'notfound', sbn: 'error', googlebooks: 'notfound' });
  assert.deepStrictEqual(await run({ ol: json({ title: 'T', genres: ['x'] }), sbn: timeout }), { openlibrary: 'found' });
});

test('la copertina Open Library si prova anche per i risultati SBN', async () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const f = (url) => (String(url).includes('covers.openlibrary.org') ? new Response(jpeg) : fake({ ol: notFound(), sbn: json(sbnRec) })(url));
  const r = await lookup(ISBN, f);
  assert.deepStrictEqual([r.source, Buffer.compare(r.cover, jpeg)], ['sbn', 0]);
});

test('«Cerca di nuovo» aggiorna un libro fallito; senza login 401; ISBN ignoto 404', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lib-retry-'));
  const config = readConfig({ DATA_DIR: dataDir, AUTH_PASSWORD: 'segreto' });
  let sbnUp = false;
  const fetchFn = (url) => fake({ ol: notFound(), sbn: () => (sbnUp ? json(sbnRec) : new Response('', { status: 503 })) })(url);
  const server = createServer({ config, fetchFn });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (method, p, body, cookie) => fetch(base + p, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, body: body && JSON.stringify(body) });
  const c = (await call('POST', '/api/login', { password: 'segreto' })).headers.get('set-cookie').split(';')[0];

  assert.strictEqual((await call('POST', `/api/books/${ISBN}/lookup`)).status, 401);
  assert.strictEqual((await call('POST', '/api/books/lookup-failed')).status, 401);
  assert.strictEqual((await (await call('POST', '/api/books', { isbn: ISBN }, c)).json()).book.lookup, 'failed');
  assert.strictEqual((await call('POST', '/api/books/9780306406157/lookup', undefined, c)).status, 404);

  let r = await call('POST', `/api/books/${ISBN}/lookup`, undefined, c);
  const first = await r.json();
  assert.strictEqual(first.book.lookup, 'failed');
  assert.deepStrictEqual(first.sources, { openlibrary: 'notfound', sbn: 'error', googlebooks: 'notfound' });

  sbnUp = true;
  r = await call('POST', '/api/books/lookup-failed', undefined, c);
  const all = await r.json();
  assert.deepStrictEqual([all.retried, all.found], [1, 1]);
  const [b] = await (await call('GET', '/api/books', undefined, c)).json();
  assert.deepStrictEqual([b.title, b.authors, b.source, b.lookup], ['Persuasione', ['Jane Austen'], 'sbn', undefined]);
});

const { fetchCover, toIsbn10 } = require('../lib/lookup');
const BIG_JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(3000, 1)]);
const GIF43 = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(37)]);

function coverFetch({ amazon, calls }) {
  return (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes('images-na.ssl-images-amazon.com')) return amazon();
    return new Response('', { status: 404 });
  };
}

test('toIsbn10: conversione, cifra X, 979 senza ISBN-10', () => {
  assert.strictEqual(toIsbn10('9780306406157'), '0306406152');
  assert.strictEqual(toIsbn10('9780804429573'), '080442957X');
  assert.strictEqual(toIsbn10('9791234567896'), null);
  assert.strictEqual(toIsbn10('abc'), null);
});

test('copertina: Open Library senza, Amazon JPEG accettato', async () => {
  const calls = [];
  const buf = await fetchCover('9780306406157', coverFetch({ amazon: () => new Response(BIG_JPEG), calls }));
  assert.ok(buf && buf.equals(BIG_JPEG));
  assert.ok(calls.some((u) => u.endsWith('/images/P/0306406152.01.L.jpg')));
});

test('copertina: la GIF segnaposto da 43 byte di Amazon è rifiutata', async () => {
  const calls = [];
  assert.strictEqual(await fetchCover('9780306406157', coverFetch({ amazon: () => new Response(GIF43), calls })), null);
  // anche un JPEG troppo piccolo
  assert.strictEqual(await fetchCover('9780306406157', coverFetch({ amazon: () => new Response(Buffer.from([0xff, 0xd8, 0xff, 0xd9])), calls })), null);
});

test('copertina: un ISBN 979 non interroga Amazon', async () => {
  const calls = [];
  assert.strictEqual(await fetchCover('9791234567896', coverFetch({ amazon: () => new Response(BIG_JPEG), calls })), null);
  assert.ok(!calls.some((u) => u.includes('amazon')));
});

test('copertina: errore di Amazon = nessuna copertina', async () => {
  const calls = [];
  assert.strictEqual(await fetchCover('9780306406157', coverFetch({ amazon: timeout, calls })), null);
});

test('SBN: la classificazione Dewey del record completo dà soggetto e numero', async () => {
  const f = (url) => (String(url).includes('openlibrary.org/isbn/') ? notFound() : sbnFull('823.7 (23.) NARRATIVA INGLESE, 1800-1837')(url));
  const r = await lookup(ISBN, f);
  assert.deepStrictEqual([r.source, r.dewey, r.subjects], ['sbn', '823.7', ['NARRATIVA INGLESE, 1800-1837']]);
});

test('Open Library senza soggetti: il genere si chiede a SBN; con soggetti SBN non è interrogato', async () => {
  const f = (url) => (String(url).includes('openlibrary.org/isbn/') ? json({ title: 'T', publish_date: '2001' }) : sbnFull('523.8875 (23.) BUCHI NERI')(url));
  const r = await lookup(ISBN, f);
  assert.deepStrictEqual([r.source, r.dewey, r.subjects], ['openlibrary', '523.8875', ['BUCHI NERI']]);
  const g = fake({ ol: json({ title: 'T', subjects: ['Fantasy'] }), sbn: () => { throw new Error('non doveva essere chiamato'); } });
  assert.deepStrictEqual((await lookup(ISBN, g)).subjects, ['Fantasy']);
});

test('SBN: record completo non leggibile o Dewey assente: il libro resta, senza Dewey; bid strano ignorato', async () => {
  const bad = (url) => (String(url).includes('full.json') ? new Response('x', { status: 500 }) : json({ numFound: 1, briefRecords: [{ codiceIdentificativo: 'a b/../c', titolo: 'T' }] }));
  const r = await lookup(ISBN, (url) => (String(url).includes('openlibrary.org/isbn/') ? notFound() : bad(url)));
  assert.deepStrictEqual([r.title, r.dewey, r.subjects], ['T', '', []]);
});

// Forma della risposta di Google Books (volumes?q=isbn:…) per «Il piccolo Lord»; non registrata dal vivo (429 senza chiave).
const gbVol = { totalItems: 1, items: [{ volumeInfo: { title: 'Il piccolo Lord', subtitle: 'Edizione integrale', authors: ['Frances Hodgson Burnett'], publisher: 'BUR', publishedDate: '2011-03-03', categories: ['Juvenile Fiction'] } }] };
const withGb = (gb, base = {}) => (url) => (String(url).includes('googleapis.com') ? (typeof gb === 'function' ? gb() : gb) : fake({ ol: notFound(), sbn: json({ numFound: 0, briefRecords: [] }), ...base })(url));

test('Open Library e SBN senza ISBN → Google Books', async () => {
  const outcomes = {};
  const r = await lookup('9788817152754', withGb(json(gbVol)), { cover: false, outcomes });
  assert.deepStrictEqual([r.title, r.authors, r.publisher, r.year, r.subjects, r.source],
    ['Il piccolo Lord: Edizione integrale', ['Frances Hodgson Burnett'], 'BUR', '2011', ['Juvenile Fiction'], 'googlebooks']);
  assert.deepStrictEqual(outcomes, { openlibrary: 'notfound', sbn: 'notfound', googlebooks: 'found' });
});

test('Google Books: nessun risultato, 429 o risposta malformata non rompono la ricerca', async () => {
  const run = async (gb) => { const outcomes = {}; const r = await lookup('9788817152754', withGb(gb), { cover: false, outcomes }); return [r, outcomes.googlebooks]; };
  assert.deepStrictEqual(await run(json({ totalItems: 0 })), [null, 'notfound']);
  assert.deepStrictEqual(await run(json({ items: [{ volumeInfo: { title: '' } }] })), [null, 'notfound']);
  assert.deepStrictEqual(await run(json({}, 429)), [null, 'error']);
  assert.deepStrictEqual(await run(timeout), [null, 'error']);
});
