'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer, readConfig } = require('../server');

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const json = (o, status = 200) => new Response(JSON.stringify(o), { status });

// Open Library finto: 9780306406157 trovato, 9780804429573 non trovato, 9781234567897 timeout.
function fakeFetch(url) {
  const u = String(url);
  if (u.includes('9781234567897')) return Promise.reject(new DOMException('timeout', 'TimeoutError'));
  if (u.includes('/isbn/9780306406157.json')) return json({ title: 'Titolo <b>', authors: [{ key: '/authors/OL1A' }], publishers: ['Ed'], publish_date: 'March 3, 1999' });
  if (u.includes('/authors/OL1A.json')) return json({ name: 'Ada Rossi' });
  if (u.includes('covers.openlibrary.org') && u.includes('9780306406157')) return new Response(JPEG, { status: 200 });
  return new Response('', { status: 404 });
}

async function start(t, fetchFn = fakeFetch) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lib-srv-'));
  const config = readConfig({ DATA_DIR: dataDir, AUTH_PASSWORD: 'segreto', PORT: '0' });
  const server = createServer({ config, fetchFn });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (method, p, body, cookie) => fetch(base + p, {
    method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, body: body && JSON.stringify(body),
  });
  const login = async () => (await call('POST', '/api/login', { password: 'segreto' })).headers.get('set-cookie').split(';')[0];
  return { call, login, dataDir, base };
}

test('la configurazione rifiuta di partire senza password e ascolta in locale', () => {
  assert.throws(() => readConfig({}), /password/);
  assert.strictEqual(readConfig({ AUTH_PASSWORD: 'x' }).host, '127.0.0.1');
});

test('API e copertine senza sessione: 401; stato libero', async (t) => {
  const { call } = await start(t);
  assert.strictEqual((await call('GET', '/api/auth/status')).status, 200);
  for (const [m, p] of [['GET', '/api/books'], ['POST', '/api/books'], ['DELETE', '/api/books/9780306406157'], ['GET', '/covers/9780306406157.jpg']]) {
    assert.strictEqual((await call(m, p, m === 'POST' ? { isbn: '9780306406157' } : undefined)).status, 401, `${m} ${p}`);
  }
});

test('login: password errata 401, cookie sicuro, limite ai tentativi, logout', async (t) => {
  const { call } = await start(t);
  const ok = await call('POST', '/api/login', { password: 'segreto' });
  assert.strictEqual(ok.status, 200);
  const cookie = ok.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=Strict/);
  const sid = cookie.split(';')[0];
  assert.strictEqual((await call('GET', '/api/books', undefined, sid)).status, 200);
  await call('POST', '/api/logout', undefined, sid);
  assert.strictEqual((await call('GET', '/api/books', undefined, sid)).status, 401);
  for (let i = 0; i < 5; i++) assert.strictEqual((await call('POST', '/api/login', { password: 'no' })).status, 401);
  assert.strictEqual((await call('POST', '/api/login', { password: 'segreto' })).status, 429);
});

test('POST libro: trovato (con copertina), duplicato, ISBN non valido, non trovato, timeout', async (t) => {
  const { call, login, dataDir } = await start(t);
  const c = await login();
  let r = await call('POST', '/api/books', { isbn: '0-306-40615-2' }, c);
  assert.strictEqual(r.status, 201);
  let b = (await r.json()).book;
  assert.deepStrictEqual([b.isbn, b.title, b.authors, b.publisher, b.year, b.cover], ['9780306406157', 'Titolo <b>', ['Ada Rossi'], 'Ed', '1999', '9780306406157.jpg']);
  assert.ok(fs.existsSync(path.join(dataDir, 'covers', '9780306406157.jpg')));
  assert.strictEqual((await call('GET', '/covers/9780306406157.jpg', undefined, c)).status, 200);

  r = await call('POST', '/api/books', { isbn: '9780306406157' }, c);
  assert.deepStrictEqual([r.status, (await r.json()).status], [200, 'exists']);

  assert.strictEqual((await call('POST', '/api/books', { isbn: '9780306406158' }, c)).status, 400);

  for (const isbn of ['9780804429573', '9781234567897']) {
    r = await call('POST', '/api/books', { isbn }, c);
    assert.strictEqual(r.status, 201);
    b = (await r.json()).book;
    assert.deepStrictEqual([b.isbn, b.lookup, b.title], [isbn, 'failed', '']);
  }
  assert.strictEqual((await (await call('GET', '/api/books', undefined, c)).json()).length, 3);

  r = await call('DELETE', '/api/books/9780306406157', undefined, c);
  assert.strictEqual(r.status, 200);
  assert.ok(!fs.existsSync(path.join(dataDir, 'covers', '9780306406157.jpg')));
  assert.strictEqual((await call('DELETE', '/api/books/9780306406157', undefined, c)).status, 404);
});

