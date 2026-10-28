import { useCallback, useRef } from 'react';

// Esegue una azione alla volta per chiave: un secondo tocco mentre la prima è in corso viene ignorato.
export function useLock() {
  const held = useRef(new Set<string>());
  return useCallback(async <T,>(key: string, fn: () => Promise<T>): Promise<T | undefined> => {
    if (held.current.has(key)) return undefined;
    held.current.add(key);
    try { return await fn(); } finally { held.current.delete(key); }
  }, []);
}
