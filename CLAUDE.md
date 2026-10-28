# library — regole del Project

Scan ISBN e libreria virtuale (webapp Node). Il codice vive solo su questo remote.

- **Backend**: solo moduli `node:*`, nessuna dipendenza npm (`server.js`, `lib/`). **Frontend** in `frontend/` (decisione dell'owner, 2026-10-28, #30): Vite, React, TypeScript, Tailwind 4, Radix, lucide-react, vitest; la build va in `public/` (ignorata da git) e il backend la serve. Nuove dipendenze del frontend: solo con lockfile e `npm ci`.
- **Sicuro di default**: ascolto su `LISTEN_HOST` locale (`127.0.0.1`), mai `0.0.0.0` di default; il server non parte senza password; CSP stretta; i dati di terzi (Open Library) si mostrano solo con `textContent`, mai `innerHTML`.
- **Test per ogni modifica**: `./ci` (frontend: lint, vitest, build; backend: `node --test`) deve restare verde. Ogni schermata ha test di interazione (tocchi ripetuti, larghezza telefono).
- **UI in italiano**, pensata per il telefono: bersagli da toccare >= 44px con 8px di spazio, contrasto 4.5:1, icone SVG (non emoji), `prefers-reduced-motion`, nessuno scroll orizzontale.
- **Tema**: la palette viene dal logo ex libris (drago, gigli, luna) ed è in variabili CSS (`@theme` di `frontend/src/index.css`); ogni UI nuova le usa, niente colori scritti a mano.
- Nessun dato personale né valore dell'ambiente di deploy nel repo; `data/` è ignorata da git.
- Segnalazioni e lavoro: issue su GitHub.