test('richiesta troppo grande: 413; pagine statiche con CSP', async (t) => {
  const { call, login } = await start(t);
  const c = await login();
  assert.strictEqual((await call('POST', '/api/books', { isbn: 'x'.repeat(10000) }, c)).status, 413);
  const home = await call('GET', '/');
  assert.strictEqual(home.status, 200);
  assert.match(home.headers.get('content-security-policy'), /default-src 'self'/);
  assert.match(home.headers.get('content-security-policy'), /img-src 'self' blob:;/); // la foto da ritagliare è un URL blob: (#65)
  assert.strictEqual((await call('GET', '/../server.js')).status, 404);
});

test('app installabile: manifest, icone e sw.js senza sessione; il resto resta chiuso', async (t) => {
  const { call } = await start(t);
  const res = await call('GET', '/manifest.webmanifest');
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-type'), /^application\/manifest\+json/);
  const m = await res.json();
  assert.strictEqual(m.name, 'Libreria');
  assert.strictEqual(m.start_url, '/');
  assert.strictEqual(m.display, 'standalone');
  for (const size of ['192x192', '512x512']) {
    for (const purpose of ['any', 'maskable']) {
      const icon = m.icons.find((i) => i.sizes === size && i.purpose === purpose);
      assert.ok(icon, `${size} ${purpose}`);
      const r = await call('GET', icon.src);
      assert.strictEqual(r.status, 200, icon.src);
      assert.strictEqual(r.headers.get('content-type'), 'image/png');
      assert.deepStrictEqual([...Buffer.from(await r.arrayBuffer()).subarray(1, 4)], [0x50, 0x4e, 0x47]);
    }
  }
  assert.strictEqual(m.theme_color, '#492151');
  assert.strictEqual((await call('GET', '/emblem.png')).headers.get('content-type'), 'image/png');
  assert.strictEqual((await call('GET', '/sw.js')).status, 200);
  assert.strictEqual((await call('GET', '/offline.html')).status, 200);
  assert.strictEqual((await call('GET', '/api/books')).status, 401);
  assert.strictEqual((await call('GET', '/covers/9780306406157.jpg')).status, 401);
  for (const p of ['/package.json', '/server.js', '/icon.gif', '/../server.js', '/Icon-192.png']) {
    assert.strictEqual((await call('GET', p)).status, 404, p);
  }
});

