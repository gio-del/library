import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../App';
import { AuthProvider } from '../state/auth';
import type { Book } from '../lib/types';
import { todayIso, wishlistText } from '../lib/books';
import { pacing } from '../hooks/useCompleteMissing';

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
    const search = await screen.findByRole('searchbox', { name: 'Cerca nella libreria' });
    await userEvent.type(search, 'narnia');
    expect(search).toHaveValue('narnia');
    await userEvent.click(screen.getByRole('link', { name: 'Torna alla Libreria' }));
    expect(screen.getByRole('searchbox', { name: 'Cerca nella libreria' })).toHaveValue('');
    await userEvent.click(screen.getByRole('link', { name: 'Note' }));
    await userEvent.click(screen.getByRole('link', { name: 'Torna alla Libreria' }));
    expect(await screen.findByRole('searchbox', { name: 'Cerca nella libreria' })).toBeInTheDocument();
  });

  it('tornando dalla scheda di un libro la Libreria ricorda ricerca, filtri e posizione; il titolo azzera', async () => {
    server();
    open('/libreria');
    await userEvent.type(await screen.findByRole('searchbox', { name: 'Cerca nella libreria' }), 'narnia');
    await userEvent.click(screen.getByRole('button', { name: 'Filtri' }));
    await userEvent.click(screen.getByRole('button', { name: 'Voto' }));
    await userEvent.click(within(screen.getByRole('group', { name: 'Genere' })).getByRole('button', { name: /Narrativa/ }));
    window.scrollTo = vi.fn();
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 240 });
    await userEvent.click(await screen.findByRole('link', { name: /Narnia/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Indietro' }));
    expect(await screen.findByRole('searchbox', { name: 'Cerca nella libreria' })).toHaveValue('narnia');
    expect(within(screen.getByTestId('active-filters')).getByRole('button', { name: 'Togli il filtro Testo narnia' })).toBeInTheDocument();
    expect(within(screen.getByTestId('active-filters')).getByRole('button', { name: 'Togli il filtro Narrativa' })).toBeInTheDocument();
    await waitFor(() => expect(window.scrollTo).toHaveBeenCalledWith({ top: 240 }));
    await userEvent.click(screen.getByRole('button', { name: 'Filtri' }));
    expect(screen.getByRole('button', { name: 'Voto' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('link', { name: 'Torna alla Libreria' }));
    expect(screen.getByRole('searchbox', { name: 'Cerca nella libreria' })).toHaveValue('');
    delete (window as { scrollY?: number }).scrollY;
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

  it('la ricerca copre le note, si combina con i filtri e dice quando non trova nulla', async () => {
    server({ 'GET /api/books': [...BOOKS, { isbn: '9780306406171', title: 'Sapiens', authors: ['Harari'], notes: 'Copertina blu, perché no', cover: 'c.jpg' }] });
    open('/libreria');
    await screen.findByText('Mansfield Park');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Cerca nella libreria' }), '  PERCHE ');
    expect(screen.getByText('Sapiens')).toBeInTheDocument();
    expect(screen.queryByText('Mansfield Park')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Togli il filtro Testo PERCHE' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Letti/ }));
    expect(screen.queryByText('Sapiens')).not.toBeInTheDocument();
    expect(screen.getByText('Nessun libro corrisponde ai filtri.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Togli il filtro Testo PERCHE' }));
    expect(screen.getByText('Narnia')).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });

  it('il filtro «Da completare» mostra i libri con dati mancanti, si combina con gli altri e si toglie dal chip', async () => {
    const full = { cover: 'c.jpg', publisher: 'Einaudi', year: '2001' };
    server({ 'GET /api/books': [
      { isbn: '9780306406157', title: 'Completo', authors: ['Rossi'], ...full },
      { isbn: '9780306406164', title: 'SenzaAnno', authors: ['Rossi'], ...full, year: '' },
      { isbn: '9780306406171', title: 'SenzaCopertina', authors: ['Bianchi'], ...full, cover: null, read: true },
    ] });
    open('/libreria');
    await screen.findByText('Completo');
    await userEvent.click(screen.getByRole('button', { name: 'Filtri' }));
    const group = within(await screen.findByRole('group', { name: 'Dati mancanti' }));
    expect(group.getByRole('button', { name: /^Da completare/ })).toHaveTextContent('2');
    await userEvent.click(group.getByRole('button', { name: /^Da completare/ }));
    expect(screen.queryByText('Completo')).not.toBeInTheDocument();
    expect(screen.getByText('SenzaAnno')).toBeInTheDocument();
    expect(screen.getAllByText('SenzaCopertina').length).toBeGreaterThan(0);
    expect(screen.getByTestId('filter-dot')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Letti/ }));
    expect(screen.queryByText('SenzaAnno')).not.toBeInTheDocument();
    expect(screen.getAllByText('SenzaCopertina').length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: /^Tutti/ }));
    await userEvent.type(screen.getByRole('searchbox'), 'senzaanno');
    expect(screen.queryByText('SenzaCopertina')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancella la ricerca' }));
    await userEvent.click(screen.getByRole('button', { name: 'Togli il filtro Da completare' }));
    expect(screen.getByText('Completo')).toBeInTheDocument();
    expect(screen.queryByTestId('filter-dot')).not.toBeInTheDocument();
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
    expect(titles()[0]).toContain('Mansfield');
    await userEvent.click(screen.getByRole('button', { name: 'Filtri' }));
    let group = await screen.findByRole('group', { name: 'Ordina per' });
    expect(within(group).getAllByRole('button')).toHaveLength(6);
    expect(within(group).getByRole('button', { name: 'Autore A→Z' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Azzera tutto' })).toBeDisabled();
    await userEvent.click(within(group).getByRole('button', { name: 'Aggiunti di recente' }));
    expect(screen.getByRole('button', { name: 'Azzera tutto' })).toBeEnabled();
    await userEvent.keyboard('{Escape}');
    expect(titles()[0]).toContain('Àlbum');
    await userEvent.click(screen.getByRole('button', { name: 'Filtri' }));
    group = await screen.findByRole('group', { name: 'Ordina per' });
    await userEvent.click(within(group).getByRole('button', { name: 'Titolo A→Z' }));
    await userEvent.click(within(group).getByRole('button', { name: 'Titolo A→Z' }));
    expect(within(group).getByRole('button', { name: 'Titolo A→Z' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(group).getByRole('button', { name: 'Autore A→Z' }));
    await userEvent.click(within(group).getByRole('button', { name: 'Voto' }));
    expect(within(group).getByRole('button', { name: 'Voto' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Azzera tutto' }));
    expect(titles()[0]).toContain('Mansfield');
    await userEvent.click(screen.getByRole('button', { name: 'Filtri' }));
    expect(within(await screen.findByRole('group', { name: 'Ordina per' })).getByRole('button', { name: 'Autore A→Z' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('il foglio Filtri ordina per data di lettura e per anno, con i libri senza valore in fondo', async () => {
    window.innerWidth = 390;
    server({ 'GET /api/books': [
      { isbn: '9780306406157', title: 'Alfa', authors: ['A'], cover: 'a.jpg', added: '2026-01-01', read: true, readAt: '2026-01-10', year: 1999 },
      { isbn: '9780306406164', title: 'Beta', authors: ['B'], cover: 'b.jpg', added: '2026-02-01' , year: 'boh' },
      { isbn: '9780306406171', title: 'Gamma', authors: ['C'], cover: 'c.jpg', added: '2026-03-01', read: true, readAt: '2026-05-02', year: 2020 },
    ] });
    open('/libreria');
    await screen.findByText('Alfa');
    const titles = () => screen.getAllByRole('link', { name: /Alfa|Beta|Gamma/ }).map((a) => a.textContent);
    await userEvent.click(screen.getByRole('button', { name: 'Filtri' }));
    let group = await screen.findByRole('group', { name: 'Ordina per' });
    await userEvent.click(within(group).getByRole('button', { name: 'Letti di recente' }));
    expect(within(group).getByRole('button', { name: 'Letti di recente' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.keyboard('{Escape}');
    expect(titles().map((t) => t!.match(/Alfa|Beta|Gamma/)![0])).toEqual(['Gamma', 'Alfa', 'Beta']);
    await userEvent.click(screen.getByRole('button', { name: 'Filtri' }));
    group = await screen.findByRole('group', { name: 'Ordina per' });
    await userEvent.click(within(group).getByRole('button', { name: 'Anno di pubblicazione' }));
    expect(within(group).getByRole('button', { name: 'Anno di pubblicazione' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Azzera tutto' }));
    expect(titles()[0]).toContain('Alfa');
  });

  it('il foglio Filtri ordina per voto e filtra per voto minimo con chip', async () => {
    window.innerWidth = 360;
    server({ 'GET /api/books': [
      { isbn: '9780306406157', title: 'Mansfield Park', authors: ['Jane Austen'], cover: 'a.jpg', added: '2026-03-01' },
      { isbn: '9780306406164', title: 'Narnia', authors: ['C. S. Lewis'], cover: 'b.jpg', added: '2026-02-01', read: true, rating: 3 },
      { isbn: '9780306406171', title: 'Dune', authors: ['Herbert'], cover: 'c.jpg', added: '2026-01-01', read: true, rating: 5 },
    ] });
    const { container } = open('/libreria');
    await screen.findByText('Mansfield Park');
    const titles = () => screen.getAllByRole('link', { name: /Mansfield|Narnia|Dune/ }).map((a) => a.textContent);
    await userEvent.click(screen.getByRole('button', { name: 'Filtri' }));
    await userEvent.click(within(await screen.findByRole('group', { name: 'Ordina per' })).getByRole('button', { name: 'Voto' }));
    const min = within(screen.getByRole('group', { name: 'Voto minimo' }));
    await userEvent.click(min.getByRole('button', { name: '4 stelle' }));
    await userEvent.click(min.getByRole('button', { name: '4 stelle' }));
    expect(min.getByRole('button', { name: '4 stelle' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.keyboard('{Escape}');
    expect(titles()).toHaveLength(1);
    expect(titles()[0]).toContain('Dune');
    expect(screen.getByTestId('filter-dot')).toBeInTheDocument();
    expect([...container.querySelectorAll('*')].filter((el) => /overflow-x-(auto|scroll)/.test(el.getAttribute('class') || ''))).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Togli il filtro Voto minimo 4' }));
    expect(titles().map((t) => t!.match(/Dune|Narnia|Mansfield/)![0])).toEqual(['Dune', 'Narnia', 'Mansfield']);
    expect(screen.queryByTestId('active-filters')).not.toBeInTheDocument();
  });

  it('il foglio Filtri filtra per collana, la ricerca la trova e il chip la toglie', async () => {
    window.innerWidth = 360;
    server({ 'GET /api/books': [
      { isbn: '9780306406157', title: 'Mansfield Park', authors: ['Jane Austen'], cover: 'a.jpg', added: '2026-03-01' },
      { isbn: '9780306406164', title: 'Il leone', authors: ['C. S. Lewis'], cover: 'b.jpg', added: '2026-02-01', series: 'Le cronache di Narnia, una collana dal nome molto molto lungo' },
      { isbn: '9780306406171', title: 'Il principe Caspian', authors: ['C. S. Lewis'], cover: 'c.jpg', added: '2026-01-01', read: true, series: 'Le cronache di Narnia, una collana dal nome molto molto lungo' },
    ] });
    const { container } = open('/libreria');
    await screen.findByText('Mansfield Park');
    const titles = () => screen.getAllByRole('link', { name: /Mansfield|leone|Caspian/ }).map((a) => a.textContent);
    await userEvent.type(screen.getByRole('searchbox'), 'cronache');
    expect(titles()).toHaveLength(2);
    await userEvent.clear(screen.getByRole('searchbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Filtri' }));
    const group = within(await screen.findByRole('group', { name: 'Collana' }));
    const pick = group.getByRole('button', { name: /Le cronache di Narnia/ });
    expect(pick).toHaveTextContent('2');
    await userEvent.click(pick);
    expect(titles()).toHaveLength(2);
    expect(screen.queryByText('Mansfield Park')).not.toBeInTheDocument();
    expect([...container.querySelectorAll('*')].filter((el) => /overflow-x-(auto|scroll)/.test(el.getAttribute('class') || ''))).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: /^Togli il filtro Collana Le cronache/ }));
    expect(titles()).toHaveLength(3);
    await userEvent.click(screen.getByRole('button', { name: 'Filtri' }));
    await userEvent.click(within(await screen.findByRole('group', { name: 'Collana' })).getByRole('button', { name: /Le cronache di Narnia/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Filtri' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Azzera tutto' }));
    expect(titles()).toHaveLength(3);
    expect(screen.queryByTestId('active-filters')).not.toBeInTheDocument();
  });

  it('il foglio Filtri filtra per lingua ed editore, con chip e azzeramento', async () => {
    window.innerWidth = 360;
    server({ 'GET /api/books': [
      { isbn: '9780306406157', title: 'Mansfield Park', authors: ['Austen'], cover: 'a.jpg', added: '2026-03-01', language: 'en', publisher: 'Penguin' },
      { isbn: '9780306406164', title: 'Il leone', authors: ['Lewis'], cover: 'b.jpg', added: '2026-02-01', language: 'it', publisher: 'Mondadori' },
      { isbn: '9780306406171', title: 'Caspian', authors: ['Lewis'], cover: 'c.jpg', added: '2026-01-01', language: ' IT ', publisher: 'mondadori' },
    ] });
    open('/libreria');
    await screen.findByText('Mansfield Park');
    const titles = () => screen.getAllByRole('link', { name: /Mansfield|leone|Caspian/ }).map((a) => a.textContent);
    await userEvent.click(screen.getByRole('button', { name: 'Filtri' }));
    const lang = within(await screen.findByRole('group', { name: 'Lingua' }));
    expect(lang.getByRole('button', { name: /^it/ })).toHaveTextContent('2');
    await userEvent.click(lang.getByRole('button', { name: /^it/ }));
    expect(titles()).toHaveLength(2);
    expect(screen.queryByText('Mansfield Park')).not.toBeInTheDocument();
    const chip = screen.getByRole('button', { name: 'Togli il filtro Lingua it' });
    await userEvent.click(chip);
    expect(titles()).toHaveLength(3);
    await userEvent.click(screen.getByRole('button', { name: 'Filtri' }));
    await userEvent.click(within(await screen.findByRole('group', { name: 'Editore' })).getByRole('button', { name: /^Penguin/ }));
    expect(titles()).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Togli il filtro Editore Penguin' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Filtri' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Azzera tutto' }));
    expect(titles()).toHaveLength(3);
    expect(screen.queryByTestId('active-filters')).not.toBeInTheDocument();
  });

  it('con un solo valore di lingua o editore le sezioni non compaiono', async () => {
    server({ 'GET /api/books': [
      { isbn: '9780306406157', title: 'Mansfield Park', authors: ['Austen'], cover: 'a.jpg', language: 'it', publisher: 'Penguin' },
      { isbn: '9780306406164', title: 'Il leone', authors: ['Lewis'], cover: 'b.jpg', language: 'IT', publisher: 'penguin' },
    ] });
    open('/libreria');
    await screen.findByText('Mansfield Park');
    await userEvent.click(screen.getByRole('button', { name: 'Filtri' }));
    await screen.findByRole('group', { name: 'Genere' });
    expect(screen.queryByRole('group', { name: 'Lingua' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Editore' })).not.toBeInTheDocument();
  });

  it('senza libri con collana il foglio Filtri non mostra la sezione Collana', async () => {
    server();
    open('/libreria');
    await screen.findByText('Mansfield Park');
    await userEvent.click(screen.getByRole('button', { name: 'Filtri' }));
    await screen.findByRole('group', { name: 'Genere' });
    expect(screen.queryByRole('group', { name: 'Collana' })).not.toBeInTheDocument();
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

  it('Gestione: dopo l\'importazione dice quanti desideri sono stati aggiunti', async () => {
    server({ 'POST /api/books/import': { added: 0, skipped: 0, invalid: 0, wishlistAdded: 2 } });
    open('/libreria');
    await screen.findByText('Mansfield Park');
    await userEvent.click(screen.getByRole('button', { name: 'Altro' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Importa/ }));
    const file = new File([JSON.stringify({ books: [], wishlist: [] })], 'libreria.json', { type: 'application/json' });
    await userEvent.upload(screen.getByLabelText('File da importare'), file);
    expect(await screen.findByText('Aggiunti 0 libri, saltati 0, 2 desideri')).toBeInTheDocument();
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

  it('Statistiche: gli autori con più libri, il tocco apre la Libreria filtrata', async () => {
    server({ 'GET /api/books': [
      { isbn: '9780306406157', title: 'Mansfield Park', authors: ['Jane Austen'], cover: 'a.jpg', read: true },
      { isbn: '9780306406164', title: 'Emma', authors: ['Jane Austen'], cover: 'b.jpg' },
      { isbn: '9780306406171', title: 'Dune', authors: ['Herbert'], cover: 'c.jpg' },
    ] });
    open('/statistiche');
    expect(await screen.findByRole('heading', { name: 'Autori' })).toBeInTheDocument();
    expect(screen.getByText('2 libri · 1 letti')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mostra i libri di Herbert' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Mostra i libri di Jane Austen' }));
    expect(await screen.findByText('Autore Jane Austen')).toBeInTheDocument();
    expect(screen.queryByText('Dune')).toBeNull();
  });

  it('Statistiche: senza autori con 2 libri la sezione Autori non compare', async () => {
    server();
    open('/statistiche');
    await screen.findByRole('heading', { name: 'Statistiche' });
    await screen.findByRole('progressbar', { name: 'Libri letti' });
    expect(screen.queryByRole('heading', { name: 'Autori' })).toBeNull();
  });

  it('Statistiche: lingue ed editori, nascosti senza dati', async () => {
    server({ 'GET /api/books': [
      { ...BOOKS[0], language: 'Italiano', publisher: 'Einaudi' },
      { ...BOOKS[1], language: 'italiano', publisher: ' EINAUDI' },
    ] });
    open('/statistiche');
    expect(await screen.findByRole('heading', { name: 'Lingue' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Italiano: 2' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Editori più presenti' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Einaudi: 2' })).toBeInTheDocument();
  });

  it('Statistiche: senza lingua né editore i blocchi non compaiono', async () => {
    server({ 'GET /api/books': [{ ...BOOKS[0], language: '', publisher: '' }] });
    open('/statistiche');
    await screen.findByRole('progressbar', { name: 'Libri letti' });
    expect(screen.queryByRole('heading', { name: 'Lingue' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Editori più presenti' })).toBeNull();
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

  it('scheda: il voto compare solo se letto, si cambia, si azzera; la data parte da oggi', async () => {
    const calls: string[] = [];
    const bodies: unknown[] = [];
    const today = todayIso();
    server();
    const base = fetch as unknown as (u: string, i?: RequestInit) => Promise<Response>;
    vi.stubGlobal('fetch', vi.fn(async (u: string, i?: RequestInit) => {
      if (i?.method === 'PATCH') {
        calls.push(u);
        const body = JSON.parse(String(i.body));
        bodies.push(body);
        return new Response(JSON.stringify({ book: { ...BOOKS[0], read: true, readAt: today, rating: body.rating ?? undefined } }), { status: 200 });
      }
      return base(u, i);
    }));
    open('/libro/9780306406157');
    await userEvent.click(await screen.findByRole('button', { name: 'Segna come letto' }));
    expect(bodies[0]).toEqual({ read: true, readAt: today });
    const group = await screen.findByRole('group', { name: 'Voto' });
    expect(within(group).getAllByRole('button', { name: /stell[ae] su 5/ })).toHaveLength(5);
    expect(within(group).getByRole('button', { name: '1 stella su 5' }).querySelector('svg')).not.toBeNull();
    expect(screen.getByLabelText('Finito di leggere il')).toHaveValue(today);
    await userEvent.click(within(group).getByRole('button', { name: '4 stelle su 5' }));
    await waitFor(() => expect(bodies[1]).toEqual({ rating: 4 }));
  });

  it('scheda: un libro non letto non mostra il voto', async () => {
    server();
    open('/libro/9780306406157');
    await screen.findByRole('button', { name: 'Segna come letto' });
    expect(screen.queryByRole('group', { name: 'Voto' })).toBeNull();
    expect(screen.queryByLabelText('Finito di leggere il')).toBeNull();
  });

  it('scheda: toccare la stella del voto attuale lo azzera', async () => {
    const bodies: unknown[] = [];
    server({ 'GET /api/books': [{ ...BOOKS[1], rating: 3, readAt: '2026-10-01' }] });
    const base = fetch as unknown as (u: string, i?: RequestInit) => Promise<Response>;
    vi.stubGlobal('fetch', vi.fn(async (u: string, i?: RequestInit) => {
      if (i?.method === 'PATCH') { bodies.push(JSON.parse(String(i.body))); return new Response(JSON.stringify({ book: BOOKS[1] }), { status: 200 }); }
      return base(u, i);
    }));
    open('/libro/9780306406164');
    const group = await screen.findByRole('group', { name: 'Voto' });
    const three = within(group).getByRole('button', { name: '3 stelle su 5' });
    expect(three).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(three);
    await waitFor(() => expect(bodies).toEqual([{ rating: null }]));
  });

  it('Statistiche: media dei voti e letti per mese', async () => {
    const d = todayIso();
    server({ 'GET /api/books': [{ ...BOOKS[1], rating: 4, readAt: d }, { ...BOOKS[0], read: true, rating: 5, readAt: d }] });
    open('/statistiche');
    expect(await screen.findByText('4,5')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Letti negli ultimi 6 mesi' })).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: /: 2$/ }).length).toBeGreaterThan(0);
  });

  it('Statistiche: obiettivo annuale da impostare, con barra e conteggio dell’anno', async () => {
    const d = todayIso();
    const old = `${Number(d.slice(0, 4)) - 1}-06-01`;
    server({
      'GET /api/books': [{ ...BOOKS[1], readAt: d }, { ...BOOKS[0], read: true, readAt: old }, { ...BOOKS[0], isbn: '1', readAt: d }],
      'GET /api/goal': { goal: null },
      'PUT /api/goal': { goal: 4 },
    });
    open('/statistiche');
    await userEvent.click(await screen.findByRole('button', { name: 'Imposta un obiettivo' }));
    await userEvent.type(screen.getByLabelText('Libri da leggere quest’anno'), '0');
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('da 1 a 999');
    await userEvent.clear(screen.getByLabelText('Libri da leggere quest’anno'));
    await userEvent.type(screen.getByLabelText('Libri da leggere quest’anno'), '4');
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    expect(await screen.findByText('1 di 4')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar', { name: /^Obiettivo/ });
    expect(bar).toHaveAttribute('aria-valuenow', '1');
    expect(bar).toHaveAttribute('aria-valuetext', '1 di 4 libri (25%)');
    expect(screen.getByRole('button', { name: /Modifica obiettivo/ })).toBeInTheDocument();
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
  const CAND = { isbn: '9788893420938', title: 'Persuasione', authors: ['Jane Austen'], publisher: 'Newton', year: '2019', pages: '250', language: 'Italiano', source: 'sbn' };

  it('«Aggiungi a mano»: la ricerca online compila solo i campi vuoti, anche con tocchi ripetuti', async () => {
    window.innerWidth = 390;
    const calls = server({ 'GET /api/search?title=Persuasione&author=': { candidates: [CAND, { ...CAND, isbn: '', title: 'Altro' }] } });
    open('/scansiona/manuale');
    const btn = await screen.findByRole('button', { name: 'Cerca online i dati mancanti' });
    expect(btn).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Titolo (obbligatorio)'), 'Persuasione');
    await userEvent.type(screen.getByLabelText('Editore'), 'Mio editore');
    act(() => { btn.click(); btn.click(); });
    expect(calls.filter((c) => c.startsWith('GET /api/search'))).toHaveLength(1);
    const sheet = await screen.findByRole('dialog');
    await userEvent.click(await within(sheet).findByRole('button', { name: /Persuasione/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Editore')).toHaveValue('Mio editore');
    expect(screen.getByLabelText(/^Anno/)).toHaveValue('2019');
    expect(screen.getByLabelText(/^Anno/).closest('div')!.textContent).toContain('da catalogo');
    expect(screen.getByLabelText(/^Autori/)).toHaveValue('Jane Austen');
    expect(screen.getByLabelText(/^ISBN/)).toHaveValue('9788893420938');
    expect(screen.getByLabelText('Editore').closest('div')!.textContent).not.toContain('da catalogo');
    expect(calls.some((c) => c.startsWith('POST'))).toBe(false);
  });

  it('la ricerca online senza risultati lascia i campi vuoti', async () => {
    server({ 'GET /api/search?title=Zzz&author=': { candidates: [] } });
    open('/scansiona/manuale');
    await userEvent.type(await screen.findByLabelText('Titolo (obbligatorio)'), 'Zzz');
    await userEvent.click(screen.getByRole('button', { name: 'Cerca online i dati mancanti' }));
    expect(await screen.findByText('Nessun risultato: i dati restano vuoti.')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Anno/)).toHaveValue('');
  });

  it('nella scheda in modifica la ricerca online riempie i vuoti e prende i generi', async () => {
    const book = { isbn: '9780306406171', title: 'Persuasione', authors: [] as string[], publisher: 'Già qui', genres: [] as string[] };
    server({ 'GET /api/books': [book], 'GET /api/search?title=Persuasione&author=': { candidates: [CAND] }, 'GET /api/lookup/9788893420938': { genres: ['Narrativa'] } });
    open('/libro/9780306406171');
    await userEvent.click(await screen.findByRole('button', { name: /Modifica/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Cerca online i dati mancanti' }));
    await userEvent.click(await screen.findByRole('button', { name: /Persuasione/ }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Narrativa' })).toBeChecked());
    expect(screen.getByLabelText('Editore')).toHaveValue('Già qui');
    expect(screen.getByLabelText(/^Anno/)).toHaveValue('2019');
    expect(screen.getByLabelText(/^Pagine/)).toHaveValue('250');
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
  it.each([360, 390])('desideri a %i px: dalla scansione, rimozione e passaggio in libreria, anche toccando di continuo', async (w) => {
    window.innerWidth = w;
    const NEW = { isbn: '9780804429573', title: 'Dune', authors: ['Frank Herbert'], cover: null };
    let wish: typeof NEW[] = [];
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const m = init?.method || 'GET';
      calls.push(`${m} ${url}`);
      const ok = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
      if (url === '/api/auth/status') return ok({ authenticated: true });
      if (url === '/api/books' && m === 'GET') return ok(BOOKS);
      if (url === `/api/books/${NEW.isbn}`) return ok({ error: 'Non trovato' }, 404);
      if (url === `/api/lookup/${NEW.isbn}`) return ok(NEW);
      if (url === '/api/wishlist' && m === 'GET') return ok(wish);
      if (url === '/api/wishlist' && m === 'POST') { await new Promise((r) => setTimeout(r, 50)); wish = [NEW]; return ok({ status: 'saved', item: NEW }, 201); }
      if (url === `/api/wishlist/${NEW.isbn}` && m === 'DELETE') { wish = []; return ok({ ok: true }); }
      if (url === '/api/books' && m === 'POST') { wish = []; return ok({ status: 'saved', book: NEW }, 201); }
      return ok({ error: 'Non trovato' }, 404);
    }));
    open('/scansiona');
    const box = await screen.findByRole('textbox', { name: 'ISBN, titolo o autore' });
    await userEvent.type(box, `${NEW.isbn}{Enter}`);
    expect(await screen.findByText('Non ce l’hai: lo aggiungo?')).toBeInTheDocument();
    const put = screen.getByRole('button', { name: 'Metti nei desideri' });
    await userEvent.dblClick(put);
    expect(await screen.findByText('Messo nei desideri')).toBeInTheDocument();
    expect(calls.filter((c) => c === 'POST /api/wishlist')).toHaveLength(1);
    // riscansionando, il verdetto lo dice
    await userEvent.clear(box);
    await userEvent.type(box, `${NEW.isbn}{Enter}`);
    expect(await screen.findByText('È nei tuoi desideri')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Metti nei desideri' })).not.toBeInTheDocument();
    // Gestione > Desideri: rimuovere
    await userEvent.click(screen.getByRole('button', { name: 'Altro' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Desideri/ }));
    expect(await screen.findByRole('heading', { name: 'Desideri' })).toBeInTheDocument();
    expect((await screen.findAllByText('Dune')).length).toBeGreaterThan(0);
    expect(screen.getByText('Frank Herbert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Togli Dune dai desideri' }));
    expect(await screen.findByText(/Nessun desiderio/)).toBeInTheDocument();
    // spostare in libreria
    wish = [NEW];
    await userEvent.click(screen.getByRole('button', { name: 'Indietro' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Altro' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Desideri/ }));
    const bought = await screen.findByRole('button', { name: 'L’ho comprato' });
    await userEvent.dblClick(bought);
    expect(await screen.findByText(/Nessun desiderio/)).toBeInTheDocument();
    expect(calls.filter((c) => c === 'POST /api/books')).toHaveLength(1);
  });

  it.each([360, 390])('altra edizione a %i px: avviso, Aggiungi comunque una volta sola, Apri quello che hai', async (w) => {
    window.innerWidth = w;
    const NEW = { isbn: '9780804429573', title: 'MANSFIELD park', authors: ['Jane Austen'], cover: null };
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const m = init?.method || 'GET';
      calls.push(`${m} ${url}`);
      const ok = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
      if (url === '/api/auth/status') return ok({ authenticated: true });
      if (url === '/api/books' && m === 'GET') return ok(BOOKS);
      if (url === `/api/books/${NEW.isbn}`) return ok({ error: 'Non trovato' }, 404);
      if (url === `/api/lookup/${NEW.isbn}`) return ok(NEW);
      if (url === '/api/wishlist') return ok([]);
      if (url === '/api/books' && m === 'POST') return ok({ status: 'saved', book: NEW }, 201);
      return ok({ error: 'Non trovato' }, 404);
    }));
    open('/scansiona');
    const box = await screen.findByRole('textbox', { name: 'ISBN, titolo o autore' });
    await userEvent.type(box, `${NEW.isbn}{Enter}`);
    expect(await screen.findByText('Hai già un’altra edizione: Mansfield Park (ISBN 9780306406157)')).toBeInTheDocument();
    await userEvent.dblClick(screen.getByRole('button', { name: 'Aggiungi comunque' }));
    expect(await screen.findByText('Aggiunto alla libreria')).toBeInTheDocument();
    expect(calls.filter((c) => c === 'POST /api/books')).toHaveLength(1);
  });

  it('altra edizione: Apri quello che hai porta alla scheda; titolo uguale con altro autore non avvisa', async () => {
    window.innerWidth = 360;
    let lookup: unknown = { isbn: '9780804429573', title: 'Mansfield Park', authors: ['Altra Persona'], cover: null };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const ok = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
      if (url === '/api/auth/status') return ok({ authenticated: true });
      if (url === '/api/books') return ok(BOOKS);
      if (url === '/api/books/9780804429573') return ok({ error: 'Non trovato' }, 404);
      if (url === '/api/lookup/9780804429573') return ok(lookup);
      if (url === '/api/wishlist') return ok([]);
      return ok({ error: 'Non trovato' }, 404);
    }));
    open('/scansiona');
    const box = await screen.findByRole('textbox', { name: 'ISBN, titolo o autore' });
    await userEvent.type(box, '9780804429573{Enter}');
    expect(await screen.findByRole('button', { name: 'Aggiungi alla libreria' })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/altra edizione/)).not.toBeInTheDocument();
    lookup = { isbn: '9780804429573', title: 'Mansfield Park', authors: ['Jane Austen'], cover: null };
    await userEvent.clear(box);
    await userEvent.type(box, '9780804429573{Enter}');
    await userEvent.click(await screen.findByRole('button', { name: 'Apri quello che hai' }));
    expect(screen.queryByRole('button', { name: 'Apri quello che hai' })).not.toBeInTheDocument();
  });

  it('desideri a 360 px: il link ad Amazon ha href, target e rel giusti', async () => {
    window.innerWidth = 360;
    const wish = [
      { isbn: '9780804429573', title: 'Dune', authors: ['Frank Herbert'], cover: null },
      { isbn: 'm42', title: 'Libro & co', authors: ['A B'], cover: null },
    ];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const ok = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
      if (url === '/api/auth/status') return ok({ authenticated: true });
      if (url === '/api/books') return ok(BOOKS);
      if (url === '/api/wishlist') return ok(wish);
      return ok({ error: 'Non trovato' }, 404);
    }));
    open('/desideri');
    const links = await screen.findAllByRole('link', { name: /su Amazon/ });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', 'https://www.amazon.it/s?k=9780804429573');
    expect(links[1]).toHaveAttribute('href', 'https://www.amazon.it/s?k=Libro%20%26%20co%20A%20B');
    for (const l of links) {
      expect(l).toHaveAttribute('target', '_blank');
      expect(l).toHaveAttribute('rel', 'noopener noreferrer');
      expect(l.className).toContain('min-h-11');
    }
  });

  it('wishlistText: una riga per desiderio, ISBN se manca il titolo', () => {
    expect(wishlistText([
      { isbn: '9780804429573', title: 'Dune', authors: ['Frank Herbert', 'X'] },
      { isbn: 'm42', title: 'Solo titolo', authors: [] },
      { isbn: '9788817152754', title: '', authors: ['Nessuno'] },
    ])).toBe('Dune — Frank Herbert, X (9780804429573)\nSolo titolo (m42)\n9788817152754');
    expect(wishlistText([])).toBe('');
  });

  describe('condividi i desideri', () => {
    const wish = [{ isbn: '9780804429573', title: 'Dune', authors: ['Frank Herbert'], cover: null }];
    const stub = (list: unknown[]) => vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const ok = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
      if (url === '/api/auth/status') return ok({ authenticated: true });
      if (url === '/api/books') return ok(BOOKS);
      if (url === '/api/wishlist') return ok(list);
      return ok({ error: 'Non trovato' }, 404);
    }));
    afterEach(() => {
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    });

    it('con navigator.share apre il foglio di condivisione', async () => {
      window.innerWidth = 360;
      const share = vi.fn(async () => {});
      Object.defineProperty(navigator, 'share', { value: share, configurable: true });
      stub(wish);
      open('/desideri');
      await userEvent.click(await screen.findByRole('button', { name: 'Condividi la lista' }));
      expect(share).toHaveBeenCalledWith({ title: 'Lista dei desideri', text: 'Dune — Frank Herbert (9780804429573)' });
    });

    it('senza navigator.share copia negli appunti e avvisa', async () => {
      window.innerWidth = 360;
      const writeText = vi.fn(async () => {});
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      stub(wish);
      open('/desideri');
      await userEvent.click(await screen.findByRole('button', { name: 'Condividi la lista' }));
      expect(writeText).toHaveBeenCalledWith('Dune — Frank Herbert (9780804429573)');
      expect(await screen.findByText('Copiato')).toBeInTheDocument();
    });

    it('con la lista vuota il pulsante è disattivato', async () => {
      stub([]);
      open('/desideri');
      expect(await screen.findByRole('button', { name: 'Condividi la lista' })).toBeDisabled();
    });
  });

  it('«Cerca di nuovo i dati» su un ISBN non trovato lascia un messaggio che resta', async () => {
    const book = { isbn: '9788817152754', title: '', authors: [], genres: [], cover: '9788817152754.jpg', lookup: 'failed' };
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    server({ 'GET /api/books': [book] });
    const base = globalThis.fetch as unknown as (u: string, i?: RequestInit) => Promise<Response>;
    vi.stubGlobal('fetch', vi.fn(async (u: string, i?: RequestInit) => {
      if (i?.method === 'POST') { await gate; return new Response(JSON.stringify({ book }), { status: 200 }); }
      return base(u, i);
    }));
    open('/libro/9788817152754');
    const btn = await screen.findByRole('button', { name: 'Cerca di nuovo i dati' });
    await userEvent.click(btn);
    const busy = await screen.findByRole('button', { name: 'Cerco…' });
    expect(busy).toBeDisabled();
    release();
    const msg = await screen.findByText(/Nessuna fonte ha questo ISBN/);
    expect(msg).toHaveAttribute('role', 'alert');
    expect(screen.getByRole('button', { name: 'Cerca di nuovo i dati' })).toBeEnabled();
  });

  it('«Cerca di nuovo i dati» dice quale fonte non ha risposto, a larghezza telefono', async () => {
    window.innerWidth = 360;
    const book = { isbn: '9788817152754', title: '', authors: [], genres: [], cover: null, lookup: 'failed' };
    server({ 'GET /api/books': [book] });
    const base = globalThis.fetch as unknown as (u: string, i?: RequestInit) => Promise<Response>;
    let sources: Record<string, string> = { openlibrary: 'error', sbn: 'notfound' };
    vi.stubGlobal('fetch', vi.fn(async (u: string, i?: RequestInit) => (i?.method === 'POST' ? new Response(JSON.stringify({ book, sources }), { status: 200 }) : base(u, i))));
    open('/libro/9788817152754');
    await userEvent.click(await screen.findByRole('button', { name: 'Cerca di nuovo i dati' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Open Library non ha risposto.*cercali online per titolo/);
    sources = { openlibrary: 'error', sbn: 'error' };
    await userEvent.click(screen.getByRole('button', { name: 'Cerca di nuovo i dati' }));
    await screen.findByText(/Nessuna fonte ha risposto/);
    sources = { openlibrary: 'notfound', sbn: 'notfound' };
    await userEvent.click(screen.getByRole('button', { name: 'Cerca di nuovo i dati' }));
    await screen.findByText(/Nessuna fonte ha questo ISBN/);
  });
});

describe('scorrimento a lettere', () => {
  const many = Array.from({ length: 26 }, (_, i) => ({ isbn: `97803064${String(i).padStart(5, '0')}`, title: `${String.fromCharCode(65 + i)} libro`, authors: [`Nome ${String.fromCharCode(65 + i)}${String.fromCharCode(97 + i)}`], cover: 'a.jpg', added: '2026-01-01' }));
  const sortBy = async (name: string) => {
    await userEvent.click(screen.getByRole('button', { name: 'Filtri' }));
    await userEvent.click(within(await screen.findByRole('group', { name: 'Ordina per' })).getByRole('button', { name }));
    await userEvent.keyboard('{Escape}');
  };

  it('la striscia muove la lista e mostra la lettera, che sparisce dopo un secondo', async () => {
    window.innerWidth = 390;
    server({ 'GET /api/books': many });
    const scroll = vi.fn();
    window.scrollTo = scroll as unknown as typeof window.scrollTo;
    open('/libreria');
    await screen.findByText('A libro');
    await sortBy('Aggiunti di recente');
    expect(screen.queryByTestId('letter-rail')).not.toBeInTheDocument(); // «recenti», un solo mese
    await sortBy('Autore A→Z');
    const rail = await screen.findByTestId('letter-rail');
    expect(screen.queryByTestId('letter-bubble')).not.toBeInTheDocument();
    fireEvent.pointerDown(rail, { clientY: 0, pointerId: 1 });
    expect(screen.getByTestId('letter-bubble')).toHaveTextContent('A');
    fireEvent.pointerMove(rail, { clientY: 9999, buttons: 1, pointerId: 1 });
    expect(screen.getByTestId('letter-bubble')).toHaveTextContent('Z');
    expect(rail).toHaveAttribute('aria-valuetext', 'Z');
    expect(scroll).toHaveBeenCalledTimes(2);
    fireEvent.pointerMove(rail, { clientY: 9999, buttons: 1, pointerId: 1 }); // stessa lettera: nessun salto in più
    expect(scroll).toHaveBeenCalledTimes(2);
    fireEvent.pointerUp(rail, { pointerId: 1 });
    expect(screen.getByTestId('letter-bubble')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('letter-bubble')).not.toBeInTheDocument(), { timeout: 2000 });
  });

  it('la tastiera sulla striscia cambia lettera; con una ricerca che lascia pochi libri la striscia sparisce; per voto non c’è', async () => {
    window.innerWidth = 390;
    server({ 'GET /api/books': many });
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
    open('/libreria');
    await screen.findByText('A libro');
    await sortBy('Titolo A→Z');
    const rail = await screen.findByTestId('letter-rail');
    expect(rail).toHaveAttribute('aria-valuetext', 'A');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Cerca nella libreria' }), 'z libro');
    expect(screen.queryByTestId('letter-rail')).not.toBeInTheDocument();
    await userEvent.clear(screen.getByRole('searchbox', { name: 'Cerca nella libreria' }));
    await sortBy('Voto');
    expect(screen.queryByTestId('letter-rail')).not.toBeInTheDocument();
  });

  it('il foglio Filtri filtra per autore, si combina con lo stato e il chip lo toglie', async () => {
    window.innerWidth = 360;
    server({ 'GET /api/books': [
      { isbn: '9780306406157', title: 'Mansfield Park', authors: ['Jane Austen'], cover: 'a.jpg' },
      { isbn: '9780306406164', title: 'Emma', authors: ['Jane Austen'], cover: 'b.jpg', read: true },
      { isbn: '9780306406171', title: 'Dune', authors: ['Herbert'], cover: 'c.jpg' },
    ] });
    const { container } = open('/libreria');
    await screen.findByText('Mansfield Park');
    await userEvent.click(screen.getByRole('button', { name: 'Filtri' }));
    const group = within(await screen.findByRole('group', { name: 'Autore' }));
    expect(group.getByRole('button', { name: /^Jane Austen/ })).toHaveTextContent('2');
    await userEvent.click(group.getByRole('button', { name: /^Jane Austen/ }));
    expect(screen.queryByText('Dune')).not.toBeInTheDocument();
    expect(screen.getByText('Emma')).toBeInTheDocument();
    expect(screen.getByTestId('filter-dot')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Letti/ }));
    expect(screen.queryByText('Mansfield Park')).not.toBeInTheDocument();
    expect(screen.getByText('Emma')).toBeInTheDocument();
    expect([...container.querySelectorAll('*')].filter((el) => /overflow-x-(auto|scroll)/.test(el.getAttribute('class') || ''))).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Togli il filtro Autore Jane Austen' }));
    await userEvent.click(screen.getByRole('button', { name: /^Tutti/ }));
    expect(screen.getByText('Dune')).toBeInTheDocument();
    expect(screen.queryByTestId('filter-dot')).not.toBeInTheDocument();
  });

  it('dalla scheda del libro un tocco sull’autore apre la Libreria filtrata', async () => {
    window.innerWidth = 360;
    server({ 'GET /api/books': [
      { isbn: '9780306406157', title: 'Mansfield Park', authors: ['Jane Austen'], cover: 'a.jpg' },
      { isbn: '9780306406164', title: 'Emma', authors: ['Jane Austen'], cover: 'b.jpg' },
      { isbn: '9780306406171', title: 'Dune', authors: ['Herbert'], cover: 'c.jpg' },
    ] });
    open('/libro/9780306406157');
    await userEvent.click(await screen.findByRole('button', { name: 'Mostra i libri di Jane Austen' }));
    expect(await screen.findByText('Emma')).toBeInTheDocument();
    expect(screen.queryByText('Dune')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Togli il filtro Autore Jane Austen' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Torna alla Libreria' }));
    expect(await screen.findByText('Dune')).toBeInTheDocument();
    expect(screen.queryByTestId('active-filters')).not.toBeInTheDocument();
  });
});

describe('completa i dati mancanti', () => {
  const inc = (n: number): Book => ({ isbn: `97803064${String(n).padStart(5, '0')}`, title: '', authors: [], genres: [], cover: null, lookup: 'failed' });
  const menu = async () => {
    await userEvent.click(await screen.findByRole('button', { name: 'Altro' }));
    return screen.findByRole('menuitem', { name: /Completa i dati mancanti/ });
  };
  beforeEach(() => { pacing.ms = 30; window.innerWidth = 360; });
  afterEach(() => { pacing.ms = 1500; });

  it('con zero libri incompleti la voce è disattivata e lo dice', async () => {
    server();
    open('/libreria');
    const item = await menu();
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item.textContent).toMatch(/nessun libro incompleto/);
    expect(item.className).toContain('min-h-11');
  });

  it('elabora un libro alla volta con avanzamento e riepilogo, un errore non ferma gli altri', async () => {
    const list = [inc(1), inc(2), inc(3)];
    const calls = server({ 'GET /api/books': list });
    const base = globalThis.fetch as unknown as (u: string, i?: RequestInit) => Promise<Response>;
    vi.stubGlobal('fetch', vi.fn(async (u: string, i?: RequestInit) => {
      if (i?.method !== 'POST') return base(u, i);
      calls.push(`POST ${u}`);
      if (u.includes(list[0].isbn)) return new Response(JSON.stringify({ book: { ...list[0], title: 'Uno', cover: 'x.jpg', lookup: undefined } }), { status: 200 });
      if (u.includes(list[1].isbn)) return new Response(JSON.stringify({ error: 'boom' }), { status: 500 });
      return new Response(JSON.stringify({ book: list[2], sources: { openlibrary: 'error', sbn: 'notfound' } }), { status: 200 });
    }));
    open('/libreria');
    const item = await menu();
    expect(item.textContent).toContain('3');
    await userEvent.click(item);
    expect(await screen.findByText(/3 libri hanno dati o copertina mancanti/)).toBeInTheDocument();
    const start = screen.getByRole('button', { name: 'Avvia' });
    expect(start.className).toContain('min-h-11');
    await userEvent.click(start);
    await screen.findByText('Finito: 3 libri elaborati');
    expect(screen.getByText('Completati: 1')).toBeInTheDocument();
    expect(screen.getByText('Ancora incompleti: 2')).toBeInTheDocument();
    expect(screen.getByText('Fonte non raggiunta: 2')).toBeInTheDocument();
    expect(calls.filter((c) => c.startsWith('POST')).map((c) => /\d{13}\/lookup/.exec(c)?.[0])).toEqual(list.map((b) => `${b.isbn}/lookup`));
  });

  it('Ferma interrompe subito e non cerca gli altri libri', async () => {
    pacing.ms = 200;
    const list = [inc(1), inc(2), inc(3)];
    const calls = server({ 'GET /api/books': list });
    const base = globalThis.fetch as unknown as (u: string, i?: RequestInit) => Promise<Response>;
    vi.stubGlobal('fetch', vi.fn(async (u: string, i?: RequestInit) => {
      if (i?.method !== 'POST') return base(u, i);
      calls.push(`POST ${u}`);
      return new Response(JSON.stringify({ book: list[0], sources: { openlibrary: 'notfound' } }), { status: 200 });
    }));
    open('/libreria');
    await userEvent.click(await menu());
    await userEvent.click(await screen.findByRole('button', { name: 'Avvia' }));
    const stop = await screen.findByRole('button', { name: 'Ferma' });
    expect(stop.className).toContain('min-h-11');
    await userEvent.click(stop);
    await screen.findByText('Fermato dopo 1 di 3');
    await new Promise((r) => setTimeout(r, 400));
    expect(calls.filter((c) => c.startsWith('POST'))).toHaveLength(1);
    expect(screen.getByText('Ancora incompleti: 1')).toBeInTheDocument();
    expect(screen.getByText('Fonte non raggiunta: 0')).toBeInTheDocument();
  });

  it('dalla scheda la riga Collana mostra i letti e apre la Libreria filtrata', async () => {
    window.innerWidth = 360;
    server({ 'GET /api/books': [
      { isbn: '9780306406157', title: 'Il leone', authors: ['Lewis'], series: 'Narnia', cover: 'a.jpg', read: true },
      { isbn: '9780306406164', title: 'Caspian', authors: ['Lewis'], series: ' narnia ', cover: 'b.jpg' },
      { isbn: '9780306406171', title: 'Dune', authors: ['Herbert'], series: 'Arrakis', cover: 'c.jpg' },
    ] });
    open('/libro/9780306406157');
    expect(await screen.findByText('Collana: 2 libri, 1 letti')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Vedi la collana' }));
    expect(await screen.findByText('Caspian')).toBeInTheDocument();
    expect(screen.queryByText('Dune')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Togli il filtro Collana Narnia' })).toBeInTheDocument();
  });

  it('la riga Collana non compare se nessun altro libro ha la stessa collana', async () => {
    window.innerWidth = 360;
    server({ 'GET /api/books': [
      { isbn: '9780306406157', title: 'Il leone', authors: ['Lewis'], series: 'Narnia', cover: 'a.jpg' },
      { isbn: '9780306406171', title: 'Dune', authors: ['Herbert'], series: 'Arrakis', cover: 'c.jpg' },
    ] });
    open('/libro/9780306406157');
    await screen.findByRole('button', { name: 'Mostra i libri di Lewis' });
    expect(screen.queryByRole('button', { name: 'Vedi la collana' })).not.toBeInTheDocument();
  });
});
