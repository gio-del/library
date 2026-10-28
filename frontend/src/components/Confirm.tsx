import { AlertDialog } from 'radix-ui';
import type { ReactNode } from 'react';
import { Button } from './ui';

// Conferma per le azioni che non si disfano (elimina) o che toccano tutta la libreria (Gestione).
export function Confirm({ open, onOpenChange, title, children, action, onConfirm, danger }: {
  open: boolean; onOpenChange(o: boolean): void; title: string; children?: ReactNode; action: string; onConfirm(): void; danger?: boolean;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-ink/50" />
        <AlertDialog.Content className="fixed inset-x-4 top-1/2 z-50 mx-auto max-w-sm -translate-y-1/2 rounded-2xl bg-paper p-5 shadow-xl">
          <AlertDialog.Title className="mb-2 text-lg font-bold text-plum">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mb-4 text-muted [overflow-wrap:anywhere]">{children}</AlertDialog.Description>
          <div className="flex flex-col gap-2">
            <AlertDialog.Action asChild><Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{action}</Button></AlertDialog.Action>
            <AlertDialog.Cancel asChild><Button variant="ghost">Annulla</Button></AlertDialog.Cancel>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
