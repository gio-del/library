'use strict';
const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { normalize } = require('./lib/isbn');
const { createStore } = require('./lib/store');
const { createAuth } = require('./lib/auth');
const { lookup, fetchCover } = require('./lib/lookup');

const MAX_BODY = 4096;
const MAX_COVER_UPLOAD = 2 * 1024 * 1024;
// campi modificabili a mano dalla scheda, con la lunghezza massima
const EDITABLE = { title: 300, authors: 200, publisher: 200, year: 20, edition: 200, series: 200, pages: 10, language: 50 };
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml',
};
const HEADERS = {
  'content-security-policy': "default-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'permissions-policy': 'camera=(self)',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
};

function readConfig(env) {
  let password = env.AUTH_PASSWORD;
  if (!password && env.AUTH_PASSWORD_FILE) password = fs.readFileSync(env.AUTH_PASSWORD_FILE, 'utf8').replace(/\r?\n$/, '');
  if (!password) throw new Error('manca la password: imposta AUTH_PASSWORD o AUTH_PASSWORD_FILE');
  return {
    host: env.LISTEN_HOST || '127.0.0.1',
    port: Number(env.PORT || 8080),
    dataDir: path.resolve(env.DATA_DIR || './data'),
    user: env.AUTH_USER || 'library',
    password,
  };
}