test('logo: senza sessione; quello dei dati se c\'è (png prima di jpg), altrimenti l\'emblema', async (t) => {
  const { call, dataDir } = await start(t);
  const emblem = fs.readFileSync(path.join(__dirname, '..', 'public', 'emblem.png'));
  const get = async () => { const r = await call('GET', '/logo'); return [r.status, r.headers.get('content-type'), Buffer.from(await r.arrayBuffer())]; };
  assert.deepStrictEqual(await get(), [200, 'image/png', emblem]);
  fs.writeFileSync(path.join(dataDir, 'logo.jpg'), JPEG);
  assert.deepStrictEqual(await get(), [200, 'image/jpeg', JPEG]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  fs.writeFileSync(path.join(dataDir, 'logo.png'), png);
  assert.deepStrictEqual(await get(), [200, 'image/png', png]);
  assert.strictEqual((await call('GET', '/logo.jpg')).status, 404);
  assert.strictEqual((await call('POST', '/logo')).status, 405);
});

test('GET libro e anteprima: presente, ISBN-10 equivalente, assente, non valido, senza sessione; nessuna scrittura', async (t) => {
  const { call, login, dataDir } = await start(t);
  assert.strictEqual((await call('GET', '/api/books/9780306406157')).status, 401);
  assert.strictEqual((await call('GET', '/api/lookup/9780306406157')).status, 401);
  const sid = await login();
  assert.strictEqual((await call('GET', '/api/books/9780306406157', undefined, sid)).status, 404);
  await call('POST', '/api/books', { isbn: '9780306406157' }, sid);
  const file = path.join(dataDir, 'books.json');
  const before = fs.readFileSync(file, 'utf8');
  for (const id of ['9780306406157', '978-0-306-40615-7', '0306406152']) {
    const r = await call('GET', `/api/books/${id}`, undefined, sid);
    assert.strictEqual(r.status, 200, id);
    assert.strictEqual((await r.json()).isbn, '9780306406157');
  }
  assert.strictEqual((await call('GET', '/api/books/9780804429573', undefined, sid)).status, 404);
  assert.strictEqual((await call('GET', '/api/books/12345', undefined, sid)).status, 400);
  assert.strictEqual((await call('GET', '/api/books/9780306406158', undefined, sid)).status, 400);
  const l = await call('GET', '/api/lookup/9780306406157', undefined, sid);
  assert.strictEqual((await l.json()).title, 'Titolo <b>');
  const miss = await call('GET', '/api/lookup/9781234567897', undefined, sid);
  assert.deepStrictEqual(await miss.json(), { isbn: '9781234567897', title: '', authors: [] });
  assert.strictEqual(fs.readFileSync(file, 'utf8'), before);
  assert.strictEqual(fs.existsSync(path.join(dataDir, 'covers', '9780804429573.jpg')), false);
});

test('«Cerca di nuovo» su un libro con dati ma senza copertina la aggiunge', async (t) => {
  let amazonUp = false;
  const f = (url) => {
    const u = String(url);
    if (u.includes('images-na.ssl-images-amazon.com')) return amazonUp ? new Response(Buffer.concat([JPEG, Buffer.alloc(2000)])) : new Response('', { status: 404 });
    return fakeFetch(u.replace('covers.openlibrary.org', 'nessuna.invalid'));
  };
  const { call, login, dataDir } = await start(t, f);
  const sid = await login();
  const added = await (await call('POST', '/api/books', { isbn: '9780306406157' }, sid)).json();
  assert.strictEqual(added.book.cover, null);
  assert.strictEqual(added.book.lookup, undefined);
  amazonUp = true;
  const r = await (await call('POST', '/api/books/9780306406157/lookup', undefined, sid)).json();
  assert.strictEqual(r.book.cover, '9780306406157.jpg');
  assert.strictEqual(r.book.title, 'Titolo <b>');
  assert.ok(fs.existsSync(path.join(dataDir, 'covers', '9780306406157.jpg')));
});

test('«Cerca di nuovo» su tutti include i libri senza copertina', async (t) => {
  let amazonUp = false;
  const f = (url) => {
    const u = String(url);
    if (u.includes('images-na.ssl-images-amazon.com')) return amazonUp ? new Response(Buffer.concat([JPEG, Buffer.alloc(2000)])) : new Response('', { status: 404 });
    return fakeFetch(u.replace('covers.openlibrary.org', 'nessuna.invalid'));
  };
  const { call, login } = await start(t, f);
  const sid = await login();
  await call('POST', '/api/books', { isbn: '9780306406157' }, sid);
  amazonUp = true;
  const r = await (await call('POST', '/api/books/lookup-failed', undefined, sid)).json();
  assert.strictEqual(r.retried, 1);
  assert.strictEqual(r.books[0].cover, '9780306406157.jpg');
});

test('letto / non letto: default da leggere, PATCH, persistenza, tocchi ripetuti, errori', async (t) => {
  const { call, login } = await start(t);
  const sid = await login();
  const isbn = '9780306406157';
  assert.strictEqual((await call('PATCH', `/api/books/${isbn}`, { read: true })).status, 401);
  assert.strictEqual((await call('PATCH', `/api/books/${isbn}`, { read: true }, sid)).status, 404);
  const added = await (await call('POST', '/api/books', { isbn }, sid)).json();
  assert.strictEqual(added.book.read, false);
  for (const bad of [{}, { read: 'si' }, { read: 1 }]) assert.strictEqual((await call('PATCH', `/api/books/${isbn}`, bad, sid)).status, 400);
  for (let i = 0; i < 2; i++) {
    const r = await call('PATCH', `/api/books/${isbn}`, { read: true }, sid);
    assert.strictEqual(r.status, 200);
    assert.strictEqual((await r.json()).book.read, true);
  }
  assert.strictEqual((await (await call('GET', `/api/books/${isbn}`, undefined, sid)).json()).read, true);
  await call('POST', `/api/books/${isbn}/lookup`, undefined, sid);
  assert.strictEqual((await (await call('GET', `/api/books/${isbn}`, undefined, sid)).json()).read, true);
  assert.strictEqual((await (await call('PATCH', `/api/books/${isbn}`, { read: false }, sid)).json()).book.read, false);
});

test('voto e data di lettura: validati, salvati, azzerabili', async (t) => {
  const { call, login } = await start(t);
  const sid = await login();
  const isbn = '9780306406157';
  await call('POST', '/api/books', { isbn }, sid);
  for (const bad of [{ rating: 0 }, { rating: 6 }, { rating: 2.5 }, { rating: '3' }, { readAt: '2026-02-30' }, { readAt: '29/10/2026' }, { readAt: 5 }]) {
    assert.strictEqual((await call('PATCH', `/api/books/${isbn}`, bad, sid)).status, 400, JSON.stringify(bad));
  }
  const ok = await (await call('PATCH', `/api/books/${isbn}`, { read: true, rating: 4, readAt: '2026-10-29' }, sid)).json();
  assert.deepStrictEqual([ok.book.rating, ok.book.readAt], [4, '2026-10-29']);
  const again = await (await call('GET', `/api/books/${isbn}`, undefined, sid)).json();
  assert.deepStrictEqual([again.rating, again.readAt], [4, '2026-10-29']);
  const cleared = await (await call('PATCH', `/api/books/${isbn}`, { rating: null }, sid)).json();
  assert.ok(!('rating' in cleared.book));
  assert.strictEqual(cleared.book.readAt, '2026-10-29');
  const csv = await (await call('GET', '/api/books/export?format=csv', undefined, sid)).text();
  assert.match(csv, /Voto,Data di lettura/);
  assert.match(csv, /2026-10-29/);
});

test('scheda: modifica campi con PATCH e cambio copertina con PUT', async (t) => {
  const { call, login, dataDir } = await start(t);
  const sid = await login();
  const isbn = '9780306406157';
  await call('POST', '/api/books', { isbn }, sid);
  const r = await call('PATCH', `/api/books/${isbn}`, { title: ' Nuovo ', authors: ['A', ' ', 'B'], edition: 'Seconda', pages: '320', language: 'it' }, sid);
  assert.strictEqual(r.status, 200);
  const b = (await r.json()).book;
  assert.deepStrictEqual([b.title, b.authors, b.edition, b.pages, b.language, b.read], ['Nuovo', ['A', 'B'], 'Seconda', '320', 'it', false]);
  assert.strictEqual((await (await call('GET', `/api/books/${isbn}`, undefined, sid)).json()).edition, 'Seconda');
  for (const bad of [{ title: 5 }, { authors: 'A' }, { authors: [1] }]) assert.strictEqual((await call('PATCH', `/api/books/${isbn}`, bad, sid)).status, 400);

  const base = (await call('GET', '/api/auth/status')).url.replace(/\/api.*/, '');
  const up = (body) => fetch(`${base}/api/books/${isbn}/cover`, { method: 'PUT', headers: { cookie: sid, 'content-type': 'image/jpeg' }, body });
  assert.strictEqual((await up(Buffer.from('non una immagine'))).status, 400);
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  assert.strictEqual((await up(jpg)).status, 200);
  assert.deepStrictEqual(fs.readFileSync(path.join(dataDir, 'covers', `${isbn}.jpg`)), jpg);
  assert.strictEqual((await up(Buffer.alloc(3 * 1024 * 1024, 0xff))).status, 413);
  const nobody = await fetch(`${base}/api/books/${isbn}/cover`, { method: 'PUT', body: jpg });
  assert.strictEqual(nobody.status, 401);
});

test('note: salvataggio, ricarica e versione sovrascritta recuperabile', async (t) => {
  const { call, login } = await start(t);
  assert.strictEqual((await call('GET', '/api/notes')).status, 401);
  const c = await login();
  let r = await (await call('GET', '/api/notes', null, c)).json();
  assert.deepStrictEqual([r.text, r.rev], ['', 0]);
  r = await (await call('PUT', '/api/notes', { text: 'Dune', rev: 0 }, c)).json();
  assert.strictEqual(r.rev, 1);
  assert.strictEqual(r.overwritten, false);
  r = await (await call('PUT', '/api/notes', { text: 'Dune\nEmma', rev: 1 }, c)).json();
  assert.strictEqual(r.history.length, 0);
  // secondo dispositivo, ancora fermo alla revisione 1
  r = await (await call('PUT', '/api/notes', { text: 'Altro', rev: 1 }, c)).json();
  assert.strictEqual(r.overwritten, true);
  assert.strictEqual(r.history[0].text, 'Dune\nEmma');
  r = await (await call('GET', '/api/notes', null, c)).json();
  assert.strictEqual(r.text, 'Altro');
  assert.strictEqual((await call('PUT', '/api/notes', { text: 5, rev: 0 }, c)).status, 400);
});

test('obiettivo di lettura: sessione, validazione e persistenza', async (t) => {
  const { call, login, dataDir } = await start(t);
  assert.strictEqual((await call('GET', '/api/goal')).status, 401);
  assert.strictEqual((await call('PUT', '/api/goal', { goal: 5 })).status, 401);
  const c = await login();
  assert.deepStrictEqual(await (await call('GET', '/api/goal', null, c)).json(), { goal: null });
  for (const bad of [0, 1000, -3, 2.5, '12', null, undefined, NaN]) assert.strictEqual((await call('PUT', '/api/goal', { goal: bad }, c)).status, 400, String(bad));
  for (const ok of [1, 999]) assert.deepStrictEqual(await (await call('PUT', '/api/goal', { goal: ok }, c)).json(), { goal: ok });
  assert.deepStrictEqual(await (await call('GET', '/api/goal', null, c)).json(), { goal: 999 });
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'goal.json'), 'utf8')), { goal: 999 });
  assert.deepStrictEqual(fs.readdirSync(dataDir).filter((f) => f.endsWith('.tmp')), []);
});

