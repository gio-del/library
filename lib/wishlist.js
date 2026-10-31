'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');

// Libri da comprare in DATA_DIR/wishlist.json; scrittura atomica (file temporaneo + rename) con copia .bak, una alla volta.
function createWishlist(dataDir) {
  const file = path.join(dataDir, 'wishlist.json');
  const backup = `${file}.bak`;
  let items = null;
  let chain = Promise.resolve();
  let fromBackup = false;

  async function load() {
    if (items) return;
    const read = async (f) => {
      const v = JSON.parse(await fs.readFile(f, 'utf8'));
      if (!Array.isArray(v)) throw new Error(`${path.basename(f)} non è una lista`);
      return v;
    };
    try {
      items = await read(file);
    } catch (e) {
      if (e.code === 'ENOENT') items = [];
      else {
        try { items = await read(backup); } catch { throw e; }
        fromBackup = true;
        console.warn(`wishlist.json illeggibile (${e.message}): si riparte da wishlist.json.bak`);
      }
    }
  }

  async function save() {
    await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(items, null, 2) + '\n', { mode: 0o600 });
    if (!fromBackup) {
      try { await fs.copyFile(file, backup); await fs.chmod(backup, 0o600); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
    await fs.rename(tmp, file);
    fromBackup = false;
  }

  function serial(fn) {
    const run = chain.then(async () => { await load(); return fn(); });
    chain = run.catch(() => {});
    return run;
  }

  return {
    list: () => serial(() => items.slice()),
    get: (isbn) => serial(() => items.find((b) => b.isbn === isbn) || null),
    add: (item) => serial(async () => {
      if (items.some((b) => b.isbn === item.isbn)) return false;
      items.push(item);
      try { await save(); } catch (e) { items.pop(); throw e; }
      return true;
    }),
    remove: (isbn) => serial(async () => {
      const i = items.findIndex((b) => b.isbn === isbn);
      if (i < 0) return null;
      const [gone] = items.splice(i, 1);
      try { await save(); } catch (e) { items.splice(i, 0, gone); throw e; }
      return gone;
    }),
  };
}

module.exports = { createWishlist };
