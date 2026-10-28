'use strict';

// Generi noti; il primo modello che combacia con un testo (minuscolo) assegna il genere. L'ordine conta: i più specifici prima.
const RULES = [
  ['Romantasy', /romantasy|romantic fantasy|fantasy romance|paranormal romance|fantasy romantico/],
  ['Young adult', /young adult|\bya\b|teen(s|age)?\b|adolescen|new adult/],
  ['Distopico', /dystopi|distopi|post-?apocalyp|postapocalit/],
  ['Teatro', /theat|drama|play(s|wright)|teatr|commedia/],
  ['Romance', /romanc|love stor|chick lit|romantic|romanzo rosa|storie d'amore|sentimental/],
  ['Horror', /horror|ghost|vampire|zombie|occult|gothic|orrore|terrore|paura/],
  ['Fantasy', /fantasy|fantastic|magic|magia|wizard|witch|strega|\bmago\b|dragon|\bdrago|fairy|fiaba|elves|elfi|sword and sorcery|\bepic\b|mythic|fantastico/],
  ['Fantascienza', /science fiction|sci-fi|space opera|cyberpunk|time travel|\balien|robot|fantascienza/],
  ['Giallo', /mystery|detective|thriller|crime|suspense|noir|giallo|polizies|investigat|murder|omicidi|\bspy\b|spies|spionagg/],
  ['Storico', /histor(ical fiction|ic fiction|ical novel|ical romance)|romanzo storico|narrativa storica|historical/],
  ['Classici', /classic|classici|\bclassica\b/],
  ['Biografia', /biograph|autobiograph|memoir|biografi|diari[oe]/],
  ['Saggio', /essay|non-?fiction|philosoph|psycholog|politic|econom|science|histor|religio|self-help|business|cooking|travel|health|saggi|storia|filosofia|scienz|manual/],
  ['Ragazzi', /juvenile|children|ragazzi|bambini|picture book|kids/],
  ['Fumetti', /comic|graphic novel|manga|fumett/],
  ['Poesia', /poetry|poems|poesi|poemi/],
  ['Narrativa', /fiction|novel|stories|narrativa|romanzi|literature|letteratura|racconti/],
];

const GENRES = RULES.map(([g]) => g);
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

// Soggetti grezzi delle fonti (+ numero Dewey, titolo e descrizione, se noti) -> elenco di generi coerenti.
// Senza alcun indizio l'elenco è vuoto: il libro compare in «Da classificare». «Altro» non esiste.
function classify(subjects, { dewey, title, description } = {}) {
  const list = (Array.isArray(subjects) ? subjects : []).filter((s) => typeof s === 'string' && s.trim());
  const out = [];
  const add = (g) => { if (g && !out.includes(g)) out.push(g); };
  for (const s of list) {
    const hit = RULES.find(([, re]) => re.test(s.toLowerCase()));
    if (hit) add(hit[0]);
  }
  if (!out.length) add(fromDewey(dewey));
  for (const text of [title, description]) {
    if (out.length || typeof text !== 'string') continue;
    for (const [g, re] of RULES) if (re.test(text.toLowerCase())) add(g);
  }
  return out.slice(0, MAX_GENRES);
}

module.exports = { classify, GENRES, MAX_GENRES };
