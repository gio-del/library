import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { NotesVersion } from '../lib/types';
import { Button, Msg, Textarea } from '../components/ui';

interface NotesRes { text: string; rev: number; history: NotesVersion[]; overwritten?: boolean }

// Salvataggio automatico: una richiesta alla volta, sempre con l'ultimo testo.
export function Notes() {
  const [text, setText] = useState('');
  const [ready, setReady] = useState(false);
  const [history, setHistory] = useState<NotesVersion[]>([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState(false);
  const rev = useRef(0);
  const saved = useRef('');
  const latest = useRef('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const busy = useRef(false);
  const say = (t: string, e = false) => { setMsg(t); setErr(e); };

  async function save() {
    clearTimeout(timer.current);
    if (busy.current) { timer.current = setTimeout(save, 300); return; }
    const t = latest.current;
    if (t === saved.current) return;
    busy.current = true;
    say('Salvataggio…');
    try {
      const r = await api<NotesRes>('PUT', '/api/notes', { text: t, rev: rev.current });
      rev.current = r.rev;
      saved.current = t;
      setHistory(r.history);
      say(r.overwritten ? 'Salvato. Un altro dispositivo aveva modificato le note: la sua versione è in «Versioni precedenti».' : 'Salvato', !!r.overwritten);
      if (latest.current !== t) timer.current = setTimeout(save, 300);
    } catch (e) { say(`Non salvato: ${(e as Error).message}`, true); timer.current = setTimeout(save, 5000); }
    busy.current = false;
  }
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    api<NotesRes>('GET', '/api/notes').then((r) => {
      rev.current = r.rev; saved.current = r.text; latest.current = r.text;
      setText(r.text); setHistory(r.history); setReady(true);
    }).catch((e: ApiError) => { if (e.status !== 401) say(e.message, true); });
    const onHide = () => { if (document.visibilityState === 'hidden') void saveRef.current(); };
    document.addEventListener('visibilitychange', onHide);
    return () => { document.removeEventListener('visibilitychange', onHide); clearTimeout(timer.current); void saveRef.current(); };
  }, []);

  function change(v: string) {
    setText(v);
    latest.current = v;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveRef.current(), 800);
  }

  return (
    <section>
      <label htmlFor="notes-text" className="mb-1 block text-sm font-medium text-plum">Libri da leggere o da acquistare</label>
      <Textarea id="notes-text" rows={14} className="min-h-[50dvh]" maxLength={100000} placeholder="Scrivi qui…" disabled={!ready} value={text} onChange={(e) => change(e.target.value)} onBlur={() => void save()} />
      <Msg text={msg} error={err} />
      {history.length > 0 && (
        <details>
          <summary className="flex min-h-11 cursor-pointer items-center text-plum">Versioni precedenti</summary>
          <ul className="list-none p-0">
            {history.map((h, i) => (
              <li key={i} className="my-2.5 rounded-xl bg-paper p-3 shadow-sm">
                <p className="text-sm text-muted">{h.updated ? new Date(h.updated).toLocaleString('it-IT') : ''}</p>
                <p className="whitespace-pre-wrap">{h.text}</p>
                <Button variant="ghost" onClick={() => { change(h.text); void save(); }}>Usa questa versione</Button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
