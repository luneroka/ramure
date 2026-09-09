/**
 * Bytes to text for GEDCOM files. The header says which encoding, when the
 * file has one at all; ANSEL (the 5.5 default, still emitted by old
 * desktop programs) has no browser decoder, so it is done here.
 */

export type Charset = 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252' | 'ansel';

/** What the file says about itself: BOM first, then `1 CHAR` in the header. */
export function sniffCharset(bytes: Uint8Array): Charset {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8';
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 4000));
  const m = /^\s*1 CHAR\s+([A-Za-z0-9_-]+)/m.exec(head);
  const declared = (m?.[1] ?? '').toUpperCase();
  if (declared === 'ANSEL') return 'ansel';
  if (declared === 'ANSI' || declared === 'IBMPC' || declared === 'IBM' || declared === 'MSDOS' || declared === 'WINDOWS-1252')
    return 'windows-1252';
  if (declared.startsWith('UTF-16') || declared === 'UNICODE') return 'utf-16le';
  return 'utf-8';
}

/** Decode a whole file. A file that claims UTF-8 but is not falls back to Windows-1252, the common case for old exports. */
export function decodeGedcom(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const charset = sniffCharset(bytes);
  switch (charset) {
    case 'ansel':
      return decodeAnsel(bytes);
    case 'utf-16le':
    case 'utf-16be':
      return new TextDecoder(charset).decode(bytes);
    case 'windows-1252':
      return new TextDecoder('windows-1252').decode(bytes);
    default:
      try {
        return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
      } catch {
        return new TextDecoder('windows-1252').decode(bytes);
      }
  }
}

// ANSEL (ANSI Z39.47) as used by GEDCOM 5.5: spacing characters in A1–CF, combining marks in E0–FE
// that precede the letter they modify.
const SPACING: Record<number, string> = {
  0xa1: 'Ł',
  0xa2: 'Ø',
  0xa3: 'Đ',
  0xa4: 'Þ',
  0xa5: 'Æ',
  0xa6: 'Œ',
  0xa7: 'ʹ',
  0xa8: '·',
  0xa9: '♭',
  0xaa: '®',
  0xab: '±',
  0xac: 'Ơ',
  0xad: 'Ư',
  0xae: 'ʼ',
  0xb0: 'ʻ',
  0xb1: 'ł',
  0xb2: 'ø',
  0xb3: 'đ',
  0xb4: 'þ',
  0xb5: 'æ',
  0xb6: 'œ',
  0xb7: 'ʺ',
  0xb8: 'ı',
  0xb9: '£',
  0xba: 'ð',
  0xbc: 'ơ',
  0xbd: 'ư',
  0xbe: '□',
  0xbf: '■',
  0xc0: '°',
  0xc1: 'ℓ',
  0xc2: '℗',
  0xc3: '©',
  0xc4: '♯',
  0xc5: '¿',
  0xc6: '¡',
  0xc7: 'ß',
  0xc8: '€',
  0xcd: 'e',
  0xce: 'o',
  0xcf: 'ß',
};
const COMBINING: Record<number, string> = {
  0xe0: '̉',
  0xe1: '̀',
  0xe2: '́',
  0xe3: '̂',
  0xe4: '̃',
  0xe5: '̄',
  0xe6: '̆',
  0xe7: '̇',
  0xe8: '̈',
  0xe9: '̌',
  0xea: '̊',
  0xeb: '︠',
  0xec: '︡',
  0xed: '̕',
  0xee: '̋',
  0xef: '̐',
  0xf0: '̧',
  0xf1: '̨',
  0xf2: '̣',
  0xf3: '̤',
  0xf4: '̥',
  0xf5: '̳',
  0xf6: '̲',
  0xf7: '̦',
  0xf8: '̜',
  0xf9: '̮',
  0xfa: '︢',
  0xfb: '︣',
  0xfe: '̓',
};

export function decodeAnsel(bytes: Uint8Array): string {
  let out = '';
  let marks = '';
  for (const b of bytes) {
    const mark = COMBINING[b];
    if (mark !== undefined) {
      marks += mark;
      continue;
    }
    const ch = b < 0x80 ? String.fromCharCode(b) : (SPACING[b] ?? '�');
    out += ch + marks;
    marks = '';
  }
  return (out + marks).normalize('NFC');
}
