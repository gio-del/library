import { useId } from 'react';
import { cn } from '../lib/cn';

// Fregio di stelle e lune (il vecchio «✦ ☾ ✦»), decorativo e alto 20px; i colori vengono dai token del tema:
// oro su prugna ('dark') o prugna tenue su crema ('light').
export function Ornament({ variant = 'dark', className }: { variant?: 'dark' | 'light'; className?: string }) {
  const id = useId();
  return (
    <svg
      data-testid="ornament"
      aria-hidden="true"
      focusable="false"
      className={cn('pointer-events-none block h-5 w-full max-w-full overflow-hidden', variant === 'dark' ? 'bg-plum text-gold' : 'bg-paper text-plum/40', className)}
    >
      <defs>
        <pattern id={id} width="72" height="20" patternUnits="userSpaceOnUse" x="0">
          <path fill="currentColor" d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z" />
          <path fill="currentColor" d="M52 4a6.5 6.5 0 1 0 5.2 10.4A5.2 5.2 0 0 1 52 4z" />
          <circle cx="36" cy="10" r="1.3" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
