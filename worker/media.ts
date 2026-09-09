/**
 * What may be stored as media, decided from the bytes rather than the
 * declared type. SVG is refused: it can carry script and would run on the
 * app's own origin.
 */

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
