/**
 * What may be stored as media, decided from the bytes rather than the
 * declared type. SVG is refused: it can carry script and would run on the
 * app's own origin.
 */

/** One file. Checked from the header before the body is read, then again on the bytes. */
export const MAX_MEDIA_BYTES = 10 * 1024 * 1024;

/**
 * How much R2 one family may hold.
 *
 * Uploading was the only unbounded write an ordinary user had: ten megabytes a
 * file and no ceiling above it, so the first anyone would learn of a runaway is
 * the bill. Two gigabytes is far past a family's photographs and document scans
 * — several accounts still fit inside R2's free tier — and the point is that
 * there is a floor at all, not where exactly it sits.
 *
 * Counted over *every* media row rather than the live ones, because that is what
 * R2 is holding: a deleted file stays for thirty days so an undo can bring it
 * back, and counting only live rows would let the same space be spent again and
 * again inside that window.
 */
export const MAX_ACCOUNT_BYTES = 2 * 1024 * 1024 * 1024;

export type MediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | 'image/heic' | 'application/pdf';

const EXT: Record<MediaType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

export function extensionOf(type: string): string {
  return EXT[type as MediaType] ?? 'bin';
}

/** The type the bytes really are, or undefined when they are not an allowed kind. */
export function sniffMediaType(bytes: ArrayBuffer | Uint8Array): MediaType | undefined {
  const b = bytes instanceof Uint8Array ? bytes.subarray(0, 16) : new Uint8Array(bytes.slice(0, 16));
  if (b.length < 12) return undefined;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a)
    return 'image/png';
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return 'image/gif';
  if (ascii(0, 4) === '%PDF') return 'application/pdf';
  if (ascii(4, 8) === 'ftyp' && /^(heic|heix|hevc|mif1|msf1|heim|heis|hevm|hevs)$/.test(ascii(8, 12))) return 'image/heic';
  return undefined;
}
