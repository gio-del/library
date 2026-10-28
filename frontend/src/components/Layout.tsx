import { Dialog, DropdownMenu } from 'radix-ui';
import { EllipsisVertical, X, Library, LogOut, NotebookPen, RefreshCw, ScanBarcode, Tags, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { needsRetry } from '../lib/books';
import type { Book } from '../lib/types';
import { useAuth } from '../state/auth';
import { useBooks } from '../state/books';
import { useLock } from '../hooks/useLock';
import { Ornament } from './Ornament';
import { Confirm } from './Confirm';
import { useToast } from './Toast';

const TABS: [string, string, LucideIcon][] = [['/libreria', 'Libreria', Library], ['/scansiona', 'Scansiona', ScanBarcode], ['/note', 'Note', NotebookPen]];

export function BottomNav() {
  return (
    <nav aria-label="Sezioni" className="fixed inset-x-0 bottom-0 z-30 border-t border-lilac/60 bg-paper pb-[env(safe-area-inset-bottom)]">
      <Ornament variant="light" />
      <ul className="m-0 mx-auto flex max-w-2xl list-none p-0">
        {TABS.map(([to, label, Icon]) => (
          <li key={to} className="flex-1">
            <NavLink to={to} className={({ isActive }) => cn('flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-medium', isActive ? 'text-plum' : 'text-muted')}>
              {({ isActive }) => (
                <>
                  <span className={cn('flex h-8 w-16 items-center justify-center rounded-full', isActive && 'bg-lilac-soft')}><Icon aria-hidden className={cn('size-6', isActive && 'stroke-[2.4]')} /></span>
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

type Manage = 'classify' | 'retry';

export function TopBar() {
  const { logout } = useAuth();
  const { books, load, setAll } = useBooks();
  const { toast } = useToast();
  const lock = useLock();
  const [ask, setAsk] = useState<Manage | null>(null);
  const missing = books.filter(needsRetry).length;

  async function run(what: Manage) {
    await lock('manage', async () => {
      toast(what === 'classify' ? 'Rileggo i generi…' : 'Cerco i libri incompleti…');
      try {
        if (what === 'classify') {
          const r = await api<{ books: Book[]; changed: number }>('POST', '/api/books/classify');
          setAll(r.books);
          toast(`Generi aggiornati su ${r.changed} libri`);
        } else {
          const r = await api<{ found: number; retried: number }>('POST', '/api/books/lookup-failed');
          await load();
          toast(`Aggiornati ${r.found} libri su ${r.retried}`);
        }
      } catch (e) { toast((e as Error).message, true); }
    });
  }

  const item = 'flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-ink outline-none data-[highlighted]:bg-lilac-soft';
  return (
    <header className="sticky top-0 z-20 flex items-center gap-2 border-b-[3px] border-gold bg-plum px-4 pb-2 pt-[calc(.5rem+env(safe-area-inset-top))] text-white">
      <Dialog.Root>
        <Dialog.Trigger aria-label="Mostra il logo ingrandito" className="flex size-11 shrink-0 items-center justify-center rounded-full">
          <img src="/emblem.png" alt="" className="size-11 rounded-full bg-cream p-[3px]" />
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/70 motion-safe:animate-[fade-in_.2s_ease-out]" />
          <Dialog.Content aria-describedby={undefined} className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-cream p-4 shadow-[0_0_60px_20px_rgb(0_0_0/.55)] motion-safe:animate-[fade-in_.2s_ease-out]">
            <Dialog.Title className="sr-only">Logo della Libreria</Dialog.Title>
            <img src="/emblem.png" alt="Logo della Libreria" className="size-[min(80vw,24rem)] object-contain" />
            <Dialog.Close aria-label="Chiudi" className="absolute -right-2 -top-2 flex size-11 items-center justify-center rounded-full border-2 border-gold bg-plum text-white shadow-lg"><X aria-hidden /></Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Link to="/libreria" aria-label="Torna alla Libreria" onClick={() => window.scrollTo({ top: 0 })} className="mr-auto flex min-h-11 items-center">
        <h1 className="font-script text-[1.7rem] font-semibold tracking-wide text-gold">Libreria</h1>
      </Link>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger aria-label="Altro" className="flex size-11 items-center justify-center rounded-full text-white data-[state=open]:bg-plum-2"><EllipsisVertical aria-hidden /></DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-60 rounded-xl bg-paper p-1.5 shadow-xl">
            <DropdownMenu.Label className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted">Gestione</DropdownMenu.Label>
            <DropdownMenu.Item className={item} onSelect={() => setAsk('classify')}><Tags aria-hidden className="size-5 text-plum" />Rileggi i generi</DropdownMenu.Item>
            <DropdownMenu.Item className={item} onSelect={() => setAsk('retry')}><RefreshCw aria-hidden className="size-5 text-plum" />Cerca di nuovo i dati{missing > 0 && <span className="ml-auto rounded-full bg-gold px-2 text-xs font-semibold text-plum">{missing}</span>}</DropdownMenu.Item>
            <DropdownMenu.Separator className="my-1.5 h-px bg-lilac/60" />
            <DropdownMenu.Item className={item} onSelect={() => void logout()}><LogOut aria-hidden className="size-5 text-plum" />Esci</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <Confirm open={ask === 'classify'} onOpenChange={(o) => !o && setAsk(null)} title="Rileggere i generi?" action="Rileggi i generi" onConfirm={() => void run('classify')}>
        Cerco di nuovo il genere di ogni libro. Quelli che hai corretto a mano non vengono toccati.
      </Confirm>
      <Confirm open={ask === 'retry'} onOpenChange={(o) => !o && setAsk(null)} title="Cercare di nuovo i dati?" action="Cerca di nuovo" onConfirm={() => void run('retry')}>
        {missing > 0 ? `Riprovo la ricerca per ${missing} libri senza dati o senza copertina.` : 'Nessun libro ha dati o copertina mancanti.'}
      </Confirm>
    </header>
  );
}

export function Layout() {
  return (
    <div className="min-h-dvh pb-[calc(6.5rem+env(safe-area-inset-bottom))]">
      <TopBar />
      <Ornament />
      <main className="mx-auto max-w-2xl px-4 py-4"><Outlet /></main>
      <BottomNav />
    </div>
  );
}
