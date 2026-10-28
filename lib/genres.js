'use strict';

// Elenco breve di generi; il primo modello che combacia con un soggetto (minuscolo) assegna il genere.
const RULES = [
  ['Romance', /romanc|love stor|chick lit|romantic|romanzo rosa|storie d'amore/],
  ['Horror', /horror|ghost|vampire|zombie|occult|gothic|orrore|terrore/],
  ['Fantasy', /fantasy|fantastic|magic|wizard|dragon|fairy|elves|fantastico/],
  ['Fantascienza', /science fiction|sci-fi|dystopia|space opera|cyberpunk|fantascienza|distopi/],
  ['Giallo', /mystery|detective|thriller|crime|suspense|noir|giallo|polizies|spy|spies/],
  ['Storico', /histor(ical fiction|ic fiction)|romanzo storico|historical novel/],
  ['Biografia', /biograph|autobiograph|memoir|biografi/],
  ['Saggio', /essay|non-?fiction|philosoph|psycholog|politic|econom|science|histor|religio|self-help|saggi|storia|filosofia/],
  ['Ragazzi', /juvenile|children|young adult|ragazzi|bambini|picture book/],
  ['Fumetti', /comic|graphic novel|manga|fumett/],
  ['Poesia', /poetry|poems|poesi|poemi/],
  ['Narrativa', /fiction|novel|stories|narrativa|romanzi|literature|letteratura/],
];

const NONE = 'Senza genere';
const OTHER = 'Altro';
const MAX_GENRES = 5;

// Soggetti grezzi delle fonti -> elenco di generi coerenti. Nessun soggetto = «Senza genere»,
// soggetti non riconosciuti = «Altro».
function classify(subjects) {
  const list = (Array.isArray(subjects) ? subjects : []).filter((s) => typeof s === 'string' && s.trim());
  if (!list.length) return [NONE];
  const out = [];
  for (const s of list) {
    const low = s.toLowerCase();
    const hit = RULES.find(([, re]) => re.test(low));
    if (hit && !out.includes(hit[0])) out.push(hit[0]);
  }
  return out.length ? out.slice(0, MAX_GENRES) : [OTHER];
}

module.exports = { classify, NONE, OTHER, MAX_GENRES };
