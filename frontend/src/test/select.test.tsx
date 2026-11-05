import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../App';
import { AuthProvider } from '../state/auth';
import type { Book } from '../lib/types';

const BOOKS: Book[] = [
  { isbn: '9780306406157', title: 'Mansfield Park', authors: ['Jane Austen'], genres: ['Narrativa'], cover: 'a.jpg' },
  { isbn: '9780306406164', title: 'Narnia', authors: ['C. S. Lewis'], genres: ['Narrativa'], cover: 'b.jpg', read: true },
  { isbn: '9780306406171', title: 'Emma', authors: ['Jane Austen'], genres: ['Classici'], cover: 'c.jpg' },
];

function server(bulk: unknown = { done: 2, failed: 0, unchanged: 0, books: [], removed: [] }, status = 200) {
  const bodies: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method || 'GET'} ${url}`;
    if (key === 'POST /api/books/bulk') { bodies.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify(bulk), { status }); }
    const routes: Record<string, unknown> = { 'GET /api/auth/status': { authenticated: true }, 'GET /api/books': BOOKS };
    return routes[key] === undefined ? new Response('{}', { status: 404 }) : new Response(JSON.stringify(routes[key]), { status: 200 });
  }));
  return bodies;
}

const open = () => render(<MemoryRouter initialEntries={['/libreria']}><AuthProvider><App /></AuthProvider></MemoryRouter>);
afterEach(() => vi.unstubAllGlobals());

describe('selezione multipla', () => {
  it('seleziona, tocchi ripetuti, segna come letti con un’unica richiesta e mostra il parziale', async () => {
    const bodies = server({ done: 1, failed: 1, unchanged: 0, books: [{ ...BOOKS[0], read: true }], removed: [] });
    open();
    await screen.findByRole('link', { name: /Mansfield/ });
    await userEvent.click(screen.getByRole('button', { name: 'Seleziona' }));
    const toolbar = screen.getByRole('toolbar');
    expect(within(toolbar).getByText('0 selezionati')).toBeInTheDocument();
    const a = screen.getByRole('button', { name: 'Seleziona Mansfield Park' });
    await userEvent.click(a); await userEvent.click(a); await userEvent.click(a);
    await userEvent.click(screen.getByRole('button', { name: 'Seleziona Emma' }));
    expect(within(toolbar).getByText('2 selezionati')).toBeInTheDocument();
    await userEvent.click(within(toolbar).getByRole('button', { name: 'Segna come letti' }));
    await waitFor(() => expect(bodies).toEqual([{ isbns: ['9780306406157', '9780306406171'], action: 'read' }]));
    expect((await screen.findByRole('alert')).textContent).toBe('Aggiornati 1 libro, 1 non aggiornati.');
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('«Seleziona tutti i visibili» rispetta i filtri', async () => {
    const bodies = server();
    open();
    await userEvent.type(await screen.findByRole('searchbox', { name: 'Cerca nella libreria' }), 'austen');
    await userEvent.click(screen.getByRole('button', { name: 'Seleziona' }));
    await userEvent.click(screen.getByRole('button', { name: 'Seleziona tutti i visibili' }));
    expect(screen.getByText('2 selezionati')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Segna da leggere' }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ isbns: expect.arrayContaining(['9780306406171', '9780306406157']), action: 'unread' });
    expect((bodies[0] as { isbns: string[] }).isbns).toHaveLength(2);
  });

  it('elimina chiede conferma; aggiungi genere usa il genere scelto', async () => {
    const bodies = server();
    open();
    await userEvent.click(await screen.findByRole('button', { name: 'Seleziona' }));
    await userEvent.click(screen.getByRole('button', { name: 'Seleziona Narnia' }));
    await userEvent.click(screen.getByRole('button', { name: 'Elimina' }));
    expect(bodies).toEqual([]);
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Annulla' }));
    expect(bodies).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Aggiungi genere' }));
    await userEvent.click(within(screen.getByRole('group', { name: 'Genere da aggiungere' })).getByRole('button', { name: 'Classici' }));
    await waitFor(() => expect(bodies).toEqual([{ isbns: ['9780306406164'], action: 'addGenre', value: 'Classici' }]));
    await userEvent.click(await screen.findByRole('button', { name: 'Seleziona' }));
    await userEvent.click(screen.getByRole('button', { name: 'Seleziona Narnia' }));
    await userEvent.click(screen.getByRole('button', { name: 'Elimina' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Elimina' }));
    await waitFor(() => expect(bodies[1]).toEqual({ isbns: ['9780306406164'], action: 'delete' }));
  });

  it('se la richiesta fallisce dice quanti libri non sono stati aggiornati', async () => {
    server({ error: 'Errore del server' }, 500);
    open();
    await userEvent.click(await screen.findByRole('button', { name: 'Seleziona' }));
    await userEvent.click(screen.getByRole('button', { name: 'Seleziona Narnia' }));
    await userEvent.click(screen.getByRole('button', { name: 'Seleziona Emma' }));
    await userEvent.click(screen.getByRole('button', { name: 'Segna come letti' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Nessun libro aggiornato: 2 non aggiornati/);
    expect(screen.getByText('2 selezionati')).toBeInTheDocument();
  });

  it('barra e bersagli utilizzabili a 360px: pulsanti >= 44px (classi min-h-11/size-11+)', async () => {
    server();
    open();
    await userEvent.click(await screen.findByRole('button', { name: 'Seleziona' }));
    for (const b of within(screen.getByRole('toolbar')).getAllByRole('button')) expect(b.className).toMatch(/min-h-11|size-11|size-12/);
  });
});
