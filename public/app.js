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
let genre = '';
let detailBook = null;
let notesRev = 0;
let notesSaved = '';
let notesTimer = null;
let notesBusy = false;

const hasIsbn = (b) => /^\d{13}$/.test(b.isbn);
const needsRetry = (b) => hasIsbn(b) && (b.lookup === 'failed' || !b.cover);

async function api(method, url, body) {
  const res = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && url !== '/api/login') showLogin();
  if (!res.ok) throw Object.assign(new Error(data.error || 'Errore'), { status: res.status });
  return data;
}

function say(el, text, err) { el.textContent = text; el.classList.toggle('err', !!err); }

function show(name) {
  for (const s of ['login', 'scan', 'lib', 'detail', 'manual', 'notes']) $(s).hidden = s !== name;
  $('nav').hidden = name === 'login';
  if (name !== 'scan') stopCamera();
}

function showLogin() { show('login'); }

function fillCard(book) {
  cardBook = book;
  $('card').hidden = false;
  $('card-title').textContent = book.title || 'Titolo sconosciuto';
  $('card-authors').textContent = book.authors.join(', ');
  $('card-meta').textContent = [book.publisher, book.year, hasIsbn(book) ? book.isbn : ''].filter(Boolean).join(' · ');
  $('card-cover').hidden = !book.cover;
  $('card-again').hidden = !needsRetry(book);
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
  $('verdict-text').textContent = yes ? 'Ce l’hai già' : (book.isbn ? 'Non ce l’hai: lo aggiungo?' : 'Non ce l’hai');
  $('verdict-title').textContent = book.title || '';
  $('verdict-authors').textContent = (book.authors || []).join(', ');
  $('verdict-cover').hidden = !(yes && book.cover);
  if (yes && book.cover) $('verdict-cover').src = `/covers/${book.cover}`;
  current = book;
  $('verdict-add').hidden = yes || !book.isbn;
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

// Ricerca per titolo o autore tra i libri già in libreria.
async function searchText(q) {
  const seq = ++checkSeq;
  $('card').hidden = true;
  $('verdict').hidden = true;
  say($('scan-msg'), 'Cerco…');
  try {
    const found = await api('GET', `/api/books?q=${encodeURIComponent(q)}`);
    if (seq !== checkSeq) return;
    if (!found.length) {
      verdict(false, {});
      $('verdict-text').textContent = 'Non ce l’hai';
      say($('scan-msg'), '');
      return;
    }
    say($('scan-msg'), found.length === 1 ? 'Ce l’hai già' : `${found.length} libri trovati`);
    for (const b of found.slice(0, 20)) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = [b.title || 'Senza titolo', (b.authors || []).join(', ')].filter(Boolean).join(' — ');
      btn.addEventListener('click', () => { verdict(true, b); });
      li.append(btn);
      $('results').append(li);
    }
    if (found.length === 1) verdict(true, found[0]);
  } catch (e) { if (seq === checkSeq) say($('scan-msg'), e.message, true); }
}

function looksLikeIsbn(text) { return /^[\d\sXx-]{10,17}$/.test(text.trim()); }

async function checkIsbn(isbn) {
  const seq = ++checkSeq;
  $('results').replaceChildren();
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

// «Senza genere» non esiste più: i libri salvati prima con quel genere compaiono sotto «Altro» finché non si rileggono i generi
const bookGenres = (b) => {
  const g = (Array.isArray(b.genres) ? b.genres : []).filter((x) => x !== 'Senza genere');
  return g.length ? g : ['Altro'];
};
const matchRead = (b) => filter === 'all' || (filter === 'read') === !!b.read;

// Pulsanti dei generi con il numero di libri, calcolati sul filtro letto / da leggere attivo.
function renderGenres() {
  const box = $('genres');
  const counts = new Map();
  for (const b of libBooks.filter(matchRead)) for (const g of bookGenres(b)) counts.set(g, (counts.get(g) || 0) + 1);
  if (genre && !counts.has(genre)) counts.set(genre, 0);
  box.replaceChildren();
  const add = (label, value) => {
    const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = label;
    btn.classList.toggle('on', genre === value);
    btn.addEventListener('click', () => { genre = value; renderLibrary(); });
    box.append(btn);
  };
  add(`Tutti i generi (${libBooks.filter(matchRead).length})`, '');
  for (const [g, c] of [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'it'))) add(`${g} (${c})`, g);
  box.hidden = !libBooks.length;
}

