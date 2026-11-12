import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface ToastAction { label: string; onClick(): void }
interface ToastValue { toast(text: string, error?: boolean, action?: ToastAction): void }
const Ctx = createContext<ToastValue>({ toast: () => {} });

// Avviso breve sopra la barra in basso; resta in una regione `aria-live`, così i lettori di schermo lo annunciano.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<{ text: string; error: boolean; action?: ToastAction } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toast = useCallback((text: string, error = false, action?: ToastAction) => {
    clearTimeout(timer.current);
    setT({ text, error, action });
    timer.current = setTimeout(() => setT(null), action ? 8000 : error ? 6000 : 3500);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 flex justify-center">
        {t && (
          <div role={t.error ? 'alert' : undefined} className={cn('pointer-events-auto flex max-w-md items-center gap-2 rounded-xl px-4 py-1 text-sm font-medium text-white shadow-lg motion-safe:animate-[toast-in_.2s_ease-out]', t.error ? 'bg-ko' : 'bg-plum')}>
            <p className="py-2">{t.text}</p>
            {t.action && (
              <button type="button" onClick={() => { const a = t.action; clearTimeout(timer.current); setT(null); a?.onClick(); }} className="-mr-2 min-h-11 min-w-11 shrink-0 rounded-lg px-3 font-semibold underline underline-offset-2">{t.action.label}</button>
            )}
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
