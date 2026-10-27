'use strict';
const $ = (id) => document.getElementById(id);
let stream = null;
let scanning = false;
let lastCode = null;
let lastSeen = 0;
let saving = false;
let current = null;
let checkSeq = 0;
let libBooks = [];
let filter = 'all';

async function api(method, url, body) {
  const res = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && url !== '/api/login') showLogin();
  if (!res.ok) throw Object.assign(new Error(data.error || 'Errore'), { status: res.status });
  return data;
}

function say(el, text, err) { el.textContent = text; el.classList.toggle('err', !!err); }

function show(name) {
  for (const s of ['login', 'scan', 'lib']) $(s).hidden = s !== name;
  $('nav').hidden = name === 'login';
  if (name !== 'scan') stopCamera();
}

function showLogin() { show('login'); }

function fillCard(book) {
  cardBook = book;
  $('card').hidden = false;
  $('card-title').textContent = book.title || 'Titolo sconosciuto';
  $('card-authors').textContent = book.authors.join(', ');
  $('card-meta').textContent = [book.publisher, book.year, book.isbn].filter(Boolean).join(' · ');
  $('card-cover').hidden = !book.cover;
  $('card-again').hidden = book.lookup !== 'failed' && !!book.cover;
  if (book.cover) $('card-cover').src = `/covers/${book.cover}`;
  paintState(book);
}

function paintState(book) {
  $('card-state').textContent = book.read ? 'Letto' : 'Da leggere';
  $('card-state').className = book.read ? 'badge read' : 'badge';
  $('card-read').textContent = book.read ? 'Segna come da leggere' : 'Segna come letto';
}

// Cambia lo stato letto/da leggere e riporta il libro aggiornato in scheda ed elenco.
async function toggleRead(book, btn) {
  if (btn.disabled) return null;
  btn.disabled = true;
  try {
    const r = await api('PATCH', `/api/books/${book.isbn}`, { read: !book.read });
    const i = libBooks.findIndex((x) => x.isbn === r.book.isbn);
    if (i >= 0) libBooks[i] = r.book;
    return r.book;
  } finally { btn.disabled = false; }
}

let cardBook = null;

function buzz(pattern) { if (navigator.vibrate) navigator.vibrate(pattern); }

function verdict(yes, book) {
  const v = $('verdict');
  v.hidden = false;
  v.className = yes ? 'yes' : 'no';
  $('verdict-text').textContent = yes ? 'Ce l’hai già' : 'Non ce l’hai';
  $('verdict-title').textContent = book.title || '';
  $('verdict-authors').textContent = (book.authors || []).join(', ');
  $('verdict-cover').hidden = !(yes && book.cover);
  if (yes && book.cover) $('verdict-cover').src = `/covers/${book.cover}`;
  current = book;
  $('verdict-add').hidden = yes;
  $('verdict-add').disabled = saving;
  $('verdict-open').hidden = !yes;
  $('verdict-add').dataset.isbn = book.isbn || '';
}