test('generi: classificati dalle fonti, correzione a mano non sovrascritta dalla riclassificazione', async (t) => {
  const f = (url) => (String(url).includes('/isbn/9780306406157.json')
    ? json({ title: 'T', authors: [], subjects: ['Horror tales', 'Ghost stories', 'Quilting'] })
    : fakeFetch(url));
  const { call, login } = await start(t, f);
  const sid = await login();
  const added = await (await call('POST', '/api/books', { isbn: '9780306406157' }, sid)).json();
  assert.deepStrictEqual(added.book.genres, ['Horror']);
  const bad = await call('PATCH', '/api/books/9780306406157', { genres: 'x' }, sid);
  assert.strictEqual(bad.status, 400);
  const p = await (await call('PATCH', '/api/books/9780306406157', { genres: ['Romance'] }, sid)).json();
  assert.deepStrictEqual(p.book.genres, ['Romance']);
  const r = await (await call('POST', '/api/books/classify', {}, sid)).json();
  assert.strictEqual(r.changed, 0);
  assert.deepStrictEqual(r.books[0].genres, ['Romance']);
});

test('generi: libro già presente senza generi viene classificato, senza indizi nessun genere, mai «Altro»', async (t) => {
  const { classify } = require('../lib/genres');
  assert.deepStrictEqual(classify([]), [], 'senza indizi: da classificare');
  assert.deepStrictEqual(classify([], { dewey: '823.7' }), ['Narrativa']);
  assert.deepStrictEqual(classify(['BUCHI NERI'], { dewey: '523.8875' }), ['Saggio']);
  assert.deepStrictEqual(classify([], { dewey: '851.914' }), ['Poesia']);
  assert.deepStrictEqual(classify([], { dewey: '741.5' }), ['Fumetti']);
  assert.deepStrictEqual(classify([], { title: 'Manuale di filosofia' }), ['Saggio']);
  assert.deepStrictEqual(classify(['Quilting']), []);
  assert.deepStrictEqual(classify(['Zorba']), []);
  assert.deepStrictEqual(classify(['Fantasy fiction', 'Dragons -- Fiction', 'Magic -- Fiction']), ['Fantasy']);
  assert.deepStrictEqual(classify(['Romantasy']), ['Romantasy']);
  assert.deepStrictEqual(classify(['Young adult fiction', 'Fantasy']).sort(), ['Fantasy', 'Young adult']);
  assert.deepStrictEqual(classify(['Dystopias', 'Fiction']).sort(), ['Distopico', 'Narrativa']);
  assert.deepStrictEqual(classify(['Love stories', 'Fiction']).sort(), ['Narrativa', 'Romance']);
  assert.deepStrictEqual(classify(['Narrativa fantasy']), ['Fantasy']);
  assert.deepStrictEqual(classify(['Fiction']), ['Narrativa']);
  assert.deepStrictEqual(classify(['Classic literature']), ['Classici']);
  assert.deepStrictEqual(classify(['Philosophy']), ['Saggio']);
  assert.deepStrictEqual(classify([], { title: 'Threshing Day' }), []);
  assert.deepStrictEqual(classify([], { title: 'Threshing Day', description: 'A young witch and her dragon.' }), ['Fantasy']);
  assert.ok(!classify(['Cooking', 'Fiction']).includes('Altro'));
  assert.deepStrictEqual(classify(['Fantasy fiction', 'Romance']).sort(), ['Fantasy', 'Romance']);
  const f = (url) => (String(url).includes('/isbn/9780306406157.json')
    ? json({ title: 'T', authors: [], subjects: ['Science fiction'] }) : fakeFetch(url));
  const { call, login, dataDir } = await start(t, f);
  fs.writeFileSync(path.join(dataDir, 'books.json'), JSON.stringify([{ isbn: '9780306406157', title: 'T', authors: [], cover: null }]));
  const sid = await login();
  const r = await (await call('POST', '/api/books/classify', {}, sid)).json();
  assert.strictEqual(r.changed, 1);
  assert.deepStrictEqual(r.books[0].genres, ['Fantascienza']);
});

