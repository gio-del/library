'use strict';
const crypto = require('node:crypto');

const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
const MAX_FAILS = 5;
const FAIL_WINDOW_MS = 15 * 60 * 1000;

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Sessioni in memoria; i tentativi falliti sono contati insieme (dietro il proxy l'IP è sempre lo stesso).
function createAuth({ user, password, now = Date.now }) {
  const sessions = new Map();
  let fails = [];

  return {
    login(u, p) {
      fails = fails.filter((t) => now() - t < FAIL_WINDOW_MS);
      if (fails.length >= MAX_FAILS) return { error: 'troppi' };
      const ok = safeEqual(u, user) & safeEqual(p, password); // eslint-disable-line no-bitwise
      if (!ok) { fails.push(now()); return { error: 'credenziali' }; }
      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, now() + SESSION_TTL_MS);
      return { token };
    },
    valid(token) {
      const exp = token && sessions.get(token);
      if (!exp) return false;
      if (exp < now()) { sessions.delete(token); return false; }
      return true;
    },
    logout(token) { sessions.delete(token); },
    maxAge: SESSION_TTL_MS / 1000,
  };
}

module.exports = { createAuth };
