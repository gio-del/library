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
});
