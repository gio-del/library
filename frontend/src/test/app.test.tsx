import { render, screen, waitFor } from '@testing-library/react';
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

  it('la libreria elenca i libri e i filtri di stato li restringono', async () => {
    server();
    open('/libreria');
    expect(await screen.findByText('Mansfield Park')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Letti/ }));
    expect(screen.queryByText('Mansfield Park')).not.toBeInTheDocument();
    expect(screen.getByText('Narnia')).toBeInTheDocument();
  });

  it('un doppio tocco su «Segna letto» manda una sola richiesta', async () => {
    const calls = server({ 'PATCH /api/books/9780306406157': { book: { ...BOOKS[0], read: true } } });
    open('/libro/9780306406157');
    const btn = await screen.findByRole('button', { name: 'Segna come letto' });
    await userEvent.dblClick(btn);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Segna come da leggere' })).toBeInTheDocument());
    expect(calls.filter((c) => c.startsWith('PATCH')).length).toBe(1);
  });

  it('«Rileggi i generi» aggiorna l’elenco', async () => {
    server({ 'POST /api/books/classify': { books: [{ ...BOOKS[0], genres: ['Classici'] }], changed: 1 } });
    open('/libreria');
    await userEvent.click(await screen.findByRole('button', { name: /Rileggi i generi/ }));
    expect(await screen.findByText('Generi aggiornati su 1 libri')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Classici (1)' })).toBeInTheDocument();
  });
});
