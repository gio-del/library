'use strict';

// Normalizza un ISBN-10 o ISBN-13 (con trattini/spazi) in ISBN-13, o null se non valido.
function normalize(input) {
  if (typeof input !== 'string') return null;
  const s = input.replace(/[\s-]/g, '').toUpperCase();
  if (/^\d{13}$/.test(s)) return checkDigit13(s.slice(0, 12)) === s[12] ? s : null;
  if (/^\d{9}[\dX]$/.test(s)) {
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += (10 - i) * (s[i] === 'X' ? 10 : Number(s[i]));
    if (sum % 11 !== 0) return null;
    const base = '978' + s.slice(0, 9);
    return base + checkDigit13(base);
  }
  return null;
}

function checkDigit13(twelve) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(twelve[i]) * (i % 2 ? 3 : 1);
  return String((10 - (sum % 10)) % 10);
}

module.exports = { normalize };