function createServer({ config, fetchFn = fetch, now = Date.now }) {
  const store = createStore(config.dataDir);
  const auth = createAuth({ user: config.user, password: config.password, now });
  const coversDir = path.join(config.dataDir, 'covers');
  const publicDir = path.join(__dirname, 'public');

  function send(res, status, body, extra = {}) {
    const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
    res.writeHead(status, { ...HEADERS, ...(isJson ? { 'content-type': 'application/json; charset=utf-8' } : {}), ...extra });
    res.end(isJson ? JSON.stringify(body) : body);
  }

  function token(req) {
    const m = /(?:^|;\s*)sid=([0-9a-f]{64})(?:;|$)/.exec(req.headers.cookie || '');
    return m && m[1];
  }

  function readJson(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY) { if (size - c.length <= MAX_BODY) reject(Object.assign(new Error('troppo grande'), { status: 413 })); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        if (size > MAX_BODY) return;
        try {
          const v = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
          if (v && typeof v === 'object' && !Array.isArray(v)) resolve(v); else throw new Error('x');
        } catch { reject(Object.assign(new Error('JSON non valido'), { status: 400 })); }
      });
      req.on('error', reject);
    });
  }

  function readRaw(req, max) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > max) { if (size - c.length <= max) reject(Object.assign(new Error('troppo grande'), { status: 413 })); return; }
        chunks.push(c);
      });
      req.on('end', () => { if (size <= max) resolve(Buffer.concat(chunks)); });
      req.on('error', reject);
    });
  }

  // Cerca i dati del libro e li applica a `book` (lookup:'failed' se non trovati).
  async function saveCover(book, cover) {
    try {
      await fsp.mkdir(coversDir, { recursive: true, mode: 0o700 });
      await fsp.writeFile(path.join(coversDir, `${book.isbn}.jpg`), cover, { mode: 0o600 });
      book.cover = `${book.isbn}.jpg`;
    } catch { /* senza copertina */ }
  }

  async function fillBook(book) {
    delete book.lookup;
    let found = null;
    try { found = await lookup(book.isbn, fetchFn); } catch { /* trattato come non trovato */ }
    if (!found) { book.lookup = 'failed'; return; }
    Object.assign(book, { title: found.title, authors: found.authors, publisher: found.publisher, year: found.year, source: found.source });
    if (found.cover) await saveCover(book, found.cover);
  }

  async function addBook(isbn) {
    if (await store.get(isbn)) return { status: 200, body: { status: 'exists', book: await store.get(isbn) } };
    const book = { isbn, title: '', authors: [], publisher: '', year: '', cover: null, read: false, added: new Date(now()).toISOString() };
    await fillBook(book);
    if (!(await store.add(book))) return { status: 200, body: { status: 'exists', book: await store.get(isbn) } };
    return { status: 201, body: { status: 'saved', book } };
  }

  // Riprova la ricerca di un libro salvato senza dati o senza copertina.
  async function retryBook(isbn) {
    const old = await store.get(isbn);
    if (!old) return null;
    const book = { ...old };
    if (old.lookup !== 'failed') {
      // dati già presenti: si cerca solo la copertina
      const cover = await fetchCover(old.isbn, fetchFn);
      if (cover) await saveCover(book, cover);
    } else await fillBook(book);
    return (await store.replace(book)) || null;
  }

  async function api(req, res, url) {
    const p = url.pathname;
    if (req.method === 'GET' && p === '/api/auth/status') return send(res, 200, { authenticated: auth.valid(token(req)) });
    if (req.method === 'POST' && p === '/api/login') {
      const b = await readJson(req);
      const r = auth.login(String(b.user ?? config.user), String(b.password ?? ''));
      if (r.error === 'troppi') return send(res, 429, { error: 'Troppi tentativi, riprova più tardi' });
      if (r.error) return send(res, 401, { error: 'Credenziali errate' });
      return send(res, 200, { ok: true }, { 'set-cookie': `sid=${r.token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${auth.maxAge}` });
    }
    if (!auth.valid(token(req))) return send(res, 401, { error: 'Accesso richiesto' });
    if (req.method === 'POST' && p === '/api/logout') {
      auth.logout(token(req));
      return send(res, 200, { ok: true }, { 'set-cookie': 'sid=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0' });
    }
    if (req.method === 'GET' && p === '/api/books') return send(res, 200, await store.list());
    if (req.method === 'POST' && p === '/api/books') {
      const isbn = normalize((await readJson(req)).isbn);
      if (!isbn) return send(res, 400, { error: 'ISBN non valido' });
      const r = await addBook(isbn);
      return send(res, r.status, r.body);
    }
    if (req.method === 'POST' && p === '/api/books/lookup-failed') {
      const out = [];
      for (const b of await store.list()) if (b.lookup === 'failed' || !b.cover) { const r = await retryBook(b.isbn); if (r) out.push(r); }
      return send(res, 200, { retried: out.length, found: out.filter((b) => b.lookup !== 'failed').length, books: out });
    }
    const lk = /^\/api\/books\/(\d{13})\/lookup$/.exec(p);
    if (req.method === 'POST' && lk) {
      const book = await retryBook(lk[1]);
      return book ? send(res, 200, { book }) : send(res, 404, { error: 'Non trovato' });
      }
    const one = /^\/api\/(books|lookup)\/([^/]{1,40})$/.exec(p);
    if (req.method === 'GET' && one) {
      let raw = one[2];
      try { raw = decodeURIComponent(raw); } catch { /* resta grezzo, non valido */ }
      const isbn = normalize(raw);
      if (!isbn) return send(res, 400, { error: 'ISBN non valido' });
      if (one[1] === 'books') {
        const book = await store.get(isbn);
        return book ? send(res, 200, book) : send(res, 404, { error: 'Non trovato' });
      }
      // Anteprima dalle fonti per un libro non in libreria: nessuna scrittura, mai un errore.
      try {
        const found = await lookup(isbn, fetchFn);
        return send(res, 200, found ? { isbn, title: found.title, authors: found.authors } : { isbn, title: '', authors: [] });
      } catch { return send(res, 200, { isbn, title: '', authors: [] }); }
    }
    const pt = /^\/api\/books\/(\d{13})$/.exec(p);
    if (req.method === 'PATCH' && pt) {
      const b = await readJson(req);
      const patch = {};
      if ('read' in b) {
        if (typeof b.read !== 'boolean') return send(res, 400, { error: 'Stato non valido' });
        patch.read = b.read;
      }
      for (const [k, max] of Object.entries(EDITABLE)) {
        if (!(k in b)) continue;
        if (k === 'authors') {
          if (!Array.isArray(b.authors) || b.authors.length > 20 || b.authors.some((a) => typeof a !== 'string')) return send(res, 400, { error: 'Autori non validi' });
          patch.authors = b.authors.map((a) => a.trim().slice(0, max)).filter(Boolean);
        } else {
          if (typeof b[k] !== 'string') return send(res, 400, { error: 'Campo non valido' });
          patch[k] = b[k].trim().slice(0, max);
        }
      }
      if (!Object.keys(patch).length) return send(res, 400, { error: 'Stato non valido' });
      const old = await store.get(pt[1]);
      const book = old && (await store.replace({ ...old, ...patch }));
      return book ? send(res, 200, { book }) : send(res, 404, { error: 'Non trovato' });
    }
    const cv = /^\/api\/books\/(\d{13})\/cover$/.exec(p);
    if (req.method === 'PUT' && cv) {
      const img = await readRaw(req, MAX_COVER_UPLOAD);
      if (img.length < 4 || img[0] !== 0xff || img[1] !== 0xd8 || img[2] !== 0xff) return send(res, 400, { error: 'Immagine non valida (serve un JPEG)' });
      const old = await store.get(cv[1]);
      if (!old) return send(res, 404, { error: 'Non trovato' });
      const book = { ...old };
      await saveCover(book, img);
      if (!book.cover) return send(res, 500, { error: 'Copertina non salvata' });
      return send(res, 200, { book: await store.replace(book) });
    }
    const m = /^\/api\/books\/([\d-]{10,17}|\d{9}X)$/.exec(p);
    if (req.method === 'DELETE' && m) {
      const isbn = normalize(m[1]);
      const gone = isbn && (await store.remove(isbn));
      if (!gone) return send(res, 404, { error: 'Non trovato' });
      if (gone.cover) await fsp.rm(path.join(coversDir, gone.cover), { force: true });
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: 'Non trovato' });
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    if (p.startsWith('/api/')) return api(req, res, url);
    if (req.method !== 'GET') return send(res, 405, 'Metodo non consentito');
    const cover = /^\/covers\/(\d{13})\.jpg$/.exec(p);
    if (cover) {
      if (!auth.valid(token(req))) return send(res, 401, 'Accesso richiesto');
      try { return send(res, 200, await fsp.readFile(path.join(coversDir, `${cover[1]}.jpg`)), { 'content-type': 'image/jpeg' }); } catch { return send(res, 404, 'Non trovato'); }
    }
    const name = p === '/' ? 'index.html' : p.slice(1);
    if (!/^[a-z0-9-]+\.(html|css|js|webmanifest|png|svg)$/.test(name)) return send(res, 404, 'Non trovato');
    try { return send(res, 200, await fsp.readFile(path.join(publicDir, name)), { 'content-type': TYPES[path.extname(name)] }); } catch { return send(res, 404, 'Non trovato'); }
  }

  return http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : 'Errore interno' });
      else res.end();
    });
  });
}

module.exports = { createServer, readConfig };

if (require.main === module) {
  const config = readConfig(process.env);
  createServer({ config }).listen(config.port, config.host, () => {
    console.log(`library in ascolto su ${config.host}:${config.port}`);
  });
}
