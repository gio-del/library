/** Condivide un testo: foglio di sistema se c'è, altrimenti lo copia negli appunti e avvisa. */
export async function shareText(title: string, text: string, toast: (t: string, error?: boolean) => void, failed: string): Promise<void> {
  if (typeof navigator.share === 'function') {
    try { await navigator.share({ title, text }); } catch { /* annullata */ }
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Copiato');
  } catch { toast(failed, true); }
}
