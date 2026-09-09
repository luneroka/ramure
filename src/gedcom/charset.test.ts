import { describe, expect, it } from 'vitest';
import { decodeAnsel, decodeGedcom, sniffCharset } from './charset';

const bytes = (...b: Array<number | string>) =>
  new Uint8Array(b.flatMap((x) => (typeof x === 'string' ? [...x].map((c) => c.charCodeAt(0)) : [x])));

describe('GEDCOM charsets', () => {
  it('composes ANSEL combining marks with the letter that follows', () => {
    expect(decodeAnsel(bytes('Ren', 0xe2, 'e'))).toBe('René');
    expect(decodeAnsel(bytes('Fran', 0xf0, 'cois'))).toBe('François');
    expect(decodeAnsel(bytes(0xa5, 'gle'))).toBe('Ægle');
    expect(decodeAnsel(bytes('No', 0xe8, 'el'))).toBe('Noël');
  });

  it('reads the declared charset from the header', () => {
    expect(sniffCharset(bytes('0 HEAD\n1 SOUR X\n1 CHAR ANSEL\n'))).toBe('ansel');
    expect(sniffCharset(bytes('0 HEAD\n1 CHAR ANSI\n'))).toBe('windows-1252');
    expect(sniffCharset(bytes('0 HEAD\n1 CHAR UTF-8\n'))).toBe('utf-8');
    expect(sniffCharset(bytes(0xff, 0xfe, '0'))).toBe('utf-16le');
  });

  it('decodes a whole ANSEL file and falls back to Windows-1252 for a false UTF-8 claim', () => {
    expect(decodeGedcom(bytes('0 HEAD\n1 CHAR ANSEL\n0 @I1@ INDI\n1 NAME Ren', 0xe2, 'e /Dupont/\n').buffer as ArrayBuffer)).toContain(
      'René /Dupont/',
    );
    expect(decodeGedcom(bytes('0 HEAD\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NAME Ren', 0xe9, ' /Dupont/\n').buffer as ArrayBuffer)).toContain(
      'René /Dupont/',
    );
  });
});
