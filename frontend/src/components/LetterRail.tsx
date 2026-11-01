import { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/cn';

export interface RailGroup { label: string; isbn: string }

/** Striscia sul bordo destro: trascinandola (o toccandola) la lista salta al gruppo e una bolla ne mostra l'etichetta. */
export function LetterRail({ groups, letters, onJump }: { groups: RailGroup[]; letters: boolean; onJump(g: RailGroup): void }) {
  const [active, setActive] = useState(-1);
  const [bubble, setBubble] = useState(false);
  const hide = useRef<ReturnType<typeof setTimeout>>(undefined);
  const last = useRef(-1);
  useEffect(() => () => clearTimeout(hide.current), []);

  const pick = (i: number) => {
    const n = Math.max(0, Math.min(groups.length - 1, i));
    clearTimeout(hide.current);
    setBubble(true);
    setActive(n);
    if (n !== last.current) { last.current = n; onJump(groups[n]); }
  };
  const at = (e: { clientY: number; currentTarget: HTMLElement }) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.floor(((e.clientY - r.top) / (r.height || 1)) * groups.length);
  };
  const release = () => { clearTimeout(hide.current); hide.current = setTimeout(() => setBubble(false), 1000); };
  const current = groups[Math.min(active, groups.length - 1)];

  return (
    <>
      <div
        role="slider" tabIndex={0} aria-orientation="vertical" aria-label="Scorri per lettera"
        aria-valuemin={0} aria-valuemax={groups.length - 1} aria-valuenow={Math.max(active, 0)} aria-valuetext={current?.label ?? groups[0].label}
        data-testid="letter-rail"
        style={{ touchAction: 'none' }}
        className="fixed bottom-24 right-0 top-52 z-20 flex w-7 select-none flex-col justify-between rounded-l-lg bg-cream/70 py-1"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); last.current = -1; pick(at(e)); }}
        onPointerMove={(e) => { if (e.buttons || e.pointerType === 'touch') pick(at(e)); }}
        onPointerUp={release}
        onPointerCancel={release}
        onKeyDown={(e) => {
          const d = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
          if (d) { e.preventDefault(); pick(Math.max(active, 0) + d); release(); }
        }}
      >
        {letters && groups.map((g, i) => <span key={g.label} aria-hidden className={cn('text-center text-[10px] font-semibold leading-none', i === active ? 'text-plum' : 'text-muted')}>{g.label}</span>)}
        {!letters && <span aria-hidden className="mx-auto my-auto h-full w-1 rounded-full bg-plum/30" />}
      </div>
      {bubble && current && (
        <div aria-hidden data-testid="letter-bubble" className="pointer-events-none fixed left-1/2 top-1/2 z-30 flex min-h-20 min-w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl bg-plum px-4 text-4xl font-bold text-white shadow-lg">{current.label}</div>
      )}
    </>
  );
}
