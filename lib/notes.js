'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');

const MAX_HISTORY = 20;
const MAX_TEXT = 100000;

// Note libere in DATA_DIR/notes.json: testo, revisione e versioni sovrascritte da un altro dispositivo.
// Vince l'ultima scrittura; se chi scrive non aveva visto l'ultima revisione, il testo
// sostituito resta in `history`.
function createNotes(dataDir) {
  const file = path.join(dataDir, 'notes.json');
  let state = null;
  let chain = Promise.resolve();

  async function load() {
    if (state) return;
    try {
      const s = JSON.parse(await fs.readFile(file, 'utf8'));
      state = { text: String(s.text || ''), rev: Number(s.rev) || 0, updated: s.updated || null, history: Array.isArray(s.history) ? s.history : [] };
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      state = { text: '', rev: 0, updated: null, history: [] };
    }
  }

  async function save(next) {
    await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
    await fs.rename(tmp, file);
    state = next;
  }

  function serial(fn) {
    const run = chain.then(async () => { await load(); return fn(); });
    chain = run.catch(() => {});
    return run;
  }

  return {
    get: () => serial(() => ({ ...state })),
    // `rev`: la revisione su cui si è basato chi scrive. `overwritten` = ha sostituito una versione che non aveva visto.
    put: (text, rev, at) => serial(async () => {
      if (text === state.text) return { ...state, overwritten: false };
      const overwritten = rev !== state.rev;
      const history = overwritten && state.text.trim()
        ? [{ text: state.text, updated: state.updated }, ...state.history].slice(0, MAX_HISTORY)
        : state.history;
      await save({ text, rev: state.rev + 1, updated: at, history });
      return { ...state, overwritten };
    }),
  };
}

module.exports = { createNotes, MAX_TEXT };
