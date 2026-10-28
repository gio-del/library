export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) { onUnauthorized = fn; }

async function parse(res: Response, url: string) {
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && url !== '/api/login') onUnauthorized();
  if (!res.ok) throw new ApiError((data as { error?: string }).error || 'Errore', res.status);
  return data;
}

export async function api<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  return (await parse(res, url)) as T;
}

export async function putCover<T>(isbn: string, blob: Blob): Promise<T> {
  const url = `/api/books/${isbn}/cover`;
  const res = await fetch(url, { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: blob });
  return (await parse(res, url)) as T;
}

// Scala e ricodifica in JPEG: il server accetta solo JPEG.
export async function toJpeg(file: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1000 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((bl) => (bl ? resolve(bl) : reject(new Error('Immagine non leggibile'))), 'image/jpeg', 0.85));
}