test('libro a mano senza ISBN: aggiunta, doppione, ricerca, scheda, copertina, eliminazione', async (t) => {
  const { call, login } = await start(t);
  const c = await login();
  assert.strictEqual((await call('POST', '/api/books', { manual: true, title: '  ' }, c)).status, 400);
  const r = await call('POST', '/api/books', { manual: true, title: 'Il Gattopardo', authors: ['Tomasi'], notes: 'regalo', year: '1958' }, c);
  assert.strictEqual(r.status, 201);
  const { book } = await r.json();
  assert.match(book.isbn, /^m[0-9a-f]{12}$/);
  assert.strictEqual(book.manual, true);
  assert.strictEqual(book.notes, 'regalo');
  // doppione: stesso titolo e autore, anche con maiuscole diverse
  const d = await call('POST', '/api/books', { manual: true, title: 'il gattopardo', authors: ['tomasi'] }, c);
  assert.strictEqual(d.status, 409);
  assert.strictEqual((await d.json()).book.isbn, book.isbn);
  assert.strictEqual((await call('POST', '/api/books', { manual: true, title: 'il gattopardo', authors: ['tomasi'], force: true }, c)).status, 201);
  // ricerca testuale
  const found = await (await call('GET', '/api/books?q=gattopardo%20TOMASI', null, c)).json();
  assert.strictEqual(found.length, 2);
  assert.strictEqual((await (await call('GET', '/api/books?q=manzoni', null, c)).json()).length, 0);
  // scheda, letto, modifica, copertina, eliminazione
  assert.strictEqual((await call('GET', `/api/books/${book.isbn}`, null, c)).status, 200);
  const p = await (await call('PATCH', `/api/books/${book.isbn}`, { read: true, notes: 'x' }, c)).json();
  assert.strictEqual(p.book.read, true);
  assert.strictEqual(p.book.notes, 'x');
  const up = await fetch((await call('GET', '/api/auth/status', null, c)).url.replace('/api/auth/status', `/api/books/${book.isbn}/cover`), { method: 'PUT', headers: { cookie: c }, body: JPEG });
  assert.strictEqual(up.status, 200);
  assert.strictEqual((await call('DELETE', `/api/books/${book.isbn}`, null, c)).status, 200);
  assert.strictEqual((await call('GET', `/api/books/${book.isbn}`, null, c)).status, 404);
});

