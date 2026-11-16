import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../App';
import { AuthProvider } from '../state/auth';
import type { WishItem } from '../lib/types';

const A: WishItem = { isbn: '9780306406157', title: 'Dune', authors: ['Frank Herbert'], cover: 'a.jpg' };
const B: WishItem = { isbn: '9780306406164', title: 'Narnia', authors: ['C. S. Lewis'], cover: null };
const C: WishItem = { isbn: '9780306406171', title: 'Emma', authors: ['Jane Austen'], cover: null };

function server(restore: { status: number; body: unknown } = { status: 200, body: { item: B, index: 1 } }) {
  let list = [A, B, C];
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method || 'GET'} ${url}`;
    calls.push(key);
    const ok = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
    if (key === 'GET /api/auth/status') return ok({ authenticated: true });
    if (key === 'GET /api/books') return ok([]);
    if (key === 'GET /api/wishlist') return ok(list);
    if (key === `DELETE /api/wishlist/${B.isbn}`) { list = list.filter((x) => x !== B); return ok({ ok: true }); }
    if (key === 'POST /api/wishlist/restore') { if (restore.status === 200) list = [A, B, C]; return ok(restore.body, restore.status); }
    return ok({}, 404);
  }));
  return calls;
}
const open = () => render(<MemoryRouter initialEntries={['/desideri']}><AuthProvider><App /></AuthProvider></MemoryRouter>);
const titles = () => screen.getAllByRole('listitem').map((li) => li.querySelector('p')?.textContent);
afterEach(() => vi.unstubAllGlobals());

describe.each([360, 390])('Annulla «Togli» dai desideri a %i px', (w) => {
  beforeEach(() => { window.innerWidth = w; });

  it('togli, annulla (doppio tocco: una sola richiesta) e il desiderio torna al suo posto', async () => {
    const calls = server();
    open();
    await userEvent.click(await screen.findByRole('button', { name: 'Togli Narnia dai desideri' }));
    await screen.findByText('Tolto dai desideri');
    expect(titles()).toEqual(['Dune', 'Emma']);
    const undo = screen.getByRole('button', { name: 'Annulla' });
    expect(undo.className).toContain('min-h-11');
    await userEvent.dblClick(undo);
    await screen.findByText('Desiderio rimesso');
    expect(calls.filter((c) => c === 'POST /api/wishlist/restore')).toHaveLength(1);
    expect(titles()).toEqual(['Dune', 'Narnia', 'Emma']);
    expect(screen.queryByRole('button', { name: 'Annulla' })).toBeNull();
  });

  it('senza Annulla il desiderio resta tolto', async () => {
    const calls = server();
    open();
    await userEvent.click(await screen.findByRole('button', { name: 'Togli Narnia dai desideri' }));
    await screen.findByText('Tolto dai desideri');
    expect(titles()).toEqual(['Dune', 'Emma']);
    expect(calls).not.toContain('POST /api/wishlist/restore');
  });

  it('ripristino scaduto: mostra l’errore e la lista non cambia', async () => {
    server({ status: 404, body: { error: 'Niente da ripristinare' } });
    open();
    await userEvent.click(await screen.findByRole('button', { name: 'Togli Narnia dai desideri' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Annulla' }));
    await screen.findByText('Niente da ripristinare');
    expect(titles()).toEqual(['Dune', 'Emma']);
  });
});
