import { useCallback, useEffect, useRef, useState } from 'react';
import { validIsbn13 } from '../lib/isbn';

interface Detector { detect(v: HTMLVideoElement): Promise<{ rawValue: string }[]> }
declare global { interface Window { BarcodeDetector?: new (o: { formats: string[] }) => Detector } }

// Lettore del browser se c'è (Chrome Android), altrimenti zxing caricato solo ora (Safari iOS, Firefox).
async function makeDetector(): Promise<Detector> {
  if (window.BarcodeDetector) return new window.BarcodeDetector({ formats: ['ean_13'] });
  return (await import('../lib/zxing')).createDetector();
}

// Fotocamera + lettore EAN-13: chiama onCode una volta per codice ISBN-13 valido (di nuovo solo dopo 2,5 s senza vederlo).
export function useScanner(onCode: (isbn: string) => void, onError: (msg: string) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const scanning = useRef(false);
  const starting = useRef(false);
  const cb = useRef(onCode);
  const err = useRef(onError);
  cb.current = onCode;
  err.current = onError;
  const [active, setActive] = useState(false);

  const stop = useCallback(() => {
    scanning.current = false;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setActive(false);
  }, []);

  const open = useCallback(async () => {
    if (!navigator.mediaDevices) { err.current('Questo browser non usa la fotocamera: scrivi l’ISBN a mano.'); return; }
    let detector: Detector;
    try { detector = await makeDetector(); } catch { err.current('Lettore dei codici a barre non disponibile: scrivi l’ISBN a mano.'); return; }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } });
    } catch { err.current('Fotocamera non disponibile: scrivi l’ISBN a mano.'); return; }
    try {
      const [track] = stream.current.getVideoTracks();
      await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] });
    } catch { /* messa a fuoco non regolabile */ }
    const video = videoRef.current!;
    video.srcObject = stream.current;
    await video.play();
    scanning.current = true;
    setActive(true);
    let last: string | null = null;
    let seen = 0;
    const tick = async () => {
      if (!scanning.current) return;
      try {
        const codes = await detector.detect(video);
        const hit = codes.map((c) => String(c.rawValue).replace(/\D/g, '')).find(validIsbn13);
        if (hit) {
          seen = Date.now();
          if (hit !== last) { last = hit; cb.current(hit); }
        } else if (last && Date.now() - seen > 2500) last = null;
      } catch { /* fotogramma non pronto */ }
      setTimeout(tick, 300);
    };
    void tick();
  }, []);

  // Doppio tocco su «Apri la fotocamera»: un solo flusso.
  const start = useCallback(async () => {
    if (scanning.current || starting.current) return;
    starting.current = true;
    try { await open(); } finally { starting.current = false; }
  }, [open]);

  useEffect(() => stop, [stop]);
  return { videoRef, active, start, stop };
}
