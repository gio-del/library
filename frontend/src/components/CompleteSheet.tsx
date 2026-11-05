import { Button } from './ui';
import { Sheet } from './Sheet';
import { useCompleteMissing } from '../hooks/useCompleteMissing';

type Api = ReturnType<typeof useCompleteMissing>;

export function CompleteSheet({ open, onOpenChange, c }: { open: boolean; onOpenChange(o: boolean): void; c: Api }) {
  const { phase, pending, progress, summary, stopped } = c;
  const close = (o: boolean) => {
    if (!o) { c.halt(); c.reset(); }
    onOpenChange(o);
  };
  return (
    <Sheet open={open} onOpenChange={close} title="Completa i dati mancanti">
      <div className="flex flex-col gap-3 pt-2">
        {phase === 'idle' && (
          <>
            <p className="text-muted">{pending > 0 ? `${pending} ${pending === 1 ? 'libro ha' : 'libri hanno'} dati o copertina mancanti. Li cerco uno alla volta, senza toccare ciò che hai già compilato.` : 'Nessun libro ha dati o copertina mancanti.'}</p>
            <Button disabled={pending === 0} onClick={() => void c.start()}>Avvia</Button>
          </>
        )}
        {phase === 'running' && (
          <>
            <p role="status" className="font-semibold text-title">{progress.done} di {progress.total}</p>
            <div role="progressbar" aria-label="Avanzamento" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done} className="h-2 overflow-hidden rounded-full bg-lilac-soft">
              <div className="h-full bg-title" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
            </div>
            <Button variant="danger" onClick={c.halt}>Ferma</Button>
          </>
        )}
        {phase === 'done' && (
          <>
            <p role="status" className="font-semibold text-title">{stopped ? `Fermato dopo ${progress.done} di ${progress.total}` : `Finito: ${progress.total} ${progress.total === 1 ? 'libro elaborato' : 'libri elaborati'}`}</p>
            <ul className="m-0 list-none p-0 text-ink">
              <li>Completati: {summary.completed}</li>
              <li>Ancora incompleti: {summary.incomplete}</li>
              <li>Fonte non raggiunta: {summary.unreached}</li>
            </ul>
            {summary.unreached > 0 && <p className="text-sm text-muted">Per i libri la cui fonte non ha risposto riprova più tardi.</p>}
            <Button variant="ghost" onClick={() => close(false)}>Chiudi</Button>
          </>
        )}
      </div>
    </Sheet>
  );
}