function renderLibrary() {
  const n = (f) => libBooks.filter(f).length;
  const nRead = n((b) => b.read);
  $('f-all').textContent = `Tutti (${libBooks.length})`;
  $('f-toread').textContent = `Da leggere (${libBooks.length - nRead})`;
  $('f-read').textContent = `Letti (${nRead})`;
  for (const [id, f] of [['f-all', 'all'], ['f-toread', 'toread'], ['f-read', 'read']]) $(id).classList.toggle('on', filter === f);
  renderGenres();
  const shown = libBooks.filter((b) => matchRead(b) && (!genre || bookGenres(b).includes(genre)));
  say($('lib-msg'), !libBooks.length ? 'La libreria è vuota' : shown.length ? `${shown.length} libri` : 'Nessun libro in questo elenco');
  const grid = $('grid');
  grid.replaceChildren();
  $('retry-all').hidden = !libBooks.some(needsRetry);
  for (const b of shown) {
    const li = document.createElement('li');
    if (b.cover) { const img = document.createElement('img'); img.src = `/covers/${b.cover}`; img.alt = ''; li.append(img); }
    else { const ph = document.createElement('span'); ph.className = 'ph'; ph.textContent = b.title || (hasIsbn(b) ? b.isbn : 'Senza titolo'); li.append(ph); }
    const badge = document.createElement('span'); badge.className = b.read ? 'badge read' : 'badge'; badge.textContent = b.read ? 'Letto' : 'Da leggere';
    const t = document.createElement('span'); t.className = 't'; t.textContent = b.title || (hasIsbn(b) ? b.isbn : 'Senza titolo');
    const a = document.createElement('span'); a.className = 'a'; a.textContent = b.authors.join(', ');
    const rd = document.createElement('button'); rd.type = 'button'; rd.textContent = b.read ? 'Segna da leggere' : 'Segna letto';
    rd.addEventListener('click', async () => {
      try { await toggleRead(b, rd); renderLibrary(); } catch (e) { say($('lib-msg'), e.message, true); }
    });
    const del = document.createElement('button'); del.type = 'button'; del.className = 'danger'; del.textContent = 'Elimina';
    del.addEventListener('click', async () => {
      if (!confirm(`Eliminare «${b.title || (hasIsbn(b) ? b.isbn : 'Senza titolo')}»?`)) return;
      del.disabled = true;
      try { await api('DELETE', `/api/books/${b.isbn}`); libBooks = libBooks.filter((x) => x.isbn !== b.isbn); renderLibrary(); } catch (e) { say($('lib-msg'), e.message, true); del.disabled = false; }
    });
    li.classList.add('open-card');
    li.addEventListener('click', (ev) => { if (ev.target.closest && ev.target.closest('button')) return; openDetail(b); });
    li.append(badge, t, a, rd);
    if (needsRetry(b)) {
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

// ISBN-10 ricavato dall'ISBN-13 con prefisso 978 (con 979 non esiste).
function isbn10Of(isbn13) {
  if (!/^978\d{10}$/.test(isbn13)) return '';
  const core = isbn13.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(core[i]) * (10 - i);
  const c = (11 - (sum % 11)) % 11;
  return core + (c === 10 ? 'X' : String(c));
}

const SOURCES = { openlibrary: 'Open Library', sbn: 'SBN', amazon: 'Amazon' };

function detailRows(b) {
  const added = b.added && !Number.isNaN(Date.parse(b.added)) ? new Date(b.added).toLocaleDateString('it-IT') : '';
  return [
    ['Autori', (b.authors || []).join(', ')], ['Edizione', b.edition], ['Editore', b.publisher], ['Anno', b.year],
    ['Generi', bookGenres(b).join(', ')], ['Collana', b.series], ['Pagine', b.pages], ['Lingua', b.language],
    ['Note', b.notes], ['ISBN-13', hasIsbn(b) ? b.isbn : ''], ['ISBN-10', isbn10Of(b.isbn)],
    ['Fonte dei dati', SOURCES[b.source] || b.source], ['Aggiunto il', added],
  ].filter(([, v]) => v);
}

function paintDetail(b) {
  detailBook = b;
  $('d-title').textContent = b.title || 'Titolo sconosciuto';
  $('d-cover').hidden = !b.cover;
  if (b.cover) $('d-cover').src = `/covers/${b.cover}?v=${Date.now()}`;
  $('d-state').textContent = b.read ? 'Letto' : 'Da leggere';
  $('d-state').className = b.read ? 'badge read' : 'badge';
  $('d-read').textContent = b.read ? 'Segna come da leggere' : 'Segna come letto';
  const dl = $('d-fields');
  dl.replaceChildren();
  for (const [k, v] of detailRows(b)) {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = String(v);
    dl.append(dt, dd);
  }
}

function openDetail(b) {
  show('detail');
  say($('d-msg'), '');
  $('d-form').hidden = true;
  $('d-actions').hidden = false;
  paintDetail(b);
}

const EDIT = ['title', 'edition', 'publisher', 'year', 'series', 'pages', 'language', 'notes'];

function editDetail() {
  for (const k of EDIT) $(`e-${k}`).value = detailBook[k] || '';
  $('e-authors').value = (detailBook.authors || []).join(', ');
  $('e-genres').value = (detailBook.genres || []).join(', ');
  $('d-form').hidden = false;
  $('d-actions').hidden = true;
}

// Scala e ricodifica in JPEG: il server accetta solo JPEG.
async function toJpeg(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1000 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((bl) => (bl ? resolve(bl) : reject(new Error('Immagine non leggibile'))), 'image/jpeg', 0.85));
}

async function saveDetail(ev) {
  ev.preventDefault();
  const body = { authors: $('e-authors').value.split(',').map((x) => x.trim()).filter(Boolean) };
  const genres = $('e-genres').value.split(',').map((x) => x.trim()).filter(Boolean);
  if (genres.join('|') !== (detailBook.genres || []).join('|')) body.genres = genres;
  for (const k of EDIT) body[k] = $(`e-${k}`).value;
  try {
    const r = await api('PATCH', `/api/books/${detailBook.isbn}`, body);
    const i = libBooks.findIndex((x) => x.isbn === r.book.isbn);
    if (i >= 0) libBooks[i] = r.book;
    openDetail(r.book);
    say($('d-msg'), 'Salvato');
  } catch (e) { say($('d-msg'), e.message, true); }
}

async function changeCover() {
  const file = $('d-cover-file').files && $('d-cover-file').files[0];
  if (!file) return;
  say($('d-msg'), 'Carico la copertina…');
  try {
    const blob = await toJpeg(file);
    const res = await fetch(`/api/books/${detailBook.isbn}/cover`, { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: blob });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Errore');
    const i = libBooks.findIndex((x) => x.isbn === data.book.isbn);
    if (i >= 0) libBooks[i] = data.book;
    paintDetail(data.book);
    say($('d-msg'), 'Copertina cambiata');
  } catch (e) { say($('d-msg'), e.message, true); }
  $('d-cover-file').value = '';
}

async function loadLibrary() {
  show('lib');
  try {
    libBooks = await api('GET', '/api/books');
    renderLibrary();
  } catch (e) { if (e.status !== 401) say($('lib-msg'), e.message, true); }
}

for (const [id, f] of [['f-all', 'all'], ['f-toread', 'toread'], ['f-read', 'read']]) $(id).addEventListener('click', () => { filter = f; renderLibrary(); });
$('d-back').addEventListener('click', () => { renderLibrary(); show('lib'); });
$('d-edit').addEventListener('click', editDetail);
$('d-cancel').addEventListener('click', () => { $('d-form').hidden = true; $('d-actions').hidden = false; });
$('d-form').addEventListener('submit', saveDetail);
$('d-cover-file').addEventListener('change', changeCover);
$('d-read').addEventListener('click', async () => {
  try { const b = await toggleRead(detailBook, $('d-read')); if (b) paintDetail(b); } catch (e) { say($('d-msg'), e.message, true); }
});
$('d-delete').addEventListener('click', async () => {
  if (!confirm(`Eliminare «${detailBook.title || 'Senza titolo'}»?`)) return;
  try {
    await api('DELETE', `/api/books/${detailBook.isbn}`);
    libBooks = libBooks.filter((x) => x.isbn !== detailBook.isbn);
    renderLibrary();
    show('lib');
  } catch (e) { say($('d-msg'), e.message, true); }
});
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
$('reclassify').addEventListener('click', async () => {
  $('reclassify').disabled = true;
  say($('lib-msg'), 'Rileggo i generi…');
  try {
    const r = await api('POST', '/api/books/classify');
    libBooks = r.books;
    renderLibrary();
    say($('lib-msg'), `Generi aggiornati su ${r.changed} libri`);
  } catch (e) { say($('lib-msg'), e.message, true); }
  $('reclassify').disabled = false;
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
function renderHistory(history) {
  $('notes-hist').hidden = !history.length;
  $('notes-hist-list').replaceChildren(...history.map((h) => {
    const li = document.createElement('li');
    const when = document.createElement('p');
    when.textContent = h.updated ? new Date(h.updated).toLocaleString('it-IT') : '';
    const pre = document.createElement('p');
    pre.textContent = h.text;
    pre.style.whiteSpace = 'pre-wrap';
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'Usa questa versione';
    b.addEventListener('click', () => { $('notes-text').value = h.text; saveNotes(); });
    li.append(when, pre, b);
    return li;
  }));
}

// Salvataggio automatico: una richiesta alla volta, sempre con l'ultimo testo.
async function saveNotes() {
  clearTimeout(notesTimer);
  if (notesBusy) { notesTimer = setTimeout(saveNotes, 300); return; }
  const text = $('notes-text').value;
  if (text === notesSaved) return;
  notesBusy = true;
  say($('notes-msg'), 'Salvataggio…');
  try {
    const r = await api('PUT', '/api/notes', { text, rev: notesRev });
    notesRev = r.rev;
    notesSaved = text;
    renderHistory(r.history);
    say($('notes-msg'), r.overwritten ? 'Salvato. Un altro dispositivo aveva modificato le note: la sua versione è in «Versioni precedenti».' : 'Salvato', r.overwritten);
    if ($('notes-text').value !== text) notesTimer = setTimeout(saveNotes, 300);
  } catch (e) { say($('notes-msg'), `Non salvato: ${e.message}`, true); notesTimer = setTimeout(saveNotes, 5000); }
  notesBusy = false;
}

async function loadNotes() {
  show('notes');
  say($('notes-msg'), '');
  if ($('notes-text').value !== notesSaved) return; // modifiche non ancora salvate: non si sovrascrivono
  try {
    const r = await api('GET', '/api/notes');
    notesRev = r.rev;
    notesSaved = r.text;
    $('notes-text').value = r.text;
    $('notes-text').disabled = false;
    renderHistory(r.history);
  } catch (e) { if (e.status !== 401) say($('notes-msg'), e.message, true); }
}

$('tab-notes').addEventListener('click', loadNotes);
$('notes-text').addEventListener('input', () => { clearTimeout(notesTimer); notesTimer = setTimeout(saveNotes, 800); });
$('notes-text').addEventListener('blur', saveNotes);
if (document.addEventListener) document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNotes(); });
const MANUAL = ['title', 'publisher', 'year', 'edition', 'language', 'pages', 'notes'];

function openManual() {
  const t = $('isbn').value.trim();
  for (const k of MANUAL) $(`m-${k}`).value = '';
  $('m-authors').value = '';
  $('m-isbn').value = looksLikeIsbn(t) ? t : '';
  $('m-title').value = looksLikeIsbn(t) ? '' : t;
  $('m-cover').value = '';
  $('m-cover-name').textContent = '';
  say($('m-msg'), '');
  show('manual');
}

async function uploadCover(book, file) {
  const blob = await toJpeg(file);
  const res = await fetch(`/api/books/${book.isbn}/cover`, { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: blob });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Errore');
  return data.book;
}

async function saveManual(ev) {
  ev.preventDefault();
  const body = { manual: true, isbn: $('m-isbn').value, authors: $('m-authors').value.split(',').map((x) => x.trim()).filter(Boolean) };
  for (const k of MANUAL) body[k] = $(`m-${k}`).value;
  const btn = ev.target.querySelector ? ev.target.querySelector('button[type=submit]') : null;
  if (btn) btn.disabled = true;
  try {
    let r;
    try { r = await api('POST', '/api/books', body); } catch (e) {
      if (e.status !== 409) throw e;
      if (!confirm(`${e.message}. Aggiungerlo comunque?`)) { say($('m-msg'), e.message, true); return; }
      r = await api('POST', '/api/books', { ...body, force: true });
    }
    let book = r.book;
    let coverErr = false;
    const file = $('m-cover').files && $('m-cover').files[0];
    if (file && r.status === 'saved') {
      try { book = await uploadCover(book, file); } catch (e) { coverErr = true; say($('scan-msg'), `Salvato, ma la copertina no: ${e.message}`, true); }
    }
    libBooks = libBooks.filter((x) => x.isbn !== book.isbn).concat(book);
    show('scan');
    verdict(true, book);
    if (!coverErr) say($('scan-msg'), r.status === 'saved' ? 'Salvato' : 'Già in libreria');
  } catch (e) { say($('m-msg'), e.message, true); } finally { if (btn) btn.disabled = false; }
}

$('add-manual').addEventListener('click', openManual);
$('m-form').addEventListener('submit', saveManual);
$('m-cancel').addEventListener('click', () => show('scan'));
$('m-cover').addEventListener('change', () => { const f = $('m-cover').files && $('m-cover').files[0]; $('m-cover-name').textContent = f ? f.name : ''; });
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
    if (r.status === 'saved') $('verdict-text').textContent = 'Aggiunto alla libreria';
    say($('scan-msg'), '');
  } catch (e) { saving = false; say($('scan-msg'), e.message, true); b.disabled = false; }
});
$('camera').addEventListener('click', () => { if (!scanning) startCamera(); });
$('manual-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('isbn').value.trim();
  if (!v) return;
  $('results').replaceChildren();
  if (looksLikeIsbn(v)) checkIsbn(v); else searchText(v);
});
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
