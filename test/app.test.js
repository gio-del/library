'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
const BOOK = { isbn: '9780306406157', title: 'Titolo', authors: ['A'], cover: null };

// DOM minimo: solo ciò che app.js usa; `routes` simula il server.
function load(routes) {
  const els = {};
  for (const id of ids) {
    const hidden = new RegExp(`id="${id}"[^>]*\\bhidden`).test(html);
    const listeners = {};
    els[id] = {
      id, hidden, textContent: '', value: '', disabled: false, dataset: {}, src: '', className: '',
      classList: { toggle() {} },
      addEventListener(t, f) { (listeners[t] ||= []).push(f); },
      click() { for (const f of listeners.click || []) f(); },
      querySelector: () => ({}),
    };
    els[id].listeners = listeners;
  }
  const calls = [];
  const fetch = async (url, opt) => {
    const key = `${opt.method} ${url}`;
    calls.push(key);
    const r = routes[key] || [404, { error: 'Non trovato' }];
    return { status: r[0], ok: r[0] < 400, json: async () => r[1] };
  };
  const ctx = { document: { getElementById: (id) => els[id] }, localStorage: { getItem: () => null, setItem() {} },
    navigator: {}, window: {}, fetch, setTimeout, confirm: () => true, console };
  vm.runInNewContext(src, ctx);
  return { els, calls };
}
const tick = () => new Promise((r) => setImmediate(r));

test('libro presente: «Ce l’hai già», nessun salvataggio, scheda apribile', async () => {
  const { els, calls } = load({ [`GET /api/books/${BOOK.isbn}`]: [200, BOOK] });
  els.isbn.value = BOOK.isbn;
  for (const f of els['manual-form'].listeners.submit) f({ preventDefault() {} });
  await tick(); await tick();
  assert.match(els['verdict-text'].textContent, /già/);
  assert.equal(els['verdict-add'].hidden, true);
  assert.equal(els['verdict-open'].hidden, false);
  els['verdict-open'].click();
  assert.equal(els.card.hidden, false);
  assert.equal(els['card-title'].textContent, 'Titolo');
  assert.ok(!calls.some((c) => c.startsWith('POST')));
});

test('libro assente: resta non salvato finché non si preme «Salva»; doppio tocco = un solo salvataggio', async () => {
  const { els, calls } = load({
    [`GET /api/lookup/${BOOK.isbn}`]: [200, { isbn: BOOK.isbn, title: 'Titolo', authors: ['A'] }],
    [`POST /api/books`]: [201, { status: 'saved', book: BOOK }],
  });
  els.isbn.value = BOOK.isbn;
  for (const f of els['manual-form'].listeners.submit) f({ preventDefault() {} });
  await tick(); await tick(); await tick();
  assert.match(els['verdict-text'].textContent, /Non/);
  assert.equal(els['verdict-add'].hidden, false);
  assert.ok(!calls.some((c) => c.startsWith('POST')));
  els['verdict-add'].click();
  els['verdict-add'].click();
  await tick(); await tick();
  assert.equal(calls.filter((c) => c.startsWith('POST')).length, 1);
  assert.match(els['verdict-text'].textContent, /già/);
});

test('niente più tasti Controlla/Aggiungi separati né «Cerca e salva»', () => {
  assert.ok(!ids.includes('mode-add') && !ids.includes('mode-check'));
  assert.ok(!html.includes('Cerca e salva'));
});
