// ISBN-13 (978/979) con cifra di controllo corretta: scarta addendum, prezzi e altri codici a barre.
export function validIsbn13(code: string): boolean {
  if (!/^97[89]\d{10}$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(code[i]) * (i % 2 ? 3 : 1);
  return String((10 - (sum % 10)) % 10) === code[12];
}

export const looksLikeIsbn = (text: string) => /^[\d\sXx-]{10,17}$/.test(text.trim());

// ISBN-10 ricavato dall'ISBN-13 con prefisso 978 (con 979 non esiste).
export function isbn10Of(isbn13: string): string {
  if (!/^978\d{10}$/.test(isbn13)) return '';
  const core = isbn13.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(core[i]) * (10 - i);
  const c = (11 - (sum % 11)) % 11;
  return core + (c === 10 ? 'X' : String(c));
}
