'use strict';
const $ = (id) => document.getElementById(id);
let stream = null;
let scanning = false;

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
  $('card').hidden = false;
  $('card-title').textContent = book.title || 'Titolo sconosciuto';
  $('card-authors').textContent = book.authors.join(', ');
  $('card-meta').textContent = [book.publisher, book.year, book.isbn].filter(Boolean).join(' · ');
  $('card-cover').hidden = !book.cover;
  if (book.cover) $('card-cover').src = `/covers/${book.cover}`;
}

async function submitIsbn(isbn) {
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
      if (codes.length) {
        stopCamera();
        await submitIsbn(codes[0].rawValue);
        return;
      }
    } catch { /* fotogramma non pronto */ }
    setTimeout(tick, 300);
  };
  tick();
}

function stopCamera() {
  scanning = false;
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
    for (const b of books) {
      const li = document.createElement('li');
      if (b.cover) { const img = document.createElement('img'); img.src = `/covers/${b.cover}`; img.alt = ''; li.append(img); }
      const t = document.createElement('span'); t.className = 't'; t.textContent = b.title || b.isbn;
      const a = document.createElement('span'); a.className = 'a'; a.textContent = b.authors.join(', ');
      const del = document.createElement('button'); del.type = 'button'; del.className = 'danger'; del.textContent = 'Elimina';
      del.addEventListener('click', async () => {
        if (!confirm(`Eliminare «${b.title || b.isbn}»?`)) return;
        del.disabled = true;
        try { await api('DELETE', `/api/books/${b.isbn}`); li.remove(); } catch (e) { say($('lib-msg'), e.message, true); del.disabled = false; }
      });
      li.append(t, a, del);
      grid.append(li);
    }
  } catch (e) { if (e.status !== 401) say($('lib-msg'), e.message, true); }
}

$('tab-scan').addEventListener('click', () => show('scan'));
$('tab-lib').addEventListener('click', loadLibrary);
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

api('GET', '/api/auth/status').then((s) => (s.authenticated ? show('scan') : showLogin())).catch(showLogin);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
