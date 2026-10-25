'use strict';
const $ = (id) => document.getElementById(id);
let stream = null;
let scanning = false;
let mode = localStorage.getItem('mode') === 'check' ? 'check' : 'add';
let lastCode = null;
let checkSeq = 0;

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
  $('card-again').hidden = book.lookup !== 'failed';
  if (book.cover) $('card-cover').src = `/covers/${book.cover}`;
}

let cardBook = null;

function setMode(m) {
  mode = m;
  try { localStorage.setItem('mode', m); } catch { /* storage non disponibile */ }
  $('mode-add').setAttribute('aria-pressed', String(m === 'add'));
  $('mode-check').setAttribute('aria-pressed', String(m === 'check'));
  $('manual-form').querySelector('button').textContent = m === 'check' ? 'Controlla' : 'Cerca e salva';
  $('verdict').hidden = true;
  $('card').hidden = true;
  lastCode = null;
  say($('scan-msg'), '');
}

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
  $('verdict-add').hidden = yes;
  $('verdict-add').disabled = false;
  $('verdict-add').dataset.isbn = book.isbn || '';
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

async function submitIsbn(isbn) {
  if (mode === 'check') return checkIsbn(isbn);
  $('verdict').hidden = true;
  say($('scan-msg'), 'Cerco…');
  try {
    const r = await api('POST', '/api/books', { isbn });
    fillCard(r.book);
    const lost = r.book.lookup === 'failed' ? ' (dati non trovati, salvato solo l’ISBN)' : '';
    say($('scan-msg'), (r.status === 'saved' ? 'Salvato' : 'Già in libreria') + lost);
  } catch (e) {
    $('card').hidden = true;
    say($('scan-msg'), e.message, true);
  }
}

async function startCamera() {
  if (!('BarcodeDetector' in window) || !navigator.mediaDevices) {
    say($('scan-msg'), 'Questo browser non legge i codici a barre: scrivi l’ISBN a mano.', true);
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch {
    say($('scan-msg'), 'Fotocamera non disponibile: scrivi l’ISBN a mano.', true);
    return;
  }
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
      if (codes.length && codes[0].rawValue !== lastCode) {
        lastCode = codes[0].rawValue;
        if (mode === 'check') checkIsbn(lastCode);
        else { stopCamera(); await submitIsbn(lastCode); return; }
      }
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

async function loadLibrary() {
  show('lib');
  try {
    const books = await api('GET', '/api/books');
    say($('lib-msg'), books.length ? `${books.length} libri` : 'La libreria è vuota');
    const grid = $('grid');
    grid.replaceChildren();
    $('retry-all').hidden = !books.some((b) => b.lookup === 'failed');
    for (const b of books) {
      const li = document.createElement('li');
      if (b.cover) { const img = document.createElement('img'); img.src = `/covers/${b.cover}`; img.alt = ''; li.append(img); }
      else { const ph = document.createElement('span'); ph.className = 'ph'; ph.textContent = b.title || b.isbn; li.append(ph); }
      const t = document.createElement('span'); t.className = 't'; t.textContent = b.title || b.isbn;
      const a = document.createElement('span'); a.className = 'a'; a.textContent = b.authors.join(', ');
      const del = document.createElement('button'); del.type = 'button'; del.className = 'danger'; del.textContent = 'Elimina';
      del.addEventListener('click', async () => {
        if (!confirm(`Eliminare «${b.title || b.isbn}»?`)) return;
        del.disabled = true;
        try { await api('DELETE', `/api/books/${b.isbn}`); li.remove(); } catch (e) { say($('lib-msg'), e.message, true); del.disabled = false; }
      });
      li.append(t, a);
      if (b.lookup === 'failed') {
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
  } catch (e) { if (e.status !== 401) say($('lib-msg'), e.message, true); }
}

$('retry-all').addEventListener('click', async () => {
  $('retry-all').disabled = true;
  say($('lib-msg'), 'Cerco i libri senza dati…');
  try {
    const r = await api('POST', '/api/books/lookup-failed');
    await loadLibrary();
    say($('lib-msg'), `Trovati i dati di ${r.found} libri su ${r.retried}`);
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
    say($('scan-msg'), r.book.lookup === 'failed' ? 'Dati ancora non trovati' : 'Dati trovati');
  } catch (e) { say($('scan-msg'), e.message, true); }
  $('card-again').disabled = false;
});
$('tab-scan').addEventListener('click', () => show('scan'));
$('tab-lib').addEventListener('click', loadLibrary);
$('mode-add').addEventListener('click', () => setMode('add'));
$('mode-check').addEventListener('click', () => setMode('check'));
$('verdict-add').addEventListener('click', async () => {
  const b = $('verdict-add');
  b.disabled = true;
  try {
    const r = await api('POST', '/api/books', { isbn: b.dataset.isbn });
    verdict(true, r.book);
    say($('scan-msg'), r.status === 'saved' ? 'Salvato' : 'Già in libreria');
  } catch (e) { say($('scan-msg'), e.message, true); b.disabled = false; }
});
$('camera').addEventListener('click', () => { if (!scanning) startCamera(); });
$('manual-form').addEventListener('submit', (e) => { e.preventDefault(); submitIsbn($('isbn').value); });
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

setMode(mode);
api('GET', '/api/auth/status').then((s) => (s.authenticated ? show('scan') : showLogin())).catch(showLogin);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
