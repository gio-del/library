# library

Scansiona il codice a barre (ISBN) dei tuoi libri col telefono e tieni una libreria virtuale. Node 22, backend senza dipendenze npm; frontend React + Vite in `frontend/` (`./ci` lo costruisce in `public/`). I dati dei libri vengono da [Open Library](https://openlibrary.org); le copertine sono scaricate dal server, così il telefono non contatta terzi.

## Avvio

```
AUTH_PASSWORD=una-password node server.js
```

Poi apri `http://127.0.0.1:8080`. Per la fotocamera il browser vuole HTTPS (metti il servizio dietro un proxy HTTPS); il cookie di sessione è `Secure`.

## Variabili d'ambiente

| Variabile | Default | Significato |
|---|---|---|
| `LISTEN_HOST` | `127.0.0.1` | indirizzo di ascolto (mai `0.0.0.0` di default) |
| `PORT` | `8080` | porta |
| `DATA_DIR` | `./data` | `books.json`, `covers/` e, se vuoi, `logo.png` o `logo.jpg` (il tuo logo nella schermata di accesso; senza, l’emblema dell’app) |
| `AUTH_USER` | `library` | utente del login |
| `AUTH_PASSWORD` / `AUTH_PASSWORD_FILE` | obbligatoria | password, o file che la contiene; senza, il server non parte |
| `CLAUDE_BIN` | spenta | percorso di Claude Code (`claude`): attiva «Leggi i dati dalla foto». Senza, `POST /api/cover-read` risponde 404 e l’interfaccia non mostra il pulsante |
| `CLAUDE_TIMEOUT_MS` | `60000` | tempo massimo di una lettura |

A ogni salvataggio la versione precedente resta in `DATA_DIR/books.json.bak`; se `books.json` si rovina, il server riparte dal `.bak` (con un avviso nel log), e per ripristinare a mano basta copiare il `.bak` su `books.json`.

### Leggere i dati dalla foto della copertina

Funzione facoltativa, spenta di default. Per attivarla: installa Claude Code, fai il login (`claude`, una volta) **con l’utente che fa girare il server** e imposta `CLAUDE_BIN` con il percorso dell’eseguibile. Il server lancia, senza shell, `claude -p --model haiku --strict-mcp-config --tools Read --allowedTools Read --output-format json` in una cartella temporanea propria della richiesta (cancellata sempre), senza strumenti web, una lettura alla volta (le altre ricevono 429). Titolo, autori, editore e lingua letti dalla copertina compilano solo i campi vuoti, marcati «dalla foto»; non si salva nulla finché non premi «Salva».

## API

`GET /api/auth/status` (libero), `POST /api/login`, `POST /api/logout`, `GET /api/books`, `POST /api/books {isbn}`, `DELETE /api/books/:isbn`, `PATCH /api/books/:isbn` (tra i campi modificabili: `read`, `rating` intero 1–5 e `readAt` data `AAAA-MM-GG`; `null` toglie voto o data, valori fuori intervallo danno 400; JSON e CSV di export e import li includono), `GET /api/books/export?format=json|csv` (allegato con tutti i libri; il CSV ha ISBN, titolo, autori, editore, anno, letto, generi, note, voto e data di lettura e protegge le celle che iniziano con `=`, `+`, `-`, `@`), `POST /api/cover-read` (corpo: un JPEG, max 2 MB; risponde `{title, subtitle, authors, publisher, language, confidence}`; solo con `CLAUDE_BIN`), `POST /api/books/import` (corpo: il JSON esportato, max 5 MB; aggiunge i libri mancanti senza sovrascrivere quelli con lo stesso ISBN e risponde `{added, skipped, invalid}`; le copertine non sono incluse, le recupera «Cerca di nuovo i dati»). `GET /api/goal` e `PUT /api/goal {goal}` (obiettivo di lettura annuale, salvato in `DATA_DIR/goal.json`: `goal` è un intero da 1 a 999, altri valori danno 400; senza obiettivo `GET` risponde `{goal: null}`). `GET /api/wishlist`, `POST /api/wishlist {isbn}` e `DELETE /api/wishlist/:isbn` (lista «Da comprare», separata dalla libreria, salvata in `DATA_DIR/wishlist.json` con scrittura atomica e copia `.bak`: `POST` cerca titolo, autori e copertina, risponde 201 `{status:'saved', item}`, 200 `{status:'exists', item}` se è già nei desideri e 409 se l’ISBN è già in libreria; `DELETE` risponde 404 se non c’è; aggiungere il libro alla libreria con `POST /api/books` lo toglie dai desideri). I desideri restano fuori da statistiche, filtri, obiettivo di lettura, export e import. Tutto tranne lo stato e il login richiede la sessione.

## Test

```
node --test
```
