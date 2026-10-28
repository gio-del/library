import { Camera, ImagePlus } from 'lucide-react';
import { useState } from 'react';
import { CameraSheet } from './CameraSheet';
import { cn } from '../lib/cn';

const tool = 'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl bg-lilac-soft px-2 text-center text-sm font-medium text-plum';

// Due modi per dare una copertina: «Scegli dalla galleria» e «Scatta ora».
export function CoverPicker({ onPick, disabled, className, galleryLabel = 'Scegli dalla galleria' }: { onPick(f: Blob, name?: string): void; disabled?: boolean; className?: string; galleryLabel?: string }) {
  const [cam, setCam] = useState(false);
  return (
    <div className={cn('flex gap-2', className)}>
      <label className={cn(tool, 'cursor-pointer', disabled && 'opacity-60')}>
        <ImagePlus aria-hidden className="size-5" />{galleryLabel}
        <input type="file" accept="image/*" hidden disabled={disabled} onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f, f.name); e.target.value = ''; }} />
      </label>
      <button type="button" className={tool} disabled={disabled} onClick={() => setCam(true)}><Camera aria-hidden className="size-5" />Scatta ora</button>
      <CameraSheet open={cam} onOpenChange={setCam} onPhoto={(b) => onPick(b, 'Foto scattata')} />
    </div>
  );
}
