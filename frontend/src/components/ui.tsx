import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

type Variant = 'primary' | 'secondary' | 'danger' | 'soft';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-blue text-white',
  secondary: 'bg-plum-2 text-white',
  danger: 'bg-ko text-white',
  soft: 'bg-cream text-plum font-semibold',
};

export function Button({ variant = 'primary', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" className={cn('min-h-11 rounded-lg px-4 disabled:opacity-60', VARIANTS[variant], className)} {...p} />;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="my-2.5 block">{label}{children}</label>;
}

const INPUT = 'block min-h-11 w-full rounded-lg border border-lilac bg-white px-2.5 font-[inherit]';
export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input className={cn(INPUT, className)} {...p} />;
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea className={cn(INPUT, 'p-2.5', className)} {...p} />;

export function Msg({ text, error }: { text: string; error?: boolean }) {
  return <p role={error ? 'alert' : 'status'} className={cn('min-h-[1.4em]', error && 'text-ko')}>{text}</p>;
}

export function Badge({ read }: { read?: boolean }) {
  return <span className={cn('rounded-full px-3 py-0.5 text-sm font-semibold', read ? 'bg-ok text-white' : 'bg-gold text-plum')}>{read ? 'Letto' : 'Da leggere'}</span>;
}

export function Cover({ book, className }: { book: { cover?: string | null; title?: string }; className?: string }) {
  return book.cover
    ? <img src={`/covers/${book.cover}`} alt="" className={cn('max-h-56 max-w-full rounded', className)} />
    : <span className={cn('flex min-h-32 w-full items-center justify-center rounded bg-lilac-soft p-2 font-semibold text-plum [overflow-wrap:anywhere]', className)}>{book.title}</span>;
}
