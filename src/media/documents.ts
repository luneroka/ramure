/**
 * Documents attached to a person: a scan, a photo, a PDF. Images are
 * downsized so a phone photo does not weigh 8 MB; PDFs are kept as they
 * are. The limit is what the Worker accepts.
 */

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
/** Images longer than this on a side are downsized; anything smaller is kept byte for byte. */
const MAX_IMAGE_SIDE = 2400;

export type DocumentError = 'too-big' | 'unsupported';

/** What the server stores; the same list as its byte sniffing. SVG is refused everywhere. */
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'application/pdf'];

export function documentError(file: File): DocumentError | undefined {
  if (file.size > MAX_DOCUMENT_BYTES) return 'too-big';
  if (!ACCEPTED_TYPES.includes(file.type)) return 'unsupported';
  return undefined;
}

function formatOf(type: string): string {
  const sub = type.split('/')[1] ?? '';
  return sub === 'jpeg' ? 'jpg' : sub === 'svg+xml' ? 'svg' : sub || 'bin';
}

/**
 * The blob to store and the GEDCOM FORM value. A scan or a screenshot must
 * stay readable, so the original bytes are kept whenever they fit; only
 * very large pictures are downsized, losslessly when they came in as PNG.
 */
export async function prepareDocument(file: File): Promise<{ blob: Blob; format: string }> {
  if (file.type === 'application/pdf') return { blob: file, format: 'pdf' };
  const format = formatOf(file.type);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Formats the browser cannot decode (some TIFFs) are stored as they are.
    return { blob: file, format };
  }
  const longest = Math.max(bitmap.width, bitmap.height);
  if (longest <= MAX_IMAGE_SIDE) {
    bitmap.close();
    return { blob: file, format };
  }
  const scale = MAX_IMAGE_SIDE / longest;
  const w = Math.round(bitmap.width * scale),
    h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const lossless = file.type === 'image/png' || file.type === 'image/gif';
  const blob = await new Promise<Blob | null>((resolve) =>
    lossless ? canvas.toBlob(resolve, 'image/png') : canvas.toBlob(resolve, 'image/jpeg', 0.92),
  );
  if (!blob) throw new Error('Image encoding failed');
  return { blob, format: lossless ? 'png' : 'jpg' };
}

export function isPdf(format: string | undefined): boolean {
  return (format ?? '').toLowerCase() === 'pdf';
}

/** "1,2 Mo" / "1.2 MB" */
export function formatBytes(bytes: number, lang: 'fr' | 'en'): string {
  const mb = bytes / (1024 * 1024);
  const unit = lang === 'fr' ? 'Mo' : 'MB';
  if (mb >= 1) return `${mb.toLocaleString(lang, { maximumFractionDigits: 1 })} ${unit}`;
  const kb = Math.max(1, Math.round(bytes / 1024));
  return `${kb} ${lang === 'fr' ? 'ko' : 'KB'}`;
}
