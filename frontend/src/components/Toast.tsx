import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '../lib/cn';

interface ToastValue { toast(text: string, error?: boolean): void }
const Ctx = createContext<ToastValue>({ toast: () => {} });

// Avviso breve sopra la barra in basso; resta in una regione `aria-live`, così i lettori di schermo lo annunciano.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<{ text: string; error: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toast = useCallback((text: string, error = false) => {
    clearTimeout(timer.current);
    setT({ text, error });
    timer.current = setTimeout(() => setT(null), error ? 6000 : 3500);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 flex justify-center">
        {t && (
          <p role={t.error ? 'alert' : undefined} className={cn('pointer-events-auto max-w-md rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg motion-safe:animate-[toast-in_.2s_ease-out]', t.error ? 'bg-ko' : 'bg-plum')}>{t.text}</p>
        )}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
