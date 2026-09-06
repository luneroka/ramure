/**
 * Portrait pictures: downsizing on import, a small cache of decoded bitmaps
 * for the canvas, and object URLs for the DOM.
 */

import { mediaStore } from '../store';

const MAX_SIDE = 640;

/** Downsize a picked image to at most MAX_SIDE on its longer side, as JPEG. */
export async function prepareImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale),
    h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
  if (!blob) throw new Error('Image encoding failed');
  return blob;
}

type Entry = { state: 'loading' } | { state: 'ready'; bitmap: ImageBitmap } | { state: 'missing' };

/** Bitmaps by media id, loaded lazily from IndexedDB. Calls `onReady` when a new one can be drawn. */
export class PortraitCache {
  private entries = new Map<string, Entry>();
  constructor(private onReady: () => void) {}

  get(id: string): ImageBitmap | undefined {
    const e = this.entries.get(id);
    if (!e) {
      this.entries.set(id, { state: 'loading' });
      void this.load(id);
      return undefined;
    }
    return e.state === 'ready' ? e.bitmap : undefined;
  }

  /** Forget an id so it is reloaded (after a change). */
  invalidate(id: string): void {
    const e = this.entries.get(id);
    if (e?.state === 'ready') e.bitmap.close();
    this.entries.delete(id);
  }

  private async load(id: string): Promise<void> {
    try {
      const blob = await mediaStore.get(id);
      if (!blob) {
        this.entries.set(id, { state: 'missing' });
        return;
      }
      const bitmap = await createImageBitmap(blob);
      this.entries.set(id, { state: 'ready', bitmap });
      this.onReady();
    } catch {
      this.entries.set(id, { state: 'missing' });
    }
  }

  dispose(): void {
    for (const e of this.entries.values()) if (e.state === 'ready') e.bitmap.close();
    this.entries.clear();
  }
}

/** Draw `img` (or nothing) inside an oval with a thin bezel, cover-fitted and centred slightly above middle. */
export function drawMedallion(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  img: ImageBitmap | undefined,
  colors: { ring: string; fill: string; silhouette: string },
): void {
  const cx = x + w / 2,
    cy = y + h / 2;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = colors.fill;
  ctx.fill();
  ctx.clip();
  if (img) {
    const scale = Math.max(w / img.width, h / img.height);
    const dw = img.width * scale,
      dh = img.height * scale;
    // Faces sit in the upper part of a photo: bias the crop upward.
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2 - (dh - h) * 0.15, dw, dh);
  } else {
    // Silhouette: head and shoulders.
    ctx.fillStyle = colors.silhouette;
    ctx.beginPath();
    ctx.arc(cx, cy - h * 0.14, w * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx, cy + h * 0.42, w * 0.42, h * 0.32, 0, Math.PI, 0);
    ctx.fill();
  }
  ctx.restore();
  ctx.beginPath();
  ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.strokeStyle = colors.ring;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}
