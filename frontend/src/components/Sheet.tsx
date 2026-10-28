import { Dialog } from 'radix-ui';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

// Foglio dal basso (bottom sheet): si chiude con il tocco fuori, con Esc o con la X.
export function Sheet({ open, onOpenChange, title, children }: { open: boolean; onOpenChange(o: boolean): void; title: string; children: ReactNode }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/50" />
        <Dialog.Content aria-describedby={undefined} className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[80dvh] max-w-2xl flex-col rounded-t-2xl bg-paper pb-[env(safe-area-inset-bottom)] shadow-xl motion-safe:animate-[sheet-in_.2s_ease-out]">
          <div className="flex items-center justify-between px-4 pt-3">
            <Dialog.Title className="text-lg font-bold text-plum">{title}</Dialog.Title>
            <Dialog.Close className="flex size-11 items-center justify-center rounded-full text-plum" aria-label="Chiudi"><X aria-hidden /></Dialog.Close>
          </div>
          <div className="overflow-y-auto px-4 pb-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
