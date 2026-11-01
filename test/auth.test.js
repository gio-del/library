'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAuth } = require('../lib/auth');

const mk = (dir, now) => createAuth({ user: 'u', password: 'p', now, dataDir: dir });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'auth-'));

test('la sessione sopravvive al riavvio, il logout vale anche dopo', () => {
  const dir = tmp();
  const { token } = mk(dir).login('u', 'p');
  const b = mk(dir);
  assert.ok(b.valid(token));
  assert.ok(!b.valid('sconosciuto'));
  b.logout(token);
  assert.ok(!mk(dir).valid(token));
});

test('sessions.json non contiene il token in chiaro, ha permessi 0600', () => {
  const dir = tmp();
  const { token } = mk(dir).login('u', 'p');
  const f = path.join(dir, 'sessions.json');
  assert.ok(!fs.readFileSync(f, 'utf8').includes(token));
  assert.strictEqual(fs.statSync(f).mode & 0o777, 0o600);
});

test('scadenza e pulizia del file', () => {
  const dir = tmp();
  let t = 1000;
  const now = () => t;
  const { token } = mk(dir, now).login('u', 'p');
  t += 31 * 24 * 3600 * 1000;
  const b = mk(dir, now);
  assert.ok(!b.valid(token));
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'sessions.json'), 'utf8')), {});
  const t2 = b.login('u', 'p').token;
  assert.strictEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(dir, 'sessions.json'), 'utf8'))).length, 1);
  assert.ok(mk(dir, now).valid(t2));
});

test('file rovinato o assente: si riparte senza sessioni', () => {
  const dir = tmp();
  assert.ok(!mk(dir).valid('x'));
  fs.writeFileSync(path.join(dir, 'sessions.json'), '{rotto');
  const warn = console.warn; let msg = '';
  console.warn = (m) => { msg += m; };
  try { const a = mk(dir); assert.ok(!a.valid('x')); assert.ok(a.login('u', 'p').token); } finally { console.warn = warn; }
  assert.match(msg, /sessions\.json/);
});

test('5 tentativi falliti danno «troppi» e non sono persistiti', () => {
  const dir = tmp();
  const a = mk(dir);
  for (let i = 0; i < 5; i++) assert.strictEqual(a.login('u', 'x').error, 'credenziali');
  assert.strictEqual(a.login('u', 'p').error, 'troppi');
  assert.ok(mk(dir).login('u', 'p').token);
});
