import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CoverPicker } from '../components/CoverPicker';
import { moveRect, resizeRect } from '../components/CropSheet';

const sizes: [number, number][] = [];
let bmp = { width: 400, height: 600 };
const drawImage = vi.fn();

beforeEach(() => {
  sizes.length = 0; drawImage.mockClear(); bmp = { width: 400, height: 600 };
  globalThis.createImageBitmap = vi.fn(async () => ({ ...bmp })) as never;
  URL.createObjectURL = vi.fn(() => 'blob:x'); URL.revokeObjectURL = vi.fn();
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage, translate: vi.fn(), rotate: vi.fn() })) as never;
  HTMLCanvasElement.prototype.toBlob = vi.fn(function (this: HTMLCanvasElement, cb: BlobCallback) { sizes.push([this.width, this.height]); cb(new Blob(['x'], { type: 'image/jpeg' })); }) as never;
  Element.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 200, height: 300, right: 200, bottom: 300, toJSON() {} });
});

async function pick(onPick = vi.fn()) {
  const { container } = render(<CoverPicker onPick={onPick} />);
  const input = container.querySelector('input[type=file]') as HTMLInputElement;
  await userEvent.upload(input, new File(['a'], 'c.png', { type: 'image/png' }));
  await screen.findByAltText('Foto da ritagliare');
  return onPick;
}
const drag = (el: Element, dx: number, dy: number) => {
  fireEvent.pointerDown(el, { pointerId: 1, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(el, { pointerId: 1, clientX: 100 + dx, clientY: 100 + dy });
  fireEvent.pointerUp(el, { pointerId: 1 });
};

describe('Ritaglia la copertina', () => {
  it('il riquadro parte su tutta la foto e «Usa la foto» consegna le dimensioni intere', async () => {
    const onPick = await pick();
    expect(screen.getByRole('dialog', { name: 'Ritaglia la copertina' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Usa la foto' }));
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(sizes.at(-1)).toEqual([400, 600]);
    expect(onPick.mock.calls[0][1]).toBe('c.png');
  });

  it('ridimensionare da un angolo e trascinare: il Blob ha le dimensioni del ritaglio', async () => {
    const onPick = await pick();
    drag(screen.getByTestId('crop-se'), -100, -150); // meta' di larghezza e altezza
    drag(screen.getByTestId('crop-nw'), 20, 30); // x: 0.1, y: 0.1 -> w .4, h .4
    drag(screen.getByTestId('crop-box'), 10, 15);
    await userEvent.click(screen.getByRole('button', { name: 'Usa la foto' }));
    await waitFor(() => expect(onPick).toHaveBeenCalled());
    expect(sizes.at(-1)).toEqual([160, 240]);
    expect(drawImage).toHaveBeenLastCalledWith(expect.anything(), 60, 90, 160, 240, 0, 0, 160, 240);
  });

  it('tocchi ripetuti su «Usa la foto» = una sola consegna', async () => {
    const onPick = await pick();
    await userEvent.tripleClick(screen.getByRole('button', { name: 'Usa la foto' }));
    await waitFor(() => expect(onPick).toHaveBeenCalled());
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('Annulla: nessuna copertina', async () => {
    const onPick = await pick();
    await userEvent.click(screen.getByRole('button', { name: 'Annulla' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onPick).not.toHaveBeenCalled();
  });

  it('Ruota scambia larghezza e altezza', async () => {
    const onPick = await pick();
    await userEvent.click(screen.getByRole('button', { name: 'Ruota' }));
    await waitFor(() => expect(sizes).toContainEqual([600, 400]));
    await userEvent.click(screen.getByRole('button', { name: 'Usa la foto' }));
    await waitFor(() => expect(onPick).toHaveBeenCalled());
  });

  it('maniglie >= 44px e niente scroll orizzontale', async () => {
    await pick();
    expect(screen.getByTestId('crop-nw')).toHaveClass('size-11');
    expect(screen.getByRole('dialog').className).not.toMatch(/overflow-x-(auto|scroll)/);
  });

  it('moveRect/resizeRect restano nella foto e sopra il minimo', () => {
    const r = { x: 0.2, y: 0.2, w: 0.5, h: 0.5 };
    expect(moveRect(r, 5, -5)).toMatchObject({ x: 0.5, y: 0 });
    const s = resizeRect(r, 'se', -5, -5);
    expect(s.w).toBeCloseTo(0.1); expect(s.h).toBeCloseTo(0.1);
  });
});
