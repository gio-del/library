import { Dialog } from 'radix-ui';
import { X } from 'lucide-react';

// Copertina a tutto schermo su sfondo scuro: si chiude con il tocco fuori dall'immagine, con Esc o con la X.
export function CoverViewer({ src, title, className }: { src: string; title: string; className?: string }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger aria-label="Ingrandisci la copertina" className="mx-auto block max-w-full rounded-lg">
        <img src={src} alt="" className={className} />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Content
          aria-describedby={undefined}
          onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.querySelector<HTMLButtonElement>('[data-close]')?.click(); }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/95 px-[max(1rem,env(safe-area-inset-left))] pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(4rem,calc(env(safe-area-inset-top)+3.5rem))] motion-safe:animate-[fade-in_.2s_ease-out]"
        >
          <Dialog.Title className="sr-only">Copertina di {title}</Dialog.Title>
          <img src={src} alt={`Copertina di ${title}`} className="max-h-full max-w-full object-contain" />
          <Dialog.Close data-close aria-label="Chiudi" className="absolute right-[max(1rem,env(safe-area-inset-right))] top-[max(1rem,env(safe-area-inset-top))] flex size-11 items-center justify-center rounded-full border-2 border-gold bg-plum text-white shadow-lg"><X aria-hidden /></Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
