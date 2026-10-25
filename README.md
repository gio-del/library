# library

Scansiona il codice a barre (ISBN) dei tuoi libri col telefono e tieni una libreria virtuale. Node 22, nessuna dipendenza npm, nessuna build. I dati dei libri vengono da [Open Library](https://openlibrary.org); le copertine sono scaricate dal server, così il telefono non contatta terzi.

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
| `DATA_DIR` | `./data` | `books.json` e `covers/` |
| `AUTH_USER` | `library` | utente del login |
| `AUTH_PASSWORD` / `AUTH_PASSWORD_FILE` | obbligatoria | password, o file che la contiene; senza, il server non parte |

## API

`GET /api/auth/status` (libero), `POST /api/login`, `POST /api/logout`, `GET /api/books`, `POST /api/books {isbn}`, `DELETE /api/books/:isbn`. Tutto tranne lo stato e il login richiede la sessione.

## Test

```
node --test
```
