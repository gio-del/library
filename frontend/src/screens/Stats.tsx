import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { libraryStats, topAuthors } from '../lib/books';
import { useBooks } from '../state/books';
import { Msg } from '../components/ui';
import { YearGoal, readInYear } from '../components/YearGoal';
import { SubPage } from '../components/SubPage';

function Bar({ label, count, max, total }: { label: string; count: number; max: number; total?: number }) {
  const text = total === undefined ? `${label}: ${count}` : `${label}: ${count} su ${total}`;
  return (
    <li className="grid grid-cols-[minmax(0,6.5rem)_1fr_2rem] items-center gap-2 text-sm">
      <span className="truncate">{label}</span>
      <div role="img" aria-label={text} className="h-3 overflow-hidden rounded-full bg-lilac-soft">
        <div className="h-full rounded-full bg-title" style={{ width: `${max ? (count / max) * 100 : 0}%` }} />
      </div>
      <span className="text-right font-semibold tabular-nums" aria-hidden>{count}</span>
    </li>
  );
}

export function Stats() {
  const nav = useNavigate();
  const { books, loaded, load } = useBooks();
  useEffect(() => { if (!loaded) void load().catch(() => {}); }, [loaded, load]);
  const now = new Date();
  const s = libraryStats(books, now);
  const authors = topAuthors(books);
  const pct = s.total ? Math.round((s.read / s.total) * 100) : 0;
  const h = 'mb-2 text-sm font-semibold uppercase tracking-wide text-muted';
  return (
    <SubPage title="Statistiche" fallback="/libreria">
      {!loaded ? <Msg text="Carico…" /> : s.total === 0 ? <Msg text="La libreria è vuota: aggiungi qualche libro per vedere le statistiche." /> : (
        <div className="space-y-6">
          <YearGoal year={now.getFullYear()} done={readInYear(books, now.getFullYear())} />
          <section aria-labelledby="st-tot">
            <h2 id="st-tot" className={h}>Libri</h2>
            <p className="text-3xl font-bold text-title">{s.total} <span className="text-base font-medium text-ink">{s.total === 1 ? 'libro' : 'libri'}</span></p>
            <p className="mt-1 text-sm">Letti: <strong>{s.read}</strong> · Da leggere: <strong>{s.toRead}</strong></p>
            <div role="progressbar" aria-label="Libri letti" aria-valuemin={0} aria-valuemax={s.total} aria-valuenow={s.read} aria-valuetext={`${s.read} letti su ${s.total} (${pct}%)`} className="mt-2 h-4 overflow-hidden rounded-full bg-lilac-soft">
              <div className="h-full rounded-full bg-ok" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 text-sm text-muted">{pct}% letto</p>
          </section>
          <section aria-labelledby="st-gen">
            <h2 id="st-gen" className={h}>Generi più frequenti</h2>
            <ul className="space-y-2">{s.genres.map(([g, n]) => <Bar key={g} label={g} count={n} max={s.genres[0][1]} total={s.total} />)}</ul>
          </section>
          {authors.length > 0 && (
            <section aria-labelledby="st-aut">
              <h2 id="st-aut" className={h}>Autori</h2>
              <ul className="space-y-2">
                {authors.map((a) => (
                  <li key={a.name}>
                    <button type="button" onClick={() => nav('/libreria', { state: { author: a.name } })} aria-label={`Mostra i libri di ${a.name}`} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl bg-lilac-soft px-4 py-2 text-left text-title">
                      <span className="min-w-0 font-medium [overflow-wrap:anywhere]">{a.name}</span>
                      <span className="shrink-0 text-sm">{a.books} libri · {a.read} letti</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section aria-labelledby="st-voto">
            <h2 id="st-voto" className={h}>Voti</h2>
            {s.avgRating === null ? <p className="text-sm text-muted">Nessun voto ancora.</p> : (
              <p className="text-sm">Voto medio: <strong className="text-2xl text-title">{s.avgRating.toLocaleString('it-IT', { maximumFractionDigits: 1 })}</strong> su 5 · {s.rated} {s.rated === 1 ? 'libro votato' : 'libri votati'}</p>
            )}
          </section>
          <section aria-labelledby="st-letti">
            <h2 id="st-letti" className={h}>Letti negli ultimi 6 mesi</h2>
            <ul className="space-y-2">{s.readMonths.map((m) => <Bar key={m.key} label={m.label} count={m.count} max={Math.max(...s.readMonths.map((x) => x.count))} />)}</ul>
          </section>
          <section aria-labelledby="st-mesi">
            <h2 id="st-mesi" className={h}>Aggiunti negli ultimi 6 mesi</h2>
            <ul className="space-y-2">{s.months.map((m) => <Bar key={m.key} label={m.label} count={m.count} max={Math.max(...s.months.map((x) => x.count))} />)}</ul>
          </section>
        </div>
      )}
    </SubPage>
  );
}