// ISBN-13 (978/979) con cifra di controllo corretta: scarta addendum, prezzi e altri codici a barre.
function validIsbn13(code) {
  if (!/^97[89]\d{10}$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(code[i]) * (i % 2 ? 3 : 1);
  return String((10 - (sum % 10)) % 10) === code[12];
}

async function checkIsbn(isbn) {
  const seq = ++checkSeq;
  $('card').hidden = true;
  say($('scan-msg'), 'Controllo…');
  try {
    const book = await api('GET', `/api/books/${encodeURIComponent(isbn)}`);
    if (seq !== checkSeq) return;
    say($('scan-msg'), '');
    verdict(true, book);
    buzz(200);
  } catch (e) {
    if (seq !== checkSeq) return;
    if (e.status !== 404) { $('verdict').hidden = true; say($('scan-msg'), e.message, true); return; }
    say($('scan-msg'), '');
    const norm = isbn.replace(/[\s-]/g, '');
    verdict(false, { isbn: norm });
    buzz([80, 60, 80]);
    api('GET', `/api/lookup/${encodeURIComponent(norm)}`).then((f) => {
      if (seq === checkSeq && f.title) verdict(false, f);
    }).catch(() => {});
  }
}

async function startCamera() {
  if (!('BarcodeDetector' in window) || !navigator.mediaDevices) {
    say($('scan-msg'), 'Questo browser non legge i codici a barre: scrivi l’ISBN a mano.', true);
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } });
  } catch {
    say($('scan-msg'), 'Fotocamera non disponibile: scrivi l’ISBN a mano.', true);
    return;
  }
  try {
    const [track] = stream.getVideoTracks();
    await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
  } catch { /* messa a fuoco non regolabile */ }
  const detector = new BarcodeDetector({ formats: ['ean_13'] });
  $('video').srcObject = stream;
  $('video').hidden = false;
  await $('video').play();
  scanning = true;
  say($('scan-msg'), 'Inquadra il codice a barre');
  const tick = async () => {
    if (!scanning) return;
    try {
      const codes = await detector.detect($('video'));
      const hit = codes.map((c) => String(c.rawValue).replace(/\D/g, '')).find(validIsbn13);
      if (hit) {
        lastSeen = Date.now();
        if (hit !== lastCode) { lastCode = hit; checkIsbn(hit); }
      } else if (lastCode && Date.now() - lastSeen > 2500) lastCode = null;
    } catch { /* fotogramma non pronto */ }
    setTimeout(tick, 300);
  };
  tick();
}

function stopCamera() {
  scanning = false;
  lastCode = null;
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  $('video').hidden = true;
}

function renderLibrary() {
  const n = (f) => libBooks.filter(f).length;
  const nRead = n((b) => b.read);
  $('f-all').textContent = `Tutti (${libBooks.length})`;
  $('f-toread').textContent = `Da leggere (${libBooks.length - nRead})`;
  $('f-read').textContent = `Letti (${nRead})`;
  for (const [id, f] of [['f-all', 'all'], ['f-toread', 'toread'], ['f-read', 'read']]) $(id).classList.toggle('on', filter === f);
  const shown = libBooks.filter((b) => filter === 'all' || (filter === 'read') === !!b.read);
  say($('lib-msg'), !libBooks.length ? 'La libreria è vuota' : shown.length ? `${shown.length} libri` : 'Nessun libro in questo elenco');
  const grid = $('grid');
  grid.replaceChildren();
  $('retry-all').hidden = !libBooks.some((b) => b.lookup === 'failed' || !b.cover);
  for (const b of shown) {
    const li = document.createElement('li');
    if (b.cover) { const img = document.createElement('img'); img.src = `/covers/${b.cover}`; img.alt = ''; li.append(img); }
    else { const ph = document.createElement('span'); ph.className = 'ph'; ph.textContent = b.title || b.isbn; li.append(ph); }
    const badge = document.createElement('span'); badge.className = b.read ? 'badge read' : 'badge'; badge.textContent = b.read ? 'Letto' : 'Da leggere';
    const t = document.createElement('span'); t.className = 't'; t.textContent = b.title || b.isbn;
    const a = document.createElement('span'); a.className = 'a'; a.textContent = b.authors.join(', ');
    const rd = document.createElement('button'); rd.type = 'button'; rd.textContent = b.read ? 'Segna da leggere' : 'Segna letto';
    rd.addEventListener('click', async () => {
      try { await toggleRead(b, rd); renderLibrary(); } catch (e) { say($('lib-msg'), e.message, true); }
    });
    const del = document.createElement('button'); del.type = 'button'; del.className = 'danger'; del.textContent = 'Elimina';
    del.addEventListener('click', async () => {
      if (!confirm(`Eliminare «${b.title || b.isbn}»?`)) return;
      del.disabled = true;
      try { await api('DELETE', `/api/books/${b.isbn}`); libBooks = libBooks.filter((x) => x.isbn !== b.isbn); renderLibrary(); } catch (e) { say($('lib-msg'), e.message, true); del.disabled = false; }
    });
    li.append(badge, t, a, rd);
    if (b.lookup === 'failed' || !b.cover) {
      const again = document.createElement('button'); again.type = 'button'; again.textContent = 'Cerca di nuovo';
      again.addEventListener('click', async () => {
        again.disabled = true;
        say($('lib-msg'), 'Cerco…');
        try { await api('POST', `/api/books/${b.isbn}/lookup`); await loadLibrary(); } catch (e) { say($('lib-msg'), e.message, true); again.disabled = false; }
      });
      li.append(again);
    }
    li.append(del);
    grid.append(li);
  }
}

