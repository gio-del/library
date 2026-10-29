export interface CoverRead {
  title: string;
  subtitle: string;
  authors: string[];
  publisher: string;
  language: string;
  confidence: Record<string, number>;
}

export const READ_LABELS: Record<string, string> = { title: 'Titolo', authors: 'Autori', publisher: 'Editore', language: 'Lingua' };

// Riempie solo i campi vuoti del modulo; ritorna le chiavi compilate.
export function fillFromRead(form: Record<string, string>, read: CoverRead): { form: Record<string, string>; filled: string[] } {
  const found: Record<string, string> = { title: read.title, authors: read.authors.join(', '), publisher: read.publisher, language: read.language };
  const next = { ...form };
  const filled: string[] = [];
  for (const [k, v] of Object.entries(found)) {
    if (v && !(form[k] ?? '').trim()) { next[k] = v; filled.push(k); }
  }
  return { form: next, filled };
}
