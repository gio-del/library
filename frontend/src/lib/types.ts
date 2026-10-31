export interface Book {
  isbn: string;
  title?: string;
  authors: string[];
  publisher?: string;
  year?: string | number;
  edition?: string;
  series?: string;
  pages?: string | number;
  language?: string;
  notes?: string;
  genres?: string[];
  cover?: string | null;
  read?: boolean;
  rating?: number;
  readAt?: string;
  lookup?: string;
  source?: string;
  added?: string;
}

export interface NotesVersion { text: string; updated?: string }

export interface Candidate {
  isbn: string;
  title: string;
  authors: string[];
  publisher: string;
  year: string;
  pages: string;
  language: string;
  source: string;
}

export interface WishItem {
  isbn: string;
  title?: string;
  authors: string[];
  cover?: string | null;
  added?: string;
}