test('libro a mano con ISBN: usa l’ISBN e non lo ripete', async (t) => {
  const { call, login } = await start(t);
  const c = await login();
  const r = await call('POST', '/api/books', { manual: true, title: 'Vecchio', isbn: '978-0-306-40615-7' }, c);
  assert.strictEqual(r.status, 201);
  assert.strictEqual((await r.json()).book.isbn, '9780306406157');
  const again = await call('POST', '/api/books', { manual: true, title: 'Altro', isbn: '9780306406157' }, c);
  assert.strictEqual((await again.json()).status, 'exists');
  assert.strictEqual((await call('POST', '/api/books', { manual: true, title: 'X', isbn: '123' }, c)).status, 400);
});

test('generi: libri salvati «Senza genere» si rileggono da SBN (Dewey) con «Rileggi i generi», senza toccare quelli a mano', async (t) => {
  const f = (url) => {
    const u = String(url);
    if (u.includes('openlibrary.org')) return new Response('', { status: 404 });
    if (u.includes('full.json')) return json({ classificazioneDewey: '823.7 (23.) NARRATIVA INGLESE, 1800-1837' });
    if (u.includes('opac.sbn.it')) return json({ numFound: 1, briefRecords: [{ codiceIdentificativo: 'IT\\ICCU\\VIA\\1', titolo: 'Mansfield Park / J. Austen' }] });
    return fakeFetch(url);
  };
  const { call, login, dataDir } = await start(t, f);
  fs.writeFileSync(path.join(dataDir, 'books.json'), JSON.stringify([
    { isbn: '9788822787774', title: 'Mansfield Park', authors: [], cover: null, genres: ['Senza genere'], subjects: null },
    { isbn: '9788804706250', title: 'Narnia', authors: [], cover: null, genres: ['Senza genere'], subjects: [] },
    { isbn: '9780306406157', title: 'Mano', authors: [], cover: null, genres: ['Romance'], genresManual: true },
  ]));
  const sid = await login();
  const r = await (await call('POST', '/api/books/classify', {}, sid)).json();
  const by = Object.fromEntries(r.books.map((b) => [b.isbn, b]));
  assert.deepStrictEqual(by['9788822787774'].genres, ['Narrativa']);
  assert.strictEqual(by['9788822787774'].dewey, '823.7');
  assert.deepStrictEqual(by['9788804706250'].genres, ['Narrativa']);
  assert.deepStrictEqual(by['9780306406157'].genres, ['Romance']);
  for (const b of r.books) assert.ok(!b.genres.includes('Senza genere'));
});

test('indirizzi dell’app: la pagina è la stessa, i file inesistenti restano 404', async (t) => {
  const { call } = await start(t);
  for (const p of ['/libreria', '/libro/9780306406157', '/scansiona/manuale']) {
    const res = await call('GET', p);
    assert.strictEqual(res.status, 200, p);
    assert.match(res.headers.get('content-type'), /^text\/html/);
  }
  assert.strictEqual((await call('GET', '/nonesiste.js')).status, 404);
  assert.strictEqual((await call('GET', '/assets/../server.js')).status, 404);
  assert.strictEqual((await call('GET', '/assets/nonesiste.js')).status, 404);
});

