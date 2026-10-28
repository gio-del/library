import { BookOpen } from 'lucide-react';
import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactElement, type ReactNode, type TextareaHTMLAttributes, cloneElement } from 'react';
import { cn } from '../lib/cn';

type Variant = 'primary' | 'secondary' | 'danger' | 'soft' | 'ghost';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-blue text-white',
  secondary: 'bg-plum-2 text-white',
  danger: 'bg-ko text-white',
  soft: 'bg-cream text-plum font-semibold',
  ghost: 'bg-lilac-soft text-plum',
};

export function Button({ variant = 'primary', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" className={cn('inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-medium disabled:opacity-60', VARIANTS[variant], className)} {...p} />;
}

// Etichetta sopra il campo, aiuto e errore sotto; l'errore è legato al campo con aria-describedby.
export function Field({ label, error, children }: { label: string; error?: string; children: ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }> }) {
  const id = useId();
  return (
    <div className="my-3">
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-plum">{label}</label>
      {cloneElement(children, { id, 'aria-describedby': error ? `${id}-e` : undefined, 'aria-invalid': error ? true : undefined })}
      {error && <p id={`${id}-e`} role="alert" className="mt-1 text-sm text-ko">{error}</p>}
    </div>
  );
}

const INPUT = 'block min-h-12 w-full rounded-xl border border-lilac bg-white px-3 text-base text-ink placeholder:text-muted/70 aria-[invalid=true]:border-ko';
export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input className={cn(INPUT, className)} {...p} />;
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea className={cn(INPUT, 'py-2.5', className)} {...p} />;

export function Msg({ text, error }: { text: string; error?: boolean }) {
  return <p role={error ? 'alert' : 'status'} className={cn('min-h-[1.4em] text-sm', error ? 'text-ko' : 'text-muted')}>{text}</p>;
}

export function Badge({ read, className }: { read?: boolean; className?: string }) {
  return <span className={cn('inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold', read ? 'bg-ok text-white' : 'bg-gold text-plum', className)}>{read ? 'Letto' : 'Da leggere'}</span>;
}

export function Cover({ book, className, children }: { book: { cover?: string | null; title?: string }; className?: string; children?: ReactNode }) {
  return book.cover
    ? <img src={`/covers/${book.cover}`} alt="" loading="lazy" className={cn('aspect-[2/3] w-full rounded-lg bg-lilac-soft object-cover', className)} />
    : (
      <span className={cn('flex aspect-[2/3] w-full flex-col items-center justify-center gap-2 rounded-lg bg-lilac-soft p-3 text-center text-sm font-semibold text-plum [overflow-wrap:anywhere]', className)}>
        <BookOpen aria-hidden className="size-7 opacity-60" />{children ?? book.title}
      </span>
    );
}
