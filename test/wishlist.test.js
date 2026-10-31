'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createWishlist } = require('../lib/wishlist');

test('desideri: niente doppioni, resta dopo il riavvio, copia .bak e file rovinato', async () => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lib-wish-')), 'dati');
  const w = createWishlist(dir);
  assert.deepStrictEqual(await w.list(), []);
  assert.strictEqual(await w.add({ isbn: '1', title: 'A' }), true);
  assert.strictEqual(await w.add({ isbn: '1', title: 'B' }), false);
  await w.add({ isbn: '2', title: 'C' });
  assert.ok(fs.existsSync(path.join(dir, 'wishlist.json.bak')));
  assert.deepStrictEqual((await createWishlist(dir).list()).map((x) => x.isbn), ['1', '2']);
  assert.strictEqual((await w.remove('1')).title, 'A');
  assert.strictEqual(await w.remove('1'), null);
  fs.writeFileSync(path.join(dir, 'wishlist.json'), '{rotto');
  assert.deepStrictEqual((await createWishlist(dir).list()).map((x) => x.isbn), ['1', '2']);
});