test('export JSON e CSV: sessione richiesta, allegato; import aggiunge e non sovrascrive', async (t) => {
  const { call, login } = await start(t);
  assert.strictEqual((await call('GET', '/api/books/export?format=json')).status, 401);
  assert.strictEqual((await call('POST', '/api/books/import', [])).status, 401);
  const cookie = await login();
  await call('POST', '/api/books', { manual: true, title: 'Mio libro', authors: ['Ada'] }, cookie);
  const j = await call('GET', '/api/books/export?format=json', undefined, cookie);
  assert.match(j.headers.get('content-disposition'), /^attachment; filename="libreria-.*\.json"$/);
  const exported = JSON.parse(await j.text());
  assert.strictEqual(exported[0].title, 'Mio libro');
  const c = await call('GET', '/api/books/export?format=csv', undefined, cookie);
  assert.match(c.headers.get('content-disposition'), /\.csv"$/);
  assert.match(await c.text(), /Mio libro,Ada/);
  assert.strictEqual((await call('GET', '/api/books/export?format=xml', undefined, cookie)).status, 400);

  const incoming = [{ ...exported[0], title: 'Cambiato' }, { isbn: '9780306406157', title: 'Nuovo', authors: ['Z'] }, { isbn: 'zz' }];
  const r = await call('POST', '/api/books/import', incoming, cookie);
  assert.deepStrictEqual(await r.json(), { added: 1, skipped: 1, invalid: 1 });
  const all = await (await call('GET', '/api/books', undefined, cookie)).json();
  assert.strictEqual(all.length, 2);
  assert.strictEqual(all.find((b) => b.isbn === exported[0].isbn).title, 'Mio libro');
  const again = await (await call('POST', '/api/books/import', incoming, cookie)).json();
  assert.strictEqual(again.added, 0);
});

test('import: JSON malformato 400, corpo troppo grande 413', async (t) => {
  const { login, call } = await start(t);
  const cookie = await login();
  const base = (await call('GET', '/api/auth/status')).url.replace('/api/auth/status', '');
  const post = (body) => fetch(base + '/api/books/import', { method: 'POST', headers: { cookie }, body });
  assert.strictEqual((await post('{rotto')).status, 400);
  assert.strictEqual((await post(' '.repeat(5 * 1024 * 1024 + 1))).status, 413);
});

// --- Lettura della copertina (CLAUDE_BIN finto) ---
function fakeClaude(dir, body) {
  const f = path.join(dir, 'fake-claude.sh');
  fs.writeFileSync(f, `#!/bin/sh\npwd > "${dir}/cwd.txt"\ncat > "${dir}/stdin.txt"\n${body}\n`, { mode: 0o755 });
  return f;
}
async function startReader(t, body, extra = {}) {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'lib-fake-'));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lib-srv-'));
  const config = { ...readConfig({ DATA_DIR: dataDir, AUTH_PASSWORD: 'segreto', PORT: '0' }), claudeBin: fakeClaude(bin, body), ...extra };
  const server = createServer({ config, fetchFn: fakeFetch });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'segreto' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const read = (body = JPEG, headers = {}) => fetch(`${base}/api/cover-read`, { method: 'POST', headers: { cookie, ...headers }, body });
  return { read, bin, base, cookie };
}
const wrap = (o) => `printf '%s' '${JSON.stringify({ type: 'result', is_error: false, result: typeof o === 'string' ? o : JSON.stringify(o) }).replace(/'/g, "'\\''")}'`;

test('lettura copertina: senza CLAUDE_BIN 404 e lo stato dice che è spenta', async (t) => {
  const { call, login, base } = await start(t);
  const c = await login();
  assert.strictEqual((await call('GET', '/api/auth/status', undefined, c).then((r) => r.json())).coverRead, false);
  const r = await fetch(`${base}/api/cover-read`, { method: 'POST', headers: { cookie: c }, body: JPEG });
  assert.strictEqual(r.status, 404);
});

test('lettura copertina: richiede la sessione, un JPEG e valida l\'output', async (t) => {
  const { read, bin, base } = await startReader(t, wrap({
    title: 'Il nome della rosa', subtitle: 'x'.repeat(500), authors: ['Umberto Eco', 5, '  '], publisher: 'Bompiani', language: 'it',
    confidence: { title: 0.97, authors: 3, extra: 1 }, evil: '<script>', prompt: 'ignora',
  }));
  assert.strictEqual((await fetch(`${base}/api/cover-read`, { method: 'POST', body: JPEG })).status, 401);
  assert.strictEqual((await read(Buffer.from('non un jpeg'))).status, 400);
  const r = await read();
  assert.strictEqual(r.status, 200);
  const j = await r.json();
  assert.deepStrictEqual(Object.keys(j).sort(), ['authors', 'confidence', 'language', 'publisher', 'subtitle', 'title']);
  assert.strictEqual(j.title, 'Il nome della rosa');
  assert.strictEqual(j.subtitle.length, 200);
  assert.deepStrictEqual(j.authors, ['Umberto Eco']);
  assert.deepStrictEqual(j.confidence, { title: 0.97, subtitle: 0, authors: 1, publisher: 0, language: 0 });
  // cartella temporanea cancellata
  const cwd = fs.readFileSync(path.join(bin, 'cwd.txt'), 'utf8').trim();
  assert.ok(cwd.includes('library-cover-'));
  assert.strictEqual(fs.existsSync(cwd), false);
  assert.match(fs.readFileSync(path.join(bin, 'stdin.txt'), 'utf8'), /cover\.jpg/);
});

