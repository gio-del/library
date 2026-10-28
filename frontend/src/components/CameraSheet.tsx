import { useEffect, useRef, useState } from 'react';
import { Sheet } from './Sheet';
import { Button } from './ui';

// Fotocamera posteriore in un foglio: anteprima live, «Scatta», poi «Rifai» / «Usa questa foto».
// Il flusso si spegne sempre alla chiusura del foglio (il contenuto si smonta con lui).
function Body({ onPhoto, onClose }: { onPhoto(b: Blob): void; onClose(): void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const shooting = useRef(false);
  const [state, setState] = useState<'wait' | 'live' | 'shot' | 'error'>('wait');
  const [msg, setMsg] = useState('');

  const stop = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };

  useEffect(() => {
    let dead = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setMsg('Questo browser non può usare la fotocamera: scegli la foto dalla galleria.'); setState('error'); return; }
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } });
        if (dead) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s;
        setState('live');
      } catch (e) {
        if (dead) return;
        const denied = (e as DOMException).name === 'NotAllowedError' || (e as DOMException).name === 'SecurityError';
        setMsg(denied ? 'Permesso alla fotocamera negato: abilitalo nelle impostazioni del browser, oppure scegli la foto dalla galleria.' : 'Fotocamera non disponibile: scegli la foto dalla galleria.');
        setState('error');
      }
    })();
    return () => { dead = true; stop(); };
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (state !== 'live' || !v || !stream.current) return;
    v.srcObject = stream.current;
    void v.play?.()?.catch?.(() => {});
  }, [state]);

  function shoot() {
    if (shooting.current) return;
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return;
    shooting.current = true;
    c.width = v.videoWidth || 640;
    c.height = v.videoHeight || 480;
    c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height);
    stop();
    setState('shot');
  }

  function use() {
    if (shooting.current === false) return;
    shooting.current = false;
    canvasRef.current?.toBlob((b) => {
      if (b) onPhoto(b);
      onClose();
    }, 'image/jpeg', 0.9);
  }

  async function retake() {
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } });
      shooting.current = false;
      setState('live');
    } catch { setMsg('Fotocamera non disponibile: scegli la foto dalla galleria.'); setState('error'); }
  }

  if (state === 'error') {
    return (
      <div className="flex flex-col gap-3 py-3">
        <p role="alert" className="m-0 text-ko">{msg}</p>
        <Button variant="ghost" onClick={onClose}>Chiudi</Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 py-3">
      {state === 'wait' && <p className="m-0 text-muted">Accendo la fotocamera…</p>}
      <video ref={videoRef} playsInline muted aria-label="Anteprima della fotocamera" className={state === 'live' ? 'max-h-[50dvh] w-full rounded-lg bg-ink' : 'hidden'} />
      <canvas ref={canvasRef} aria-label="Foto scattata" className={state === 'shot' ? 'max-h-[50dvh] w-full rounded-lg object-contain' : 'hidden'} />
      {state === 'live' && <Button onClick={shoot}>Scatta</Button>}
      {state === 'shot' && (
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => void retake()}>Rifai</Button>
          <Button className="flex-1" onClick={use}>Usa questa foto</Button>
        </div>
      )}
    </div>
  );
}

export function CameraSheet({ open, onOpenChange, onPhoto }: { open: boolean; onOpenChange(o: boolean): void; onPhoto(b: Blob): void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Scatta la copertina">
      <Body onPhoto={onPhoto} onClose={() => onOpenChange(false)} />
    </Sheet>
  );
}
