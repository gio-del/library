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

async function start(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lib-srv-'));
  const config = readConfig({ DATA_DIR: dataDir, AUTH_PASSWORD: 'segreto', PORT: '0' });
  const server = createServer({ config, fetchFn: fakeFetch });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (method, p, body, cookie) => fetch(base + p, {
    method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, body: body && JSON.stringify(body),
  });
  const login = async () => (await call('POST', '/api/login', { password: 'segreto' })).headers.get('set-cookie').split(';')[0];
  return { call, login, dataDir };
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
  assert.strictEqual((await call('GET', '/../server.js')).status, 404);
});
