import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../App';
import { AuthProvider } from '../state/auth';

vi.mock('../lib/api', async (orig) => ({ ...(await orig<typeof import('../lib/api')>()), toJpeg: async (b: Blob) => b }));

const BOOK = { isbn: '9780306406157', title: '', authors: [], publisher: 'Mio editore', genres: ['Narrativa'], cover: 'a.jpg' };
const READ = { title: 'Il nome della rosa', subtitle: '', authors: ['Umberto Eco'], publisher: 'Bompiani', language: 'it', confidence: {} };

function server(opts: { coverRead?: boolean; read?: () => Promise<Response> } = {}) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method || 'GET'} ${url}`;
    calls.push(key);
    if (key === 'GET /api/auth/status') return new Response(JSON.stringify({ authenticated: true, coverRead: opts.coverRead ?? true }));
    if (key === 'GET /api/books') return new Response(JSON.stringify([BOOK]));
    if (key === 'GET /covers/a.jpg') return new Response(new Blob([new Uint8Array([0xff, 0xd8, 0xff])]));
    if (key === 'POST /api/cover-read') return opts.read ? opts.read() : new Response(JSON.stringify(READ));
    return new Response(JSON.stringify({ error: 'Non trovato' }), { status: 404 });
  }));
  return calls;
}

const open = (path: string) => render(<MemoryRouter initialEntries={[path]}><AuthProvider><App /></AuthProvider></MemoryRouter>);
const pick = async (container: HTMLElement) => userEvent.upload(container.querySelector('input[type=file]') as HTMLInputElement, new File([new Uint8Array([0xff, 0xd8, 0xff])], 'c.jpg', { type: 'image/jpeg' }));

afterEach(() => vi.unstubAllGlobals());

describe('lettura dalla foto', () => {
  it('nel modulo a mano il pulsante compare solo con una copertina e riempie solo i campi vuoti', async () => {
    const calls = server();
    const { container } = open('/scansiona/manuale');
    await screen.findByLabelText('Titolo (obbligatorio)');
    expect(screen.queryByRole('button', { name: 'Leggi i dati dalla foto' })).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Editore'), 'Il mio');
    await pick(container);
    await userEvent.click(await screen.findByRole('button', { name: 'Leggi i dati dalla foto' }));
    expect(await screen.findByLabelText('Titolo (obbligatorio) (dalla foto)')).toHaveValue('Il nome della rosa');
    expect(screen.getByLabelText('Autori (separati da virgola) (dalla foto)')).toHaveValue('Umberto Eco');
    expect(screen.getByLabelText('Editore')).toHaveValue('Il mio'); // già compilato: intatto
    expect(screen.getByRole('status')).toHaveTextContent('Controlla e premi «Salva»');
    expect(calls.some((c) => c.startsWith('POST /api/books'))).toBe(false); // non salva da solo
  });

  it('tocchi ripetuti sul pulsante fanno una sola richiesta', async () => {
    let release: (r: Response) => void = () => {};
    const calls = server({ read: () => new Promise<Response>((r) => { release = r; }) });
    const { container } = open('/scansiona/manuale');
    await screen.findByLabelText('Titolo (obbligatorio)');
    await pick(container);
    const btn = await screen.findByRole('button', { name: 'Leggi i dati dalla foto' });
    await userEvent.dblClick(btn);
    await userEvent.click(btn);
    expect(await screen.findByRole('button', { name: 'Leggo la copertina…' })).toBeDisabled();
    release(new Response(JSON.stringify(READ)));
    await screen.findByLabelText('Titolo (obbligatorio) (dalla foto)');
    expect(calls.filter((c) => c === 'POST /api/cover-read')).toHaveLength(1);
  });

  it('mostra gli errori in italiano', async () => {
    server({ read: async () => new Response(JSON.stringify({ error: 'La lettura ha impiegato troppo tempo' }), { status: 504 }) });
    const { container } = open('/scansiona/manuale');
    await screen.findByLabelText('Titolo (obbligatorio)');
    await pick(container);
    await userEvent.click(await screen.findByRole('button', { name: 'Leggi i dati dalla foto' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('La lettura ha impiegato troppo tempo');
    expect(screen.getByLabelText('Titolo (obbligatorio)')).toHaveValue('');
  });

  it('senza la funzione attiva il pulsante non c’è', async () => {
    server({ coverRead: false });
    const { container } = open('/scansiona/manuale');
    await screen.findByLabelText('Titolo (obbligatorio)');
    await pick(container);
    await screen.findByText(/Copertina: c\.jpg/);
    expect(screen.queryByRole('button', { name: 'Leggi i dati dalla foto' })).not.toBeInTheDocument();
  });

  it('nella scheda, in modifica, riempie solo i campi vuoti', async () => {
    const calls = server();
    open('/libro/9780306406157');
    expect(screen.queryByRole('button', { name: 'Leggi i dati dalla foto' })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: /Modifica/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Leggi i dati dalla foto' }));
    await screen.findByText(/Compilati|Non riesco|Lettura/).then((e) => console.log('MSG', e.textContent));
    await waitFor(() => expect(screen.getByLabelText('Titolo (dalla foto)')).toHaveValue('Il nome della rosa'));
    expect(screen.getByLabelText('Editore')).toHaveValue('Mio editore');
    expect(within(screen.getByRole('status')).getByText(/titolo, autori, lingua/)).toBeInTheDocument();
    expect(calls.some((c) => c.startsWith('PATCH'))).toBe(false);
  });
});
