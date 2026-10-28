'use strict';

// Elenco breve di generi; il primo modello che combacia con un soggetto (minuscolo) assegna il genere.
const RULES = [
  ['Teatro', /theat|drama|play(s|wright)|teatr|commedia/],
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

const OTHER = 'Altro';
const MAX_GENRES = 5;

// Genere dal numero Dewey (SBN): 741.5 fumetti, 8x1 poesia, 8x2 teatro, 8x3 narrativa, 92x biografie, il resto saggistica.
function fromDewey(dewey) {
  const d = String(dewey || '');
  if (!/^\d{3}/.test(d)) return null;
  if (d.startsWith('741.5')) return 'Fumetti';
  if (/^8\d1/.test(d)) return 'Poesia';
  if (/^8\d2/.test(d)) return 'Teatro';
  if (/^8\d3/.test(d)) return 'Narrativa';
  if (d.startsWith('92')) return 'Biografia';
  return 'Saggio';
}

// Soggetti grezzi delle fonti (+ numero Dewey e titolo, se noti) -> elenco di generi coerenti. Mai «Senza genere»:
// senza alcun indizio o con soggetti non riconosciuti il genere è «Altro».
function classify(subjects, { dewey, title } = {}) {
  const list = (Array.isArray(subjects) ? subjects : []).filter((s) => typeof s === 'string' && s.trim());
  const out = [];
  const add = (g) => { if (g && !out.includes(g)) out.push(g); };
  for (const s of list) {
    const hit = RULES.find(([, re]) => re.test(s.toLowerCase()));
    if (hit) add(hit[0]);
  }
  if (!out.length) add(fromDewey(dewey));
  if (!out.length && typeof title === 'string') {
    const hit = RULES.find(([, re]) => re.test(title.toLowerCase()));
    if (hit) add(hit[0]);
  }
  return out.length ? out.slice(0, MAX_GENRES) : [OTHER];
}

module.exports = { classify, OTHER, MAX_GENRES };
