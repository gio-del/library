import { RotateCw } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Sheet } from './Sheet';
import { Button } from './ui';

// Riquadro in frazioni (0..1) della foto mostrata.
type Rect = { x: number; y: number; w: number; h: number };
type Corner = 'nw' | 'ne' | 'sw' | 'se';
type Loaded = { blob: Blob; bmp: ImageBitmap; url: string };

const FULL: Rect = { x: 0, y: 0, w: 1, h: 1 };
const MIN = 0.1;
const CORNERS: { id: Corner; label: string; cls: string }[] = [
  { id: 'nw', label: 'angolo in alto a sinistra', cls: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2' },
  { id: 'ne', label: 'angolo in alto a destra', cls: 'left-full top-0 -translate-x-1/2 -translate-y-1/2' },
  { id: 'sw', label: 'angolo in basso a sinistra', cls: 'left-0 top-full -translate-x-1/2 -translate-y-1/2' },
  { id: 'se', label: 'angolo in basso a destra', cls: 'left-full top-full -translate-x-1/2 -translate-y-1/2' },
];

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function moveRect(r: Rect, dx: number, dy: number): Rect {
  return { ...r, x: clamp(r.x + dx, 0, 1 - r.w), y: clamp(r.y + dy, 0, 1 - r.h) };
}

export function resizeRect(r: Rect, corner: Corner, dx: number, dy: number): Rect {
  let { x, y } = r;
  let x2 = r.x + r.w;
  let y2 = r.y + r.h;
  if (corner === 'nw' || corner === 'sw') x = clamp(x + dx, 0, x2 - MIN); else x2 = clamp(x2 + dx, x + MIN, 1);
  if (corner === 'nw' || corner === 'ne') y = clamp(y + dy, 0, y2 - MIN); else y2 = clamp(y2 + dy, y + MIN, 1);
  return { x, y, w: x2 - x, h: y2 - y };
}

function toBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Immagine non leggibile'))), 'image/jpeg', 0.92));
}

async function load(blob: Blob): Promise<Loaded> {
  const bmp = await createImageBitmap(blob);
  return { blob, bmp, url: URL.createObjectURL(blob) };
}

function Body({ photo, onUse, onCancel }: { photo: Blob; onUse(b: Blob): void; onCancel(): void }) {
  const [img, setImg] = useState<Loaded | null>(null);
  const [rect, setRect] = useState<Rect>(FULL);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  const current = useRef<Loaded | null>(null);
  const drag = useRef<{ corner: Corner | null; px: number; py: number; start: Rect } | null>(null);

  const show = (l: Loaded) => {
    if (current.current) URL.revokeObjectURL(current.current.url);
    current.current = l;
    setImg(l);
    setRect(FULL);
  };

  useEffect(() => {
    let dead = false;
    load(photo).then((l) => { if (dead) URL.revokeObjectURL(l.url); else show(l); }, () => { if (!dead) setError('Immagine non leggibile: scegline un\'altra.'); });
    return () => { dead = true; if (current.current) URL.revokeObjectURL(current.current.url); current.current = null; };
  }, [photo]);

  function down(e: PointerEvent, corner: Corner | null) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { corner, px: e.clientX, py: e.clientY, start: rect };
  }
  function move(e: PointerEvent) {
    const d = drag.current;
    const box = stage.current?.getBoundingClientRect();
    if (!d || !box || !box.width || !box.height) return;
    const dx = (e.clientX - d.px) / box.width;
    const dy = (e.clientY - d.py) / box.height;
    setRect(d.corner ? resizeRect(d.start, d.corner, dx, dy) : moveRect(d.start, dx, dy));
  }
  const up = () => { drag.current = null; };

  async function rotate() {
    if (!img || busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      const { bmp } = img;
      const c = document.createElement('canvas');
      c.width = bmp.height; c.height = bmp.width;
      const ctx = c.getContext('2d')!;
      ctx.translate(c.width, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(bmp, 0, 0);
      show(await load(await toBlob(c)));
    } catch { setError('Non riesco a ruotare la foto.'); } finally { busyRef.current = false; setBusy(false); }
  }

  async function use() {
    if (!img || busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      const { bmp } = img;
      const sx = Math.round(rect.x * bmp.width);
      const sy = Math.round(rect.y * bmp.height);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.min(bmp.width - sx, Math.round(rect.w * bmp.width)));
      c.height = Math.max(1, Math.min(bmp.height - sy, Math.round(rect.h * bmp.height)));
      c.getContext('2d')!.drawImage(bmp, sx, sy, c.width, c.height, 0, 0, c.width, c.height);
      onUse(await toBlob(c));
    } catch { setError('Non riesco a ritagliare la foto.'); busyRef.current = false; setBusy(false); }
  }

  const r = rect;
  const clip = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${r.x * 100}% ${r.y * 100}%, ${r.x * 100}% ${(r.y + r.h) * 100}%, ${(r.x + r.w) * 100}% ${(r.y + r.h) * 100}%, ${(r.x + r.w) * 100}% ${r.y * 100}%, ${r.x * 100}% ${r.y * 100}%)`;
  return (
    <div className="flex flex-col gap-3 py-3">
      {error && <p role="alert" className="m-0 text-ko">{error}</p>}
      {!img && !error && <p className="m-0 text-muted">Carico la foto…</p>}
      {img && (
        <div className="flex justify-center px-[22px]">
          <div ref={stage} data-testid="crop-stage" className="relative inline-block max-w-full touch-none select-none">
            <img src={img.url} alt="Foto da ritagliare" draggable={false} onError={() => { setImg(null); setError('Immagine non leggibile: scegline un\'altra.'); }} className="block max-h-[45dvh] max-w-full" />
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-ink/50" style={{ clipPath: clip }} />
            <div
              role="group" aria-label="Riquadro di ritaglio" data-testid="crop-box"
              className="absolute cursor-move touch-none border-2 border-gold"
              style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
              onPointerDown={(e) => down(e, null)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
            >
              {CORNERS.map((c) => (
                <div
                  key={c.id} role="button" aria-label={`Ridimensiona: ${c.label}`} data-testid={`crop-${c.id}`}
                  className={`absolute flex size-11 touch-none items-center justify-center ${c.cls}`}
                  onPointerDown={(e) => down(e, c.id)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
                >
                  <span className="size-4 rounded-full border-2 border-plum bg-gold" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onCancel}>Annulla</Button>
        <Button variant="ghost" className="flex-1" disabled={!img || busy} onClick={() => void rotate()}><RotateCw aria-hidden className="size-5" />Ruota</Button>
        <Button className="flex-1" disabled={!img || busy} onClick={() => void use()}>Usa la foto</Button>
      </div>
    </div>
  );
}

// Foglio «Ritaglia la copertina»: `photo` = foto scelta (null = chiuso). `onUse` riceve solo il ritaglio.
export function CropSheet({ photo, onUse, onCancel }: { photo: Blob | null; onUse(b: Blob): void; onCancel(): void }) {
  return (
    <Sheet open={!!photo} onOpenChange={(o) => { if (!o) onCancel(); }} title="Ritaglia la copertina">
      {photo && <Body photo={photo} onUse={onUse} onCancel={onCancel} />}
    </Sheet>
  );
}
