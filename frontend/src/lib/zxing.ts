import { BarcodeFormat, BinaryBitmap, DecodeHintType, HybridBinarizer, MultiFormatReader, RGBLuminanceSource } from '@zxing/library';

// Lettore EAN-13 in JavaScript puro per i browser senza BarcodeDetector (Safari iOS, Firefox): niente WebAssembly, la CSP resta stretta.
const reader = new MultiFormatReader();
reader.setHints(new Map<DecodeHintType, unknown>([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]], [DecodeHintType.TRY_HARDER, true]]));

// Pixel RGBA → luminanza (un byte per pixel), come la vuole zxing.
export function luminance(rgba: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) out[i] = (rgba[p] * 77 + rgba[p + 1] * 150 + rgba[p + 2] * 29) >> 8;
  return out;
}

// Codice letto nell'immagine in scala di grigi, o null se non ce n'è.
export function decodeLuminance(lum: Uint8ClampedArray, width: number, height: number): string | null {
  try {
    return reader.decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(lum, width, height, width, height, 0, 0)))).getText();
  } catch { return null; } finally { reader.reset(); }
}

const MAX_W = 960;

// Stessa forma di BarcodeDetector.detect: legge un fotogramma del video ridotto a 960 px di larghezza.
export function createDetector() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return {
    async detect(video: HTMLVideoElement): Promise<{ rawValue: string }[]> {
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!ctx || !vw || !vh) return [];
      const scale = Math.min(1, MAX_W / vw);
      const w = Math.round(vw * scale), h = Math.round(vh * scale);
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      ctx.drawImage(video, 0, 0, w, h);
      const text = decodeLuminance(luminance(ctx.getImageData(0, 0, w, h).data, w, h), w, h);
      return text ? [{ rawValue: text }] : [];
    },
  };
}
