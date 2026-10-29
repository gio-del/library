import { Star } from 'lucide-react';
import { cn } from '../lib/cn';

// Voto da 1 a 5: toccare la stella del voto attuale lo toglie; «Senza voto» fa lo stesso.
export function Stars({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <div role="group" aria-label="Voto" className="flex flex-wrap items-center gap-2">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          aria-pressed={n === value}
          aria-label={`${n} ${n === 1 ? 'stella' : 'stelle'} su 5`}
          onClick={() => onChange(n === value ? 0 : n)}
          className="flex size-11 items-center justify-center rounded-lg transition-transform active:scale-90 motion-reduce:transition-none motion-reduce:active:scale-100 disabled:opacity-60"
        >
          <Star aria-hidden className={cn('size-7', n <= value ? 'fill-gold stroke-plum' : 'stroke-plum-2')} />
        </button>
      ))}
      <button type="button" disabled={disabled || !value} onClick={() => onChange(0)} className="min-h-11 rounded-lg bg-lilac-soft px-3 text-sm font-medium text-plum disabled:opacity-50">Senza voto</button>
    </div>
  );
}
