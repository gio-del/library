'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { normalize } = require('../lib/isbn');

test('ISBN-13 valido, anche con trattini e spazi', () => {
  assert.strictEqual(normalize('9780306406157'), '9780306406157');
  assert.strictEqual(normalize('978-0-306-40615-7'), '9780306406157');
  assert.strictEqual(normalize(' 978 0306406157 '), '9780306406157');
});
test('ISBN-10 convertito in ISBN-13', () => {
  assert.strictEqual(normalize('0306406152'), '9780306406157');
  assert.strictEqual(normalize('0-8044-2957-X'), '9780804429573');
  assert.strictEqual(normalize('080442957x'), '9780804429573');
});
test('ISBN non validi', () => {
  for (const v of ['9780306406158', '0306406153', '', '123', 'abcdefghij', '97803064061577', null, undefined, 42, {}]) {
    assert.strictEqual(normalize(v), null, String(v));
  }
});
