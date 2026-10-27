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
  assert.strictEqual((await r.json()).book.lookup, 'failed');

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