async function loadLibrary() {
  show('lib');
  try {
    libBooks = await api('GET', '/api/books');
    renderLibrary();
  } catch (e) { if (e.status !== 401) say($('lib-msg'), e.message, true); }
}

for (const [id, f] of [['f-all', 'all'], ['f-toread', 'toread'], ['f-read', 'read']]) $(id).addEventListener('click', () => { filter = f; renderLibrary(); });
$('card-read').addEventListener('click', async () => {
  if (!cardBook) return;
  try { fillCard(await toggleRead(cardBook, $('card-read'))); } catch (e) { say($('scan-msg'), e.message, true); }
});

$('retry-all').addEventListener('click', async () => {
  $('retry-all').disabled = true;
  say($('lib-msg'), 'Cerco i libri incompleti…');
  try {
    const r = await api('POST', '/api/books/lookup-failed');
    await loadLibrary();
    say($('lib-msg'), `Aggiornati ${r.found} libri su ${r.retried}`);
  } catch (e) { say($('lib-msg'), e.message, true); }
  $('retry-all').disabled = false;
});
$('card-again').addEventListener('click', async () => {
  if (!cardBook) return;
  $('card-again').disabled = true;
  say($('scan-msg'), 'Cerco…');
  try {
    const r = await api('POST', `/api/books/${cardBook.isbn}/lookup`);
    fillCard(r.book);
    say($('scan-msg'), r.book.lookup === 'failed' ? 'Dati ancora non trovati' : r.book.cover ? 'Trovato' : 'Copertina ancora non trovata');
  } catch (e) { say($('scan-msg'), e.message, true); }
  $('card-again').disabled = false;
});
$('tab-scan').addEventListener('click', () => show('scan'));
$('tab-lib').addEventListener('click', loadLibrary);
$('verdict-open').addEventListener('click', () => { if (current) fillCard(current); });
$('verdict-add').addEventListener('click', async () => {
  const b = $('verdict-add');
  if (saving) return;
  saving = true;
  b.disabled = true;
  try {
    const r = await api('POST', '/api/books', { isbn: b.dataset.isbn });
    saving = false;
    verdict(true, r.book);
    say($('scan-msg'), r.status === 'saved' ? 'Salvato' : 'Già in libreria');
  } catch (e) { saving = false; say($('scan-msg'), e.message, true); b.disabled = false; }
});
$('camera').addEventListener('click', () => { if (!scanning) startCamera(); });
$('manual-form').addEventListener('submit', (e) => { e.preventDefault(); checkIsbn($('isbn').value); });
$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('POST', '/api/login', { user: $('user').value || undefined, password: $('password').value });
    $('password').value = '';
    say($('login-msg'), '');
    show('scan');
  } catch (err) { say($('login-msg'), err.message, true); }
});
$('logout').addEventListener('click', async () => { await api('POST', '/api/logout').catch(() => {}); showLogin(); });

api('GET', '/api/auth/status').then((s) => (s.authenticated ? show('scan') : showLogin())).catch(showLogin);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
