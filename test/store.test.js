'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStore } = require('../lib/store');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lib-store-'));

test('aggiunta, duplicato, rimozione e persistenza', async () => {
  const dir = tmp();
  const s = createStore(dir);
  assert.deepStrictEqual(await s.list(), []);
  assert.strictEqual(await s.add({ isbn: '1' }), true);
  assert.strictEqual(await s.add({ isbn: '1' }), false);
  assert.strictEqual((await createStore(dir).list()).length, 1);
  assert.deepStrictEqual(await s.remove('1'), { isbn: '1' });
  assert.strictEqual(await s.remove('1'), null);
  assert.deepStrictEqual(await createStore(dir).list(), []);
});

test('scrittura atomica: nessun file temporaneo e scritture concorrenti intere', async () => {
  const dir = tmp();
  const s = createStore(dir);
  await Promise.all(Array.from({ length: 20 }, (_, i) => s.add({ isbn: String(i) })));
  assert.deepStrictEqual(fs.readdirSync(dir), ['books.json']);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'books.json'), 'utf8')).length, 20);
});
