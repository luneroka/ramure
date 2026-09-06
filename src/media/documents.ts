/**
 * Documents attached to a person: a scan, a photo, a PDF. Images are
 * downsized so a phone photo does not weigh 8 MB; PDFs are kept as they
 * are. The limit is what the Worker accepts.
 */

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_SIDE = 1600;

export type DocumentError = 'too-big' | 'unsupported';

export function documentError(file: File): DocumentError | undefined {
  if (file.size > MAX_DOCUMENT_BYTES) return 'too-big';
  if (!file.type.startsWith('image/') && file.type !== 'application/pdf') return 'unsupported';
  return undefined;
}

/** The blob to store and the GEDCOM FORM value. */
export async function prepareDocument(file: File): Promise<{ blob: Blob; format: string }> {
  if (file.type === 'application/pdf') return { blob: file, format: 'pdf' };
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale),
    h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error('Image encoding failed');
  return { blob, format: 'jpg' };
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
