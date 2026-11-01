'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
const MAX_FAILS = 5;
const FAIL_WINDOW_MS = 15 * 60 * 1000;

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

// Sessioni in memoria, salvate (solo l'hash del token) in DATA_DIR/sessions.json se c'è dataDir;
// i tentativi falliti restano in memoria e sono contati insieme (dietro il proxy l'IP è sempre lo stesso).
function createAuth({ user, password, now = Date.now, dataDir }) {
  const sessions = new Map(); // hash del token -> scadenza
  const file = dataDir && path.join(dataDir, 'sessions.json');
  let fails = [];

  function save() {
    if (!file) return;
    try {
      fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(sessions)) + '\n', { mode: 0o600 });
      fs.renameSync(tmp, file);
    } catch (e) {
      console.warn(`sessions.json non salvato: ${e.message}`);
    }
  }

  function prune() {
    let changed = false;
    for (const [h, exp] of sessions) if (exp < now()) { sessions.delete(h); changed = true; }
    return changed;
  }

  if (file) {
    try {
      const v = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('formato non valido');
      for (const [h, exp] of Object.entries(v)) if (/^[0-9a-f]{64}$/.test(h) && Number.isFinite(exp)) sessions.set(h, exp);
      if (prune()) save();
    } catch (e) {
      if (e.code !== 'ENOENT') console.warn(`sessions.json illeggibile (${e.message}): si riparte senza sessioni`);
    }
  }

  return {
    login(u, p) {
      fails = fails.filter((t) => now() - t < FAIL_WINDOW_MS);
      if (fails.length >= MAX_FAILS) return { error: 'troppi' };
      const ok = safeEqual(u, user) & safeEqual(p, password); // eslint-disable-line no-bitwise
      if (!ok) { fails.push(now()); return { error: 'credenziali' }; }
      const token = crypto.randomBytes(32).toString('hex');
      prune();
      sessions.set(hashToken(token), now() + SESSION_TTL_MS);
      save();
      return { token };
    },
    valid(token) {
      if (!token) return false;
      const h = hashToken(token);
      const exp = sessions.get(h);
      if (!exp) return false;
      if (exp < now()) { sessions.delete(h); save(); return false; }
      return true;
    },
    logout(token) {
      if (token && sessions.delete(hashToken(token))) save();
    },
    maxAge: SESSION_TTL_MS / 1000,
  };
}

module.exports = { createAuth };
