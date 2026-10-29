import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CoverPicker } from '../components/CoverPicker';

function track() { return { stop: vi.fn() }; }
function mockCamera(gum: () => Promise<unknown>) {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(gum) } });
  HTMLMediaElement.prototype.play = vi.fn(async () => {});
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() })) as never;
  globalThis.createImageBitmap = vi.fn(async () => ({ width: 400, height: 600 })) as never;
  URL.createObjectURL = vi.fn(() => 'blob:x'); URL.revokeObjectURL = vi.fn();
  HTMLCanvasElement.prototype.toBlob = vi.fn((cb: BlobCallback) => cb(new Blob(['x'], { type: 'image/jpeg' }))) as never;
}

afterEach(() => { Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined }); });

describe('Scatta ora', () => {
  it('offre galleria e fotocamera', () => {
    render(<CoverPicker onPick={() => {}} />);
    expect(screen.getByText('Scegli dalla galleria')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Scatta ora/ })).toBeInTheDocument();
  });

  it('doppio tocco su Scatta = una foto; Usa questa foto consegna e spegne la fotocamera', async () => {
    const t = track();
    mockCamera(async () => ({ getTracks: () => [t], getVideoTracks: () => [t] }));
    const onPick = vi.fn();
    render(<CoverPicker onPick={onPick} />);
    await userEvent.click(screen.getByRole('button', { name: /Scatta ora/ }));
    const shoot = await screen.findByRole('button', { name: 'Scatta' });
    await userEvent.dblClick(shoot);
    expect(await screen.findByRole('button', { name: 'Usa questa foto' })).toBeInTheDocument();
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledTimes(1);
    expect(t.stop).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Usa questa foto' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Usa la foto' }));
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('Rifai riaccende la fotocamera', async () => {
    const t = track();
    mockCamera(async () => ({ getTracks: () => [t], getVideoTracks: () => [t] }));
    render(<CoverPicker onPick={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Scatta ora/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Scatta' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Rifai' }));
    expect(await screen.findByRole('button', { name: 'Scatta' })).toBeInTheDocument();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(2);
  });

  it('chiudere il foglio spegne il flusso', async () => {
    const t = track();
    mockCamera(async () => ({ getTracks: () => [t], getVideoTracks: () => [t] }));
    const onPick = vi.fn();
    render(<CoverPicker onPick={onPick} />);
    await userEvent.click(screen.getByRole('button', { name: /Scatta ora/ }));
    await screen.findByRole('button', { name: 'Scatta' });
    await userEvent.click(screen.getByRole('button', { name: 'Chiudi' }));
    await waitFor(() => expect(t.stop).toHaveBeenCalled());
    expect(onPick).not.toHaveBeenCalled();
  });

  it('permesso negato: messaggio chiaro e galleria ancora disponibile', async () => {
    mockCamera(async () => { throw new DOMException('no', 'NotAllowedError'); });
    render(<CoverPicker onPick={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Scatta ora/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Permesso alla fotocamera negato/);
    await userEvent.click(screen.getAllByRole('button', { name: 'Chiudi' })[0]);
    expect(screen.getByText('Scegli dalla galleria')).toBeInTheDocument();
  });

  it('senza fotocamera: messaggio chiaro', async () => {
    render(<CoverPicker onPick={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Scatta ora/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/galleria/);
  });
});
