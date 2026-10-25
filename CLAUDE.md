# library — regole del Project

Scan ISBN e libreria virtuale (webapp Node). Il codice vive solo su questo remote.

- **Niente build e niente dipendenze npm** senza una decisione dell'owner: solo moduli `node:*`, frontend in HTML/CSS/JS semplici.
- **Sicuro di default**: ascolto su `LISTEN_HOST` locale (`127.0.0.1`), mai `0.0.0.0` di default; il server non parte senza password; CSP stretta; i dati di terzi (Open Library) si mostrano solo con `textContent`, mai `innerHTML`.
- **Test per ogni modifica**: `node --test` deve restare verde.
- **UI in italiano**, pensata per il telefono (bersagli da toccare grandi, una colonna).
- Nessun dato personale né valore dell'ambiente di deploy nel repo; `data/` è ignorata da git.
- Segnalazioni e lavoro: issue su GitHub.
