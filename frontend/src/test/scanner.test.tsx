import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../App';
import { AuthProvider } from '../state/auth';

const ISBN = '9780306406157';
const detect = vi.fn(async () => [{ rawValue: ISBN }]);
vi.mock('../lib/zxing', () => ({ createDetector: () => ({ detect }) }));

// EAN-13 disegnato a mano (codici L/G/R e parità della prima cifra), per provare zxing vero.
const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const R = L.map((c) => [...c].map((b) => (b === '0' ? '1' : '0')).join(''));
const G = R.map((c) => [...c].reverse().join(''));
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
function ean13(code: string, module = 3, height = 60) {
  const d = [...code].map(Number);
  const left = d.slice(1, 7).map((n, i) => (PARITY[d[0]][i] === 'L' ? L : G)[n]).join('');
  const bits = '0'.repeat(12) + '101' + left + '01010' + d.slice(7).map((n) => R[n]).join('') + '101' + '0'.repeat(12);
  const width = bits.length * module;
  const lum = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) lum[y * width + x] = bits[Math.floor(x / module)] === '1' ? 0 : 255;
  return { lum, width, height };
}

function server() {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method || 'GET'} ${url}`;
    calls.push(key);
    if (key === 'GET /api/auth/status') return new Response(JSON.stringify({ authenticated: true }));
    if (key === 'GET /api/books') return new Response('[]');
    if (key === `GET /api/books/${ISBN}`) return new Response(JSON.stringify({ isbn: ISBN, title: 'Mansfield Park', authors: ['Jane Austen'] }));
    return new Response(JSON.stringify({ error: 'Non trovato' }), { status: 404 });
  }));
  return calls;
}

function camera() {
  const t = { stop: vi.fn(), applyConstraints: vi.fn(async () => {}) };
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [t], getVideoTracks: () => [t] })) } });
  HTMLMediaElement.prototype.play = vi.fn(async () => {});
  return t;
}

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
  delete (window as { BarcodeDetector?: unknown }).BarcodeDetector;
  detect.mockClear();
});

const open = () => render(<MemoryRouter initialEntries={['/scansiona']}><AuthProvider><App /></AuthProvider></MemoryRouter>);

describe('lettore zxing', () => {
  it('legge un EAN-13 vero dall’immagine in scala di grigi', async () => {
    const z = await vi.importActual<typeof import('../lib/zxing')>('../lib/zxing');
    const { lum, width, height } = ean13(ISBN);
    expect(z.decodeLuminance(lum, width, height)).toBe(ISBN);
    expect(z.decodeLuminance(new Uint8ClampedArray(width * height).fill(255), width, height)).toBeNull();
  });

  it('converte RGBA in luminanza', async () => {
    const z = await vi.importActual<typeof import('../lib/zxing')>('../lib/zxing');
    expect([...z.luminance(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]), 2, 1)]).toEqual([255, 0]);
  });
});

describe('Scansiona senza BarcodeDetector (Safari iOS)', () => {
  it('la fotocamera parte e il codice letto si controlla una volta sola, anche con doppio tocco', async () => {
    const calls = server();
    const t = camera();
    open();
    await userEvent.dblClick(await screen.findByRole('button', { name: 'Apri la fotocamera' }));
    expect(await screen.findByRole('button', { name: 'Chiudi la fotocamera' })).toBeInTheDocument();
    await screen.findByText('Mansfield Park');
    await waitFor(() => expect(detect.mock.calls.length).toBeGreaterThan(2), { timeout: 2000 });
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    expect(calls.filter((c) => c === `GET /api/books/${ISBN}`)).toHaveLength(1);
    expect(screen.queryByText(/non legge i codici/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Chiudi la fotocamera' }));
    expect(t.stop).toHaveBeenCalled();
  });

  it('con BarcodeDetector usa quello del browser', async () => {
    server();
    camera();
    const native = vi.fn(async () => [{ rawValue: ISBN }]);
    (window as { BarcodeDetector?: unknown }).BarcodeDetector = class { detect = native; };
    open();
    await userEvent.click(await screen.findByRole('button', { name: 'Apri la fotocamera' }));
    await screen.findByText('Mansfield Park');
    expect(native).toHaveBeenCalled();
    expect(detect).not.toHaveBeenCalled();
  });

  it('senza fotocamera: messaggio chiaro', async () => {
    server();
    open();
    await userEvent.click(await screen.findByRole('button', { name: 'Apri la fotocamera' }));
    expect(await screen.findByText(/non usa la fotocamera: scrivi l’ISBN a mano/)).toBeInTheDocument();
  });
});
