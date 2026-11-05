import { createContext, useContext, useRef, type ReactNode } from 'react';
import type { ReadFilter, SortOrder } from '../lib/books';

// Filtri, ricerca, ordine e posizione della Libreria: vivono sopra le rotte, solo in memoria
// (si perdono chiudendo o ricaricando l'app) e valgono per la voce di cronologia `key` in cui sono stati salvati.
export type LibraryView = {
  key: string;
  state: ReadFilter; genre: string; series: string; author: string;
  incomplete: boolean; minRating: number; order: SortOrder; query: string;
  scrollY: number;
};

type Store = { current: LibraryView | null };
const Ctx = createContext<Store>({ current: null });

export function LibraryViewProvider({ children }: { children: ReactNode }) {
  const ref = useRef<LibraryView | null>(null);
  return <Ctx.Provider value={ref}>{children}</Ctx.Provider>;
}

export const useLibraryView = () => useContext(Ctx);
