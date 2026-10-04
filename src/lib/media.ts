import { FRESH_CAPTURE_MAX_AGE_MS } from '../core/config';

export function isFreshCapture(file: { lastModified: number }, now: number, maxAgeMs = FRESH_CAPTURE_MAX_AGE_MS): boolean {
  const age = now - file.lastModified;
  return age <= maxAgeMs && age >= -60_000;
}

export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  const long = Math.max(w, h);
  if (long <= max) return { w, h };
  const k = max / long;
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

/** Browser-only. Resizes and re-encodes as JPEG; EXIF (incl. GPS) is dropped by the canvas re-encode. */
export async function compressImage(file: File, maxSide = 1280, quality = 0.8): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const { w, h } = fitWithin(bmp.width, bmp.height, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode_failed'))), 'image/jpeg', quality));
}

/** Browser-only. */
export function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(file);
    v.preload = 'metadata';
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(v.duration); };
    v.onerror = () => { URL.revokeObjectURL(url); reject(new Error('video_unreadable')); };
    v.src = url;
  });
}
