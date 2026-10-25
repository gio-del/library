'use strict';
// Genera le icone PNG in public/ senza dipendenze: node tools/make-icons.js
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const BG = [0x2d, 0x3a, 0x4a];
const PAGE = [0xf6, 0xf4, 0xef];
const COVER = [0x3b, 0x6e, 0xa5];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (const b of buf) {
    c = (crc ^ b) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// Libro aperto stilizzato; `scale` è la frazione del lato occupata dal libro.
function pixel(x, y, size, scale, rounded) {
  const u = x / size, v = y / size;
  if (rounded) {
    const r = 0.18, cx = Math.min(Math.max(u, r), 1 - r), cy = Math.min(Math.max(v, r), 1 - r);
    if ((u - cx) ** 2 + (v - cy) ** 2 > r * r) return [0, 0, 0, 0];
  }
  const s = scale / 2;
  const du = (u - 0.5) / s, dv = (v - 0.5) / s; // coordinate del libro in [-1, 1]
  const inBook = Math.abs(du) <= 1 && dv >= -0.7 && dv <= 0.7;
  if (!inBook) return [...BG, 255];
  if (Math.abs(du) < 0.04) return [...COVER, 255]; // dorso
  if (Math.abs(du) > 0.9 || dv > 0.62 || dv < -0.62) return [...COVER, 255]; // copertina
  if (dv > -0.4 && dv < 0.4 && Math.abs(Math.round(dv * 10)) % 2 === 1 && Math.abs(du) > 0.2 && Math.abs(du) < 0.8) return [...COVER, 255]; // righe
  return [...PAGE, 255];
}

function png(size, scale, rounded) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) Buffer.from(pixel(x + 0.5, y + 0.5, size, scale, rounded)).copy(row, 1 + x * 4);
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = path.join(__dirname, '..', 'public');
for (const size of [192, 512]) {
  fs.writeFileSync(path.join(out, `icon-${size}.png`), png(size, 0.7, true));
  // maskable: sfondo a tutta pagina, libro dentro la zona sicura (80% centrale)
  fs.writeFileSync(path.join(out, `icon-maskable-${size}.png`), png(size, 0.5, false));
}
