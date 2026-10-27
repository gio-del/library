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
function el(id) {
  const listeners = {};
  return {
    id, hidden: false, textContent: '', value: '', disabled: false, dataset: {}, src: '', className: '', children: [],
    classList: { toggle() {}, add() {} },
    addEventListener(t, f) { (listeners[t] ||= []).push(f); },
    click() { for (const f of listeners.click || []) f({ target: this }); },
    querySelector: () => ({}),
    append(...n) { this.children.push(...n); },
    replaceChildren(...n) { this.children = n; },
    closest: () => null,
    listeners,
  };
}

function load(routes) {
  const els = {};
  for (const id of ids) {
    els[id] = el(id);
    els[id].hidden = new RegExp(`id="${id}"[^>]*\\bhidden`).test(html);
  }
  const calls = [];
  const fetch = async (url, opt) => {
    const key = `${opt.method} ${url}`;
    calls.push(key);
    const r = routes[key] || [404, { error: 'Non trovato' }];
    return { status: r[0], ok: r[0] < 400, json: async () => r[1] };
  };
  const ctx = { document: { getElementById: (id) => els[id], createElement: () => el('x') }, localStorage: { getItem: () => null, setItem() {} },
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

test('scheda: stato «Da leggere», un tocco lo segna letto e di nuovo da leggere', async () => {
  const isbn = BOOK.isbn;
  const { els, calls } = load({
    [`GET /api/books/${isbn}`]: [200, BOOK],
    [`PATCH /api/books/${isbn}`]: [200, { book: { ...BOOK, read: true } }],
  });
  els.isbn.value = isbn;
  for (const f of els['manual-form'].listeners.submit) f({ preventDefault() {} });
  await tick(); await tick();
  els['verdict-open'].click();
  assert.equal(els['card-state'].textContent, 'Da leggere');
  els['card-read'].click();
  els['card-read'].click();
  await tick(); await tick();
  assert.equal(calls.filter((c) => c.startsWith('PATCH')).length, 1);
  assert.equal(els['card-state'].textContent, 'Letto');
  assert.match(els['card-read'].textContent, /da leggere/);
});

test('elenco → scheda: campi vuoti omessi, modifica, salvataggio, ritorno', async () => {
  const full = { ...BOOK, publisher: 'Ed', year: '1999', edition: '', source: 'sbn', read: false, added: '2026-01-02T10:00:00Z' };
  const { els, calls } = load({
    'GET /api/auth/status': [200, { authenticated: true }],
    'GET /api/books': [200, [full]],
    [`PATCH /api/books/${BOOK.isbn}`]: [200, { book: { ...full, edition: 'Seconda' } }],
  });
  await tick(); await tick();
  els['tab-lib'].click();
  await tick(); await tick();
  assert.equal(els.lib.hidden, false);
  els.grid.children[0].click();
  assert.equal(els.detail.hidden, false);
  assert.equal(els['d-title'].textContent, 'Titolo');
  const labels = els['d-fields'].children.map((c) => c.textContent);
  assert.ok(labels.includes('Editore') && labels.includes('ISBN-10') && !labels.includes('Edizione'));
  els['d-edit'].click();
  assert.equal(els['d-form'].hidden, false);
  els['e-edition'].value = 'Seconda';
  for (const f of els['d-form'].listeners.submit) f({ preventDefault() {} });
  await tick(); await tick();
  assert.ok(calls.includes(`PATCH /api/books/${BOOK.isbn}`));
  assert.ok(els['d-fields'].children.map((c) => c.textContent).includes('Seconda'));
  els['d-back'].click();
  assert.equal(els.lib.hidden, false);
  assert.equal(els.detail.hidden, true);
});
