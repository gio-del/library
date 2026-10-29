'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');

const MIN_GOAL = 1;
const MAX_GOAL = 999;

// Obiettivo di lettura annuale in DATA_DIR/goal.json: `{ goal: numero | null }`, valido su tutti i dispositivi.
function createGoal(dataDir) {
  const file = path.join(dataDir, 'goal.json');
  let state = null;
  let chain = Promise.resolve();

  async function load() {
    if (state) return;
    try {
      const n = Number(JSON.parse(await fs.readFile(file, 'utf8')).goal);
      state = { goal: isValid(n) ? n : null };
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      state = { goal: null };
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
    put: (goal) => serial(async () => { await save({ goal }); return { ...state }; }),
  };
}

function isValid(n) {
  return Number.isInteger(n) && n >= MIN_GOAL && n <= MAX_GOAL;
}

module.exports = { createGoal, isValid };
