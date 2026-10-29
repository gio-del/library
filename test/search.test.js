'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { searchBooks } = require('../lib/search');
const { createServer, readConfig } = require('../server');

const json = (o, status = 200) => new Response(JSON.stringify(o), { status });
const timeout = () => Promise.reject(new DOMException('timeout', 'TimeoutError'));
const olDocs = { docs: [
  { title: 'Persuasione', author_name: ['Jane Austen'], publisher: ['Newton'], first_publish_year: 1817, isbn: ['bad', '9788893420938'], number_of_pages_median: 250, language: ['ita'] },
  { title: 'Senza ISBN', author_name: ['X'] },
  null, { title: 5 },
] };
const sbnRecs = { briefRecords: [
  { titolo: 'Persuasione / Jane Austen', autorePrincipale: 'Austen, Jane', editore: 'Rizzoli', annoPubblicazione: '2001', isbn: '978-88-93420-93-8' },
  { titolo: 'Altro', autorePrincipale: 'Rossi, Mario', pubblicazione: 'Milano : Ed, 1999' },
] };
const fake = ({ ol, sbn }) => (url) => {
  const u = String(url);
  if (u.includes('openlibrary.org/search.json')) return typeof ol === 'function' ? ol() : ol;
  if (u.includes('opac.sbn.it')) return typeof sbn === 'function' ? sbn() : sbn;
  return new Response('', { status: 404 });
};

test('risposte valide: candidati validati, ISBN unici, campi dalle fonti', async () => {
  const r = await searchBooks('Persuasione', 'Austen', fake({ ol: json(olDocs), sbn: json(sbnRecs) }));
  assert.deepStrictEqual(r.map((c) => c.title), ['Persuasione', 'Persuasione', 'Senza ISBN', 'Altro'].filter((_, i) => i !== 1));
  assert.deepStrictEqual(r[0], { isbn: '9788893420938', title: 'Persuasione', authors: ['Jane Austen'], publisher: 'Newton', year: '1817', pages: '250', language: 'Italiano', source: 'openlibrary' });
  const other = r.find((c) => c.title === 'Altro');
  assert.deepStrictEqual([other.isbn, other.authors, other.year, other.source], ['', ['Mario Rossi'], '1999', 'sbn']);
});

test('al massimo 8 candidati', async () => {
  const many = { docs: Array.from({ length: 20 }, (_, i) => ({ title: `T${i}` })) };
  assert.strictEqual((await searchBooks('T', '', fake({ ol: json(many), sbn: json({ briefRecords: [] }) }))).length, 8);
});

test('risposte vuote o malformate: lista vuota', async () => {
  for (const body of [{ docs: [] }, { docs: 'x' }, [], null]) {
    assert.deepStrictEqual(await searchBooks('T', '', fake({ ol: json(body), sbn: json({ briefRecords: 'x' }) })), []);
  }
  assert.deepStrictEqual(await searchBooks('T', '', fake({ ol: new Response('non json'), sbn: new Response('', { status: 500 }) })), []);
});

test('una fonte giù o in timeout: l’altra risponde; entrambe giù: vuoto', async () => {
  const a = await searchBooks('P', '', fake({ ol: timeout, sbn: json(sbnRecs) }));
  assert.ok(a.length && a.every((c) => c.source === 'sbn'));
  const b = await searchBooks('P', '', fake({ ol: json(olDocs), sbn: new Response('', { status: 503 }) }));
  assert.ok(b.length && b.every((c) => c.source === 'openlibrary'));
  assert.deepStrictEqual(await searchBooks('P', '', fake({ ol: timeout, sbn: timeout })), []);
});

test('GET /api/search: sessione, titolo obbligatorio, candidati', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lib-srch-'));
  const config = readConfig({ DATA_DIR: dataDir, AUTH_PASSWORD: 'segreto', PORT: '0' });
  const server = createServer({ config, fetchFn: fake({ ol: json(olDocs), sbn: json(sbnRecs) }) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.strictEqual((await fetch(`${base}/api/search?title=x`)).status, 401);
  const sid = (await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'segreto' }) })).headers.get('set-cookie').split(';')[0];
  const get = (q) => fetch(`${base}/api/search?${q}`, { headers: { cookie: sid } });
  assert.strictEqual((await get('author=a')).status, 400);
  const ok = await (await get('title=Persuasione&author=Austen')).json();
  assert.ok(ok.candidates.length > 0 && ok.candidates.length <= 8);
});
