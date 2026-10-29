import { ScanText } from 'lucide-react';
import { useRef, useState } from 'react';
import { readCover } from '../lib/api';
import type { CoverRead } from '../lib/coverRead';
import { Button } from './ui';

// «Leggi i dati dalla foto»: chiede al server di leggere la copertina; non salva nulla.
export function ReadPhotoButton({ getPhoto, onRead, disabled }: { getPhoto(): Promise<Blob>; onRead(r: CoverRead): string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const going = useRef(false);

  async function go() {
    if (going.current) return;
    going.current = true;
    setBusy(true);
    setMsg('');
    setErr('');
    try {
      setMsg(onRead(await readCover(await getPhoto())));
    } catch (e) {
      const status = (e as { status?: number }).status;
      setErr(status === 404 ? 'Lettura non disponibile' : (e as Error).message || 'Non riesco a leggere la copertina');
    } finally {
      going.current = false;
      setBusy(false);
    }
  }

  return (
    <div>
      <Button variant="ghost" className="w-full" disabled={disabled || busy} aria-busy={busy} onClick={() => void go()}>
        <ScanText aria-hidden className="size-5" />{busy ? 'Leggo la copertina…' : 'Leggi i dati dalla foto'}
      </Button>
      {msg && <p role="status" className="mb-0 mt-2 text-sm text-muted">{msg}</p>}
      {err && <p role="alert" className="mb-0 mt-2 text-sm text-ko">{err}</p>}
    </div>
  );
}