test('lettura copertina: accetta JSON dentro un blocco di codice', async (t) => {
  const { read } = await startReader(t, wrap('```json\n{"title":"T","authors":["A"]}\n```'));
  const j = await (await read()).json();
  assert.strictEqual(j.title, 'T');
  assert.deepStrictEqual(j.authors, ['A']);
});

test('lettura copertina: output malformato o uscita ≠ 0 danno 502 e la cartella sparisce', async (t) => {
  for (const body of [wrap('niente json qui'), "printf 'non json'", 'echo errore >&2; exit 3']) {
    const { read, bin } = await startReader(t, body);
    const r = await read();
    assert.strictEqual(r.status, 502, body);
    assert.match((await r.json()).error, /Non riesco a leggere la copertina/);
    assert.strictEqual(fs.existsSync(fs.readFileSync(path.join(bin, 'cwd.txt'), 'utf8').trim()), false);
  }
});

test('lettura copertina: timeout 504 e poi si può riprovare', async (t) => {
  const { read, bin } = await startReader(t, 'exec sleep 5', { claudeTimeoutMs: 300 });
  const r = await read();
  assert.strictEqual(r.status, 504);
  assert.strictEqual(fs.existsSync(fs.readFileSync(path.join(bin, 'cwd.txt'), 'utf8').trim()), false);
  assert.strictEqual((await read()).status, 504);
});

test('lettura copertina: una alla volta, la seconda in parallelo riceve 429', async (t) => {
  const { read } = await startReader(t, `sleep 0.6; ${wrap({ title: 'T' })}`);
  const [a, b] = await Promise.all([read(), (async () => { await new Promise((r) => setTimeout(r, 200)); return read(); })()]);
  assert.strictEqual(a.status, 200);
  assert.strictEqual(b.status, 429);
  assert.strictEqual((await read()).status, 200);
});

test('desideri: sessione, doppioni, 409 se in libreria, rimozione e acquisto', async (t) => {
  const { call, login, dataDir } = await start(t);
  for (const [m, p] of [['GET', '/api/wishlist'], ['POST', '/api/wishlist'], ['DELETE', '/api/wishlist/9780306406157']]) {
    assert.strictEqual((await call(m, p, m === 'POST' ? { isbn: '9780306406157' } : undefined)).status, 401, `${m} ${p}`);
  }
  const c = await login();
  assert.deepStrictEqual(await (await call('GET', '/api/wishlist', undefined, c)).json(), []);
  assert.strictEqual((await call('POST', '/api/wishlist', { isbn: '123' }, c)).status, 400);
  const r = await call('POST', '/api/wishlist', { isbn: '978-0-306-40615-7' }, c);
  assert.strictEqual(r.status, 201);
  const { item } = await r.json();
  assert.strictEqual(item.title, 'Titolo <b>');
  assert.strictEqual(item.cover, '9780306406157.jpg');
  assert.strictEqual((await call('POST', '/api/wishlist', { isbn: '9780306406157' }, c)).status, 200);
  assert.strictEqual((await (await call('GET', '/api/wishlist', undefined, c)).json()).length, 1);
  assert.ok(fs.existsSync(path.join(dataDir, 'wishlist.json')));
  // comprato: entra in libreria e esce dai desideri, la copertina resta
  assert.strictEqual((await call('POST', '/api/books', { isbn: '9780306406157' }, c)).status, 201);
  assert.deepStrictEqual(await (await call('GET', '/api/wishlist', undefined, c)).json(), []);
  assert.ok(fs.existsSync(path.join(dataDir, 'covers', '9780306406157.jpg')));
  assert.strictEqual((await call('POST', '/api/wishlist', { isbn: '9780306406157' }, c)).status, 409);
  // rimozione: la copertina va via solo se il libro non è in libreria
  assert.strictEqual((await call('POST', '/api/wishlist', { isbn: '9780804429573' }, c)).status, 201);
  assert.strictEqual((await call('DELETE', '/api/wishlist/9780804429573', undefined, c)).status, 200);
  assert.strictEqual((await call('DELETE', '/api/wishlist/9780804429573', undefined, c)).status, 404);
});
