import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Book, WishItem } from '../lib/types';
import { useBooks } from '../state/books';
import { Button, Cover, Msg } from '../components/ui';
import { SubPage } from '../components/SubPage';
import { useToast } from '../components/Toast';

export function Wishlist() {
  const { upsert } = useBooks();
  const { toast } = useToast();
  const [items, setItems] = useState<WishItem[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    api<WishItem[]>('GET', '/api/wishlist').then(setItems).catch((e: Error) => setErr(e.message));
  }, []);

  const drop = (isbn: string) => setItems((cur) => (cur || []).filter((x) => x.isbn !== isbn));

  async function remove(w: WishItem) {
    if (busy) return;
    setBusy(w.isbn);
    try {
      await api('DELETE', `/api/wishlist/${w.isbn}`);
      drop(w.isbn);
      toast('Tolto dai desideri');
    } catch (e) { toast((e as Error).message, true); }
    setBusy('');
  }

  async function bought(w: WishItem) {
    if (busy) return;
    setBusy(w.isbn);
    try {
      const r = await api<{ book: Book }>('POST', '/api/books', { isbn: w.isbn });
      upsert(r.book);
      drop(w.isbn);
      toast('Aggiunto alla libreria');
    } catch (e) { toast((e as Error).message, true); }
    setBusy('');
  }

  return (
    <SubPage title="Desideri" fallback="/libreria">
      {err ? <Msg text={err} error /> : items === null ? <Msg text="Carico…" /> : items.length === 0 ? <Msg text="Nessun desiderio: dalla schermata Scansiona puoi segnare i libri da comprare." /> : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {items.map((w) => (
            <li key={w.isbn} className="flex gap-3 rounded-2xl bg-paper p-3 shadow-sm">
              <Cover book={{ cover: w.cover, title: w.title || w.isbn }} className="w-16 shrink-0 self-start" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="[overflow-wrap:anywhere]">
                  <p className="m-0 font-semibold">{w.title || 'Senza titolo'}</p>
                  <p className="m-0 text-sm text-muted">{(w.authors || []).join(', ') || w.isbn}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={!!busy} onClick={() => void bought(w)}>L’ho comprato</Button>
                  <Button variant="ghost" disabled={!!busy} aria-label={`Togli ${w.title || w.isbn} dai desideri`} onClick={() => void remove(w)}><Trash2 aria-hidden className="size-5" />Togli</Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SubPage>
  );
}
