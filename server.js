'use strict';
const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { normalize } = require('./lib/isbn');
const { createStore } = require('./lib/store');
const { createAuth } = require('./lib/auth');
const { lookup } = require('./lib/lookup');

const MAX_BODY = 4096;
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

  // Cerca i dati del libro e li applica a `book` (lookup:'failed' se non trovati).
  async function fillBook(book) {
    delete book.lookup;
    let found = null;
    try { found = await lookup(book.isbn, fetchFn); } catch { /* trattato come non trovato */ }
    if (!found) { book.lookup = 'failed'; return; }
    Object.assign(book, { title: found.title, authors: found.authors, publisher: found.publisher, year: found.year, source: found.source });
    if (found.cover) {
      try {
        await fsp.mkdir(coversDir, { recursive: true, mode: 0o700 });
        await fsp.writeFile(path.join(coversDir, `${book.isbn}.jpg`), found.cover, { mode: 0o600 });
        book.cover = `${book.isbn}.jpg`;
      } catch { /* senza copertina */ }
    }
  }

  async function addBook(isbn) {
    if (await store.get(isbn)) return { status: 200, body: { status: 'exists', book: await store.get(isbn) } };
    const book = { isbn, title: '', authors: [], publisher: '', year: '', cover: null, added: new Date(now()).toISOString() };
    await fillBook(book);
    if (!(await store.add(book))) return { status: 200, body: { status: 'exists', book: await store.get(isbn) } };
    return { status: 201, body: { status: 'saved', book } };
  }

  // Riprova la ricerca di un libro salvato senza dati.
  async function retryBook(isbn) {
    const old = await store.get(isbn);
    if (!old) return null;
    const book = { ...old };
    await fillBook(book);
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
      for (const b of await store.list()) if (b.lookup === 'failed') { const r = await retryBook(b.isbn); if (r) out.push(r); }
      return send(res, 200, { retried: out.length, found: out.filter((b) => b.lookup !== 'failed').length, books: out });
    }
    const lk = /^\/api\/books\/(\d{13})\/lookup$/.exec(p);
    if (req.method === 'POST' && lk) {
      const book = await retryBook(lk[1]);
      return book ? send(res, 200, { book }) : send(res, 404, { error: 'Non trovato' });
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
