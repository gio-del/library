'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { cleanName } = require('../lib/names');
const { createStore } = require('../lib/store');
const { lookup } = require('../lib/lookup');

test('cleanName toglie anni, date di vita e parentesi', () => {
  const cases = [
    ['Rebecca 1981 Jarros', 'Rebecca Jarros'],
    ['Jarros, Rebecca <1981->', 'Jarros, Rebecca'],
    ['Eco, Umberto (1932-2016)', 'Eco, Umberto'],
    ['Eco, Umberto, 1932-2016', 'Eco, Umberto'],
    ['Todd, Anna, n. 1989', 'Todd, Anna'],
    ['Anna Todd', 'Anna Todd'],
    ['Gabriel García Márquez', 'Gabriel García Márquez'],
    ['', ''],
  ];
  for (const [i, o] of cases) assert.strictEqual(cleanName(i), o, i);
  assert.strictEqual(cleanName(undefined), '');
});

test('SBN: «Cognome, Nome <anni>» diventa «Nome Cognome» senza data', async () => {
  const rec = { numFound: 1, briefRecords: [{ titolo: 'Il titolo', autorePrincipale: 'Jarros, Rebecca <1981->' }] };
  const f = (url) => (String(url).includes('openlibrary.org') ? new Response('', { status: 404 }) : new Response(JSON.stringify(rec), { status: 200 }));
  const r = await lookup('9788893420938', f);
  assert.deepStrictEqual(r.authors, ['Rebecca Jarros']);
});

test('lo store pulisce una volta sola i nomi già salvati', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lib-names-'));
  fs.writeFileSync(path.join(dir, 'books.json'), JSON.stringify([{ isbn: '1', authors: ['Rebecca 1981 Jarros', 'Anna Todd'] }, { isbn: '2' }]));
  const list = await createStore(dir).list();
  assert.deepStrictEqual(list[0].authors, ['Rebecca Jarros', 'Anna Todd']);
  assert.strictEqual(list[1].authors, undefined);
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'books.json'), 'utf8'));
  assert.deepStrictEqual(saved[0].authors, ['Rebecca Jarros', 'Anna Todd']);
  assert.ok(JSON.parse(fs.readFileSync(path.join(dir, 'books.json.bak'), 'utf8'))[0].authors[0].includes('1981'));
});
