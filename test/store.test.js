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

test('migrazione: «Altro» e «Senza genere» spariscono dai generi, il resto resta', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { createStore } = require('../lib/store');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lib-mig-'));
  fs.writeFileSync(path.join(dir, 'books.json'), JSON.stringify([
    { isbn: '1', title: 'A', genres: ['Altro'] },
    { isbn: '2', title: 'B', genres: ['Senza genere'] },
    { isbn: '3', title: 'C', genres: ['Fantasy', 'Altro'], genresManual: true, notes: 'x' },
  ]));
  const list = await createStore(dir).list();
  assert.deepStrictEqual(list.map((b) => b.genres), [[], [], ['Fantasy']]);
  assert.strictEqual(list[2].notes, 'x');
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'books.json'), 'utf8'))[0].genres, []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('books.json.bak: copia a ogni salvataggio, permesso 0600', async () => {
  const dir = tmp();
  const s = createStore(dir);
  await s.add({ isbn: '1' });
  await s.add({ isbn: '2' });
  const bak = path.join(dir, 'books.json.bak');
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(bak, 'utf8')), [{ isbn: '1' }]);
  assert.strictEqual(fs.statSync(bak).mode & 0o777, 0o600);
  await s.replace({ isbn: '2', x: 1 });
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(bak, 'utf8')), [{ isbn: '1' }, { isbn: '2' }]);
  await s.remove('1');
  assert.strictEqual(JSON.parse(fs.readFileSync(bak, 'utf8')).length, 2);
});

test('books.json rovinato con .bak valido: si riparte dal .bak', async () => {
  for (const bad of ['{"isbn":', '{"a":1}', '']) {
    const dir = tmp();
    await createStore(dir).add({ isbn: '1' });
    await createStore(dir).add({ isbn: '2' });
    fs.writeFileSync(path.join(dir, 'books.json'), bad);
    const s = createStore(dir);
    assert.deepStrictEqual(await s.list(), [{ isbn: '1' }]);
    await s.add({ isbn: '3' });
    assert.strictEqual((await createStore(dir).list()).length, 2);
    // il .bak buono non è stato sostituito dalla copia rovinata
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(dir, 'books.json.bak'), 'utf8')));
  }
});

test('books.json e .bak rovinati: load() lancia ancora l’errore', async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'books.json'), '{rotto');
  fs.writeFileSync(path.join(dir, 'books.json.bak'), 'nope');
  await assert.rejects(createStore(dir).list(), SyntaxError);
  const d2 = tmp();
  fs.writeFileSync(path.join(d2, 'books.json'), '{rotto');
  await assert.rejects(createStore(d2).list(), SyntaxError);
});

test('primo avvio: lista vuota, nessun errore, nessun .bak', async () => {
  const dir = tmp();
  assert.deepStrictEqual(await createStore(dir).list(), []);
  assert.ok(!fs.existsSync(path.join(dir, 'books.json.bak')));
});
