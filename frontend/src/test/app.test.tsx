import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../App';
import { AuthProvider } from '../state/auth';
import type { Book } from '../lib/types';

const BOOKS: Book[] = [
  { isbn: '9780306406157', title: 'Mansfield Park', authors: ['Jane Austen'], genres: ['Narrativa'], cover: 'a.jpg' },
  { isbn: '9780306406164', title: 'Narnia', authors: ['C. S. Lewis'], genres: ['Narrativa'], cover: 'b.jpg', read: true },
];

function server(over: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const routes: Record<string, unknown> = { 'GET /api/auth/status': { authenticated: true }, 'GET /api/books': BOOKS, ...over };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method || 'GET'} ${url}`;
    calls.push(key);
    if (init?.method === 'PATCH') await new Promise((r) => setTimeout(r, 200));
    const hit = routes[key];
    if (hit === undefined) return new Response(JSON.stringify({ error: 'Non trovato' }), { status: 404 });
    return new Response(JSON.stringify(hit), { status: 200 });
  }));
  return calls;
}

const open = (path: string) => render(<MemoryRouter initialEntries={[path]}><AuthProvider><App /></AuthProvider></MemoryRouter>);

afterEach(() => vi.unstubAllGlobals());

describe('app', () => {
  it('senza sessione mostra l’accesso', async () => {
    server({ 'GET /api/auth/status': { authenticated: false } });
    open('/libreria');
    expect(await screen.findByRole('button', { name: 'Accedi' })).toBeInTheDocument();
  });

  it('il fregio di stelle e lune c\u2019è in ogni schermata ed è decorativo', async () => {
    server({ 'GET /api/auth/status': { authenticated: false } });
    const { unmount } = open('/libreria');
    await screen.findByRole('button', { name: 'Accedi' });
    expect(screen.getAllByTestId('ornament')).toHaveLength(1);
    unmount();
    server();
    for (const [path, n] of [['/libreria', 2], ['/scansiona', 2], ['/note', 2], ['/libro/9780306406157', 1]] as const) {
      const r = open(path);
      await waitFor(() => expect(screen.getAllByTestId('ornament')).toHaveLength(n));
      for (const o of screen.getAllByTestId('ornament')) expect(o).toHaveAttribute('aria-hidden', 'true');
      r.unmount();
    }
  });

  it('il titolo riporta alla Libreria e azzera ricerca e filtri', async () => {
    server();
    open('/libreria');
    const search = await screen.findByRole('searchbox', { name: 'Cerca per titolo o autore' });
    await userEvent.type(search, 'narnia');
    expect(search).toHaveValue('narnia');
    await userEvent.click(screen.getByRole('link', { name: 'Torna alla Libreria' }));
    expect(screen.getByRole('searchbox', { name: 'Cerca per titolo o autore' })).toHaveValue('');
    await userEvent.click(screen.getByRole('link', { name: 'Note' }));
    await userEvent.click(screen.getByRole('link', { name: 'Torna alla Libreria' }));
    expect(await screen.findByRole('searchbox', { name: 'Cerca per titolo o autore' })).toBeInTheDocument();
  });

  it('il logo apre un dialogo, che si chiude con X, Esc e tocco fuori', async () => {
    server();
    open('/libreria');
    const logo = await screen.findByRole('button', { name: 'Mostra il logo ingrandito' });
    await userEvent.click(logo);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('img', { name: 'Logo della Libreria' })).toHaveAttribute('src', '/emblem.png');
    await userEvent.click(screen.getByRole('button', { name: 'Chiudi' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(logo).toHaveFocus();
    await userEvent.click(logo);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(logo);
    await userEvent.click(document.body.querySelector('[data-state="open"].fixed.inset-0') as Element);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('la copertina nella scheda si ingrandisce e si chiude con X, Esc e tocco fuori', async () => {
    server();
    open('/libro/9780306406157');
    const cover = await screen.findByRole('button', { name: 'Ingrandisci la copertina' });
    await userEvent.click(cover);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('img', { name: 'Copertina di Mansfield Park' })).toHaveAttribute('src', '/covers/a.jpg');
    await userEvent.click(screen.getByRole('button', { name: 'Chiudi' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(cover).toHaveFocus();
    await userEvent.click(cover);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(cover);
    await userEvent.click(screen.getByRole('dialog'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('senza copertina la scheda non ha il pulsante di ingrandimento', async () => {
    server({ 'GET /api/books': [{ isbn: '9780306406188', title: 'Senza', authors: [], genres: ['Narrativa'] }] });
    open('/libro/9780306406188');
    await screen.findByRole('heading', { level: 2, name: 'Senza' });
    expect(screen.queryByRole('button', { name: 'Ingrandisci la copertina' })).toBeNull();
  });

  it('la barra in basso ha tre voci e segna quella corrente', async () => {
    server();
    open('/libreria');
    const nav = await screen.findByRole('navigation', { name: 'Sezioni' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Libreria', 'Scansiona', 'Note']);
    expect(links[0]).toHaveAttribute('aria-current', 'page');
    await userEvent.click(links[1]);
    expect(links[1]).toHaveAttribute('aria-current', 'page');
  });

  it('la schermata Libreria non ha più i bottoni larghi di Gestione', async () => {
    server();
    open('/libreria');
    await screen.findByText('Mansfield Park');
    expect(screen.queryByRole('button', { name: /Rileggi i generi/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cerca di nuovo i libri/ })).not.toBeInTheDocument();
  });

  it('i chip di stato restringono l’elenco e contano', async () => {
    server();
    open('/libreria');
    expect(await screen.findByText('Mansfield Park')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Letti \(1\)/ }));
    expect(screen.queryByText('Mansfield Park')).not.toBeInTheDocument();
    expect(screen.getByText('Narnia')).toBeInTheDocument();
  });

  it('la ricerca trova per titolo e autore, senza badare agli accenti', async () => {
    server();
    open('/libreria');
    await screen.findByText('Mansfield Park');
    await userEvent.type(screen.getByRole('searchbox'), 'LEWIS');
    expect(screen.queryByText('Mansfield Park')).not.toBeInTheDocument();
    expect(screen.getByText('Narnia')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancella la ricerca' }));
    expect(screen.getByText('Mansfield Park')).toBeInTheDocument();
  });

  it('il foglio Filtri sceglie il genere, mostra il puntino e si azzera', async () => {
    server({ 'GET /api/books': [...BOOKS, { isbn: '9780306406171', title: 'Sapiens', authors: ['Harari'], genres: ['Saggio'], cover: 'c.jpg' }] });
    open('/libreria');
    await screen.findByText('Mansfield Park');
    expect(screen.queryByTestId('filter-dot')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Filtri' }));
    await userEvent.click(await screen.findByRole('button', { name: /^Saggio/ }));
    expect(screen.queryByText('Mansfield Park')).not.toBeInTheDocument();
    expect(screen.getByText('Sapiens')).toBeInTheDocument();
    expect(screen.getByTestId('filter-dot')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Togli il filtro Saggio' }));
    expect(screen.getByText('Mansfield Park')).toBeInTheDocument();
    expect(screen.queryByTestId('filter-dot')).not.toBeInTheDocument();
  });

  it('a 390 px nessuna riga dei filtri scorre e il genere attivo è una chip che va a capo', async () => {
    window.innerWidth = 390;
    server({ 'GET /api/books': [...BOOKS, { isbn: '9780306406171', title: 'Sapiens', authors: ['Harari'], genres: ['Saggio'], cover: 'c.jpg' }] });
    const { container } = open('/libreria');
    await screen.findByText('Mansfield Park');
    const stato = screen.getByRole('group', { name: 'Stato' });
    expect(within(stato).getAllByRole('button')).toHaveLength(3);
    await userEvent.click(screen.getByRole('button', { name: 'Filtri' }));
    await userEvent.click(await screen.findByRole('button', { name: /^Saggio/ }));
    const chips = await screen.findByTestId('active-filters');
    expect(chips.className).toContain('flex-wrap');
    const scorrevoli = [...container.querySelectorAll('*')].filter((el) => /(^|\s)overflow-x-(auto|scroll)(\s|$)/.test(el.getAttribute('class') || ''));
    expect(scorrevoli).toHaveLength(0);
    expect(stato.className).toContain('grid-cols-3');
    await userEvent.click(screen.getByRole('button', { name: 'Togli il filtro Saggio' }));
    expect(screen.queryByTestId('active-filters')).not.toBeInTheDocument();
  });

  it('il foglio Filtri ordina la lista per titolo e autore e si azzera', async () => {
    window.innerWidth = 390;
    server({ 'GET /api/books': [
      { isbn: '9780306406157', title: 'Mansfield Park', authors: ['Jane Austen'], cover: 'a.jpg', added: '2026-01-01' },
      { isbn: '9780306406164', title: 'Narnia', authors: ['C. S. Lewis'], cover: 'b.jpg', added: '2026-02-01' },
      { isbn: '9780306406171', title: 'Àlbum', authors: ['Zola'], cover: 'c.jpg', added: '2026-03-01' },
    ] });
    open('/libreria');
    await screen.findByText('Mansfield Park');
    const titles = () => screen.getAllByRole('link', { name: /Mansfield|Narnia|Àlbum/ }).map((a) => a.textContent);
    expect(titles()[0]).toContain('Àlbum');
    await userEvent.click(screen.getByRole('button', { name: 'Filtri' }));
    const group = await screen.findByRole('group', { name: 'Ordina per' });
    expect(within(group).getAllByRole('button')).toHaveLength(3);
    expect(within(group).getByRole('button', { name: 'Aggiunti di recente' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(group).getByRole('button', { name: 'Titolo A→Z' }));
    await userEvent.click(within(group).getByRole('button', { name: 'Titolo A→Z' }));
    expect(within(group).getByRole('button', { name: 'Titolo A→Z' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(group).getByRole('button', { name: 'Autore A→Z' }));
    await userEvent.click(screen.getByRole('button', { name: 'Azzera tutto' }));
    expect(titles()[0]).toContain('Àlbum');
    await userEvent.click(screen.getByRole('button', { name: 'Filtri' }));
    expect(within(await screen.findByRole('group', { name: 'Ordina per' })).getByRole('button', { name: 'Aggiunti di recente' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('Gestione chiede conferma e poi rilegge i generi', async () => {
    const calls = server({ 'POST /api/books/classify': { books: [{ ...BOOKS[0], genres: ['Classici'] }], changed: 1 } });
    open('/libreria');
    await screen.findByText('Mansfield Park');
    await userEvent.click(screen.getByRole('button', { name: 'Altro' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Rileggi i generi/ }));
    expect(calls.some((c) => c.startsWith('POST'))).toBe(false);
    await userEvent.click(await screen.findByRole('button', { name: 'Rileggi i generi' }));
    expect(await screen.findByText('Generi aggiornati su 1 libri')).toBeInTheDocument();
  });

  it('Gestione: esporta come allegato e importa un file con il riepilogo', async () => {
    const calls = server({ 'POST /api/books/import': { added: 2, skipped: 1, invalid: 0 } });
    open('/libreria');
    await screen.findByText('Mansfield Park');
    await userEvent.click(screen.getByRole('button', { name: 'Altro' }));
    expect(await screen.findByRole('menuitem', { name: /Esporta \(JSON\)/ })).toHaveAttribute('href', '/api/books/export?format=json');
    expect(screen.getByRole('menuitem', { name: /Esporta \(CSV\)/ })).toHaveAttribute('href', '/api/books/export?format=csv');
    await userEvent.click(screen.getByRole('menuitem', { name: /Importa/ }));
    const file = new File([JSON.stringify([{ isbn: '9780306406157' }])], 'libreria.json', { type: 'application/json' });
    await userEvent.upload(screen.getByLabelText('File da importare'), file);
    expect(await screen.findByText('Aggiunti 2 libri, saltati 1')).toBeInTheDocument();
    expect(calls.filter((c) => c === 'POST /api/books/import').length).toBe(1);
  });

  it('Gestione apre le Statistiche, con i numeri della Libreria e il ritorno', async () => {
    server();
    open('/libreria');
    await screen.findByText('Mansfield Park');
    await userEvent.click(screen.getByRole('button', { name: 'Altro' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Statistiche/ }));
    expect(await screen.findByRole('heading', { name: 'Statistiche' })).toBeInTheDocument();
    expect(screen.getByText('2', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Libri letti' })).toHaveAttribute('aria-valuetext', '1 letti su 2 (50%)');
    expect(screen.getByRole('img', { name: 'Narrativa: 2 su 2' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Indietro' }));
    expect(await screen.findByText('Mansfield Park')).toBeInTheDocument();
  });

  it('Statistiche con libreria vuota mostra un messaggio', async () => {
    server({ 'GET /api/books': [] });
    open('/statistiche');
    expect(await screen.findByText(/La libreria è vuota/)).toBeInTheDocument();
  });

  it('Gestione: un file che non è JSON dà un errore e non chiama il server', async () => {
    const calls = server();
    open('/libreria');
    await screen.findByText('Mansfield Park');
    await userEvent.upload(screen.getByLabelText('File da importare'), new File(['{rotto'], 'x.json', { type: 'application/json' }));
    expect(await screen.findByText('Il file non è un JSON valido')).toBeInTheDocument();
    expect(calls.some((c) => c.startsWith('POST'))).toBe(false);
  });

  it('un doppio tocco su «Segna come letto» manda una sola richiesta', async () => {
    const calls = server({ 'PATCH /api/books/9780306406157': { book: { ...BOOKS[0], read: true } } });
    open('/libro/9780306406157');
    const btn = await screen.findByRole('button', { name: 'Segna come letto' });
    await userEvent.dblClick(btn);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Segna come da leggere' })).toBeInTheDocument());
    expect(calls.filter((c) => c.startsWith('PATCH')).length).toBe(1);
  });

  it('eliminare un libro passa da una conferma e torna all’elenco', async () => {
    const calls = server({ 'DELETE /api/books/9780306406157': {} });
    open('/libro/9780306406157');
    await userEvent.click(await screen.findByRole('button', { name: /Elimina/ }));
    expect(calls.some((c) => c.startsWith('DELETE'))).toBe(false);
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Elimina' }));
    expect(await screen.findByRole('navigation', { name: 'Sezioni' })).toBeInTheDocument();
    expect(calls.filter((c) => c.startsWith('DELETE')).length).toBe(1);
  });

  it('il modulo a mano mostra l’errore sotto il campo e non invia', async () => {
    const calls = server();
    open('/scansiona/manuale');
    await userEvent.click(await screen.findByRole('button', { name: 'Salva' }));
    expect(await screen.findByText('Il titolo è obbligatorio')).toBeInTheDocument();
    expect(screen.getByLabelText('Titolo (obbligatorio)')).toHaveAttribute('aria-invalid', 'true');
    expect(calls.some((c) => c.startsWith('POST'))).toBe(false);
  });

  it('il filtro «Da classificare» compare solo se c’è un libro senza genere', async () => {
    server();
    open('/libreria');
    await screen.findByText('Mansfield Park');
    await userEvent.click(screen.getByRole('button', { name: /Filtri/ }));
    expect(screen.queryByRole('button', { name: /Da classificare/ })).not.toBeInTheDocument();
  });

  it('i libri senza genere (o con «Altro») si trovano in «Da classificare»', async () => {
    server({ 'GET /api/books': [...BOOKS, { isbn: '9780306406171', title: 'Threshing Day', authors: [], genres: ['Altro'], cover: 'c.jpg' }] });
    open('/libreria');
    await screen.findByText('Threshing Day');
    await userEvent.click(screen.getByRole('button', { name: /Filtri/ }));
    expect(screen.queryByRole('button', { name: /^Altro/ })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: /Da classificare/ }));
    expect(screen.getByText('Threshing Day')).toBeInTheDocument();
    expect(screen.queryByText('Mansfield Park')).not.toBeInTheDocument();
  });

  it('dalla scheda si scelgono a mano più generi e si salvano', async () => {
    const book = { isbn: '9780306406171', title: 'Threshing Day', authors: [], genres: [] as string[] };
    const sent: unknown[] = [];
    const calls = server({ 'GET /api/books': [book], 'PATCH /api/books/9780306406171': { book: { ...book, genres: ['Fantasy', 'Romantasy'] } } });
    const f = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => { if (init?.method === 'PATCH') sent.push(JSON.parse(String(init.body))); return (f as typeof fetch)(url, init); }));
    open('/libro/9780306406171');
    await userEvent.click(await screen.findByRole('button', { name: /Modifica/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Fantasy' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Romantasy' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    await screen.findByText('Salvato');
    expect(sent).toHaveLength(1);
    expect((sent[0] as { genres: string[] }).genres).toEqual(['Fantasy', 'Romantasy']);
    expect(calls.filter((c) => c.startsWith('PATCH')).length).toBe(1);
  });
  // jsdom non calcola il layout: il controllo guarda la pila di sovrapposizione. Un elemento con z-index
  // nel contenuto di una schermata deve stare dentro un contesto isolato (isolate), altrimenti può
  // finire sopra la barra fissa dei filtri (z-10) e delle intestazioni quando si scorre.
  function sfuggeAllaPila(root: HTMLElement) {
    const z = /(^|\s)-?z-(\d+)(\s|$)/;
    return [...root.querySelectorAll('[class]')].filter((el) => {
      const c = el.getAttribute('class') || '';
      if (!z.test(c) || el.closest('[data-sticky-bar]') === el) return false;
      if (/(^|\s)fixed(\s|$)/.test(c) || el.closest('header,nav,[role="dialog"]')) return false;
      for (let p = el.parentElement; p && p !== root; p = p.parentElement) {
        if (/(^|\s)isolate(\s|$)/.test(p.getAttribute('class') || '')) return false;
      }
      return true;
    });
  }

  it.each([360, 390])('a %i px il badge non finisce sopra la barra dei filtri, con e senza filtri, anche toccando di continuo', async (w) => {
    window.innerWidth = w;
    server({ 'GET /api/books': [...BOOKS, { isbn: '9780306406171', title: 'Sapiens', authors: ['Harari'], genres: ['Saggio'], cover: 'c.jpg' }] });
    const { container } = open('/libreria');
    await screen.findByText('Mansfield Park');
    const barra = screen.getByRole('group', { name: 'Stato' }).parentElement as HTMLElement;
    const zBarra = Number(/(^|\s)z-(\d+)/.exec(barra.className)?.[2]);
    expect(barra.className).toContain('sticky');
    expect(screen.getAllByText('Da leggere').length).toBeGreaterThan(0);
    expect(sfuggeAllaPila(container)).toEqual([]);
    for (const el of container.querySelectorAll('ul [class]')) {
      const m = /(^|\s)z-(\d+)/.exec(el.getAttribute('class') || '');
      if (m) expect(Number(m[2])).toBeLessThanOrEqual(zBarra);
    }
    for (let i = 0; i < 3; i++) {
      await userEvent.click(screen.getByRole('button', { name: /^Da leggere/ }));
      expect(sfuggeAllaPila(container)).toEqual([]);
      await userEvent.click(screen.getByRole('button', { name: /^Letti/ }));
      expect(sfuggeAllaPila(container)).toEqual([]);
    }
    await userEvent.click(screen.getByRole('button', { name: /^Tutti/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Filtri' }));
    await userEvent.click(await screen.findByRole('button', { name: /^Saggio/ }));
    expect(screen.getByTestId('active-filters')).toBeInTheDocument();
    expect(sfuggeAllaPila(container)).toEqual([]);
  });

  it('Scansiona e Note non hanno elementi con z-index fuori da un contesto isolato', async () => {
    server();
    for (const path of ['/scansiona', '/note']) {
      const r = open(path);
      await waitFor(() => expect(screen.getAllByTestId('ornament').length).toBeGreaterThan(0));
      expect(sfuggeAllaPila(r.container)).toEqual([]);
      r.unmount();
    }
  });
});
