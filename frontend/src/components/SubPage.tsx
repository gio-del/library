import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// Schermata a sé, senza barra in basso: freccia indietro (alla pagina precedente dell'app, se c'è) e titolo.
export function SubPage({ title, fallback, children }: { title: string; fallback: string; children: ReactNode }) {
  const nav = useNavigate();
  const { key } = useLocation();
  return (
    <div className="min-h-dvh pb-[env(safe-area-inset-bottom)]">
      <header className="sticky top-0 z-20 flex items-center gap-1 border-b-[3px] border-gold bg-plum pb-2 pl-2 pr-4 pt-[calc(.5rem+env(safe-area-inset-top))] text-white">
        <button type="button" aria-label="Indietro" onClick={() => (key === 'default' ? nav(fallback, { replace: true }) : nav(-1))} className="flex size-11 items-center justify-center rounded-full">
          <ArrowLeft aria-hidden />
        </button>
        <h1 className="truncate text-lg font-semibold">{title}</h1>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-4">{children}</main>
    </div>
  );
}
