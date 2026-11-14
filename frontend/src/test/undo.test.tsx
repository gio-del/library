import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../App';
import { AuthProvider } from '../state/auth';
import type { Book } from '../lib/types';

const A: Book = { isbn: '9780306406157', title: 'Mansfield Park', authors: ['Jane Austen'], genres: ['Narrativa'], cover: 'a.jpg', rating: 4 };
const B: Book = { isbn: '9780306406164', title: 'Narnia', authors: ['C. S. Lewis'], genres: ['Narrativa'], cover: 'b.jpg' };

function server(restore: { status: number; body: unknown } = { status: 200, body: { books: [A], skipped: [] } }) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method || 'GET'} ${url}`;
    calls.push(key);
    if (key === 'POST /api/books/restore') return new Response(JSON.stringify(restore.body), { status: restore.status });
    if (key === `DELETE /api/books/${A.isbn}`) return new Response('{"ok":true}');
    if (key === 'POST /api/books/bulk') return new Response(JSON.stringify({ done: 2, failed: 0, unchanged: 0, books: [], removed: [A.isbn, B.isbn] }));
    const routes: Record<string, unknown> = { 'GET /api/auth/status': { authenticated: true }, 'GET /api/books': [A, B] };
    return routes[key] === undefined ? new Response('{}', { status: 404 }) : new Response(JSON.stringify(routes[key]));
  }));
  return calls;
}
const open = (path: string) => render(<MemoryRouter initialEntries={[path]}><AuthProvider><App /></AuthProvider></MemoryRouter>);
afterEach(() => vi.unstubAllGlobals());

describe('Annulla l’eliminazione', () => {
  it('scheda libro: il toast ha «Annulla» e il libro torna in elenco', async () => {
    const calls = server();
    open(`/libro/${A.isbn}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Elimina' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Elimina' }));
    await screen.findByText('Libro eliminato');
    expect(screen.queryByRole('link', { name: /Mansfield/ })).toBeNull();
    const undo = await screen.findByRole('button', { name: 'Annulla' });
    await userEvent.click(undo);
    await screen.findByText('Libro ripristinato');
    expect(calls.filter((c) => c === 'POST /api/books/restore')).toHaveLength(1);
    expect(await screen.findByRole('link', { name: /Mansfield/ })).toBeInTheDocument();
  });

  it('selezione multipla: un solo «Annulla» rimette tutti', async () => {
    const calls = server({ status: 200, body: { books: [A, B], skipped: [] } });
    open('/libreria');
    await userEvent.click(await screen.findByRole('button', { name: 'Seleziona' }));
    await userEvent.click(screen.getByRole('button', { name: 'Seleziona tutti i visibili' }));
    await userEvent.click(screen.getByRole('button', { name: 'Elimina' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Elimina' }));
    await screen.findByText('Eliminati 2 libri.');
    expect(screen.queryByRole('link', { name: /Narnia/ })).toBeNull();
    const undo = screen.getByRole('button', { name: 'Annulla' });
    await userEvent.click(undo);
    await screen.findByText('Ripristinati 2 libri.');
    expect(calls.filter((c) => c === 'POST /api/books/restore')).toHaveLength(1);
    expect(await screen.findByRole('link', { name: /Narnia/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Annulla' })).toBeNull();
  });

  it('ripristino tardivo: mostra l’errore del server', async () => {
    server({ status: 404, body: { error: 'Niente da ripristinare' } });
    open('/libreria');
    await userEvent.click(await screen.findByRole('button', { name: 'Seleziona' }));
    await userEvent.click(screen.getByRole('button', { name: 'Seleziona tutti i visibili' }));
    await userEvent.click(screen.getByRole('button', { name: 'Elimina' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Elimina' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Annulla' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Niente da ripristinare'));
  });
});
