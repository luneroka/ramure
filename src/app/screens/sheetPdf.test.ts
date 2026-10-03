import { describe, expect, it } from 'vitest';
import { faceFor, intoLines, parseColor, SHEET_FACES, type CharBox } from './sheetPdf';

/**
 * The parts of the PDF painter that do not need a browser: which embedded face draws a run of
 * text, what a computed colour means, and how characters the browser placed fall back into lines.
 * The painting itself is checked by downloading real sheets from the built app.
 */

const char = (ch: string, left: number, top: number, height = 10): CharBox => ({ ch, left, top, bottom: top + height });

describe('the person sheet as a PDF', () => {
  it('draws each run of text with the sheet face the browser used, or the nearest it ships', () => {
    expect(faceFor("'Ramure Sheet Sans', 'Public Sans', sans-serif", 600, false).file).toBe('PublicSans-SemiBold.ttf');
    expect(faceFor("'Ramure Sheet Sans', 'Public Sans', sans-serif", 400, true).file).toBe('PublicSans-Italic.ttf');
    expect(faceFor("'Ramure Sheet Serif', Newsreader, serif", 500, false).file).toBe('Newsreader-Medium.ttf');
    expect(faceFor("'Ramure Sheet Serif', Newsreader, serif", 400, true).file).toBe('Newsreader-Italic.ttf');
    // The mono face ships in one weight only: anything set in it is drawn with that one.
    expect(faceFor("'Ramure Sheet Mono', monospace", 400, false).file).toBe('IBMPlexMono-Medium.ttf');
    // A weight in between goes to the nearest one, and an italic the family lacks falls back to its upright.
    expect(faceFor("'Ramure Sheet Sans'", 700, false).file).toBe('PublicSans-SemiBold.ttf');
    expect(faceFor("'Ramure Sheet Mono'", 500, true).file).toBe('IBMPlexMono-Medium.ttf');
  });

  it('ships every face the stylesheet asks for', () => {
    expect(SHEET_FACES.map((f) => f.file).sort()).toEqual([
      'IBMPlexMono-Medium.ttf',
      'Newsreader-Italic.ttf',
      'Newsreader-Medium.ttf',
      'Newsreader-Regular.ttf',
      'PublicSans-Italic.ttf',
      'PublicSans-Medium.ttf',
      'PublicSans-Regular.ttf',
      'PublicSans-SemiBold.ttf',
    ]);
  });

  it('reads computed colours, and paints nothing for a transparent one', () => {
    expect(parseColor('rgb(31, 35, 40)')).toEqual([31, 35, 40]);
    expect(parseColor('rgba(47, 122, 109, 0.5)')).toEqual([47, 122, 109]);
    expect(parseColor('rgb(47 122 109 / 50%)')).toEqual([47, 122, 109]);
    expect(parseColor('rgba(0, 0, 0, 0)')).toBeNull();
    expect(parseColor('transparent')).toBeNull();
  });

  it('puts characters back into the lines the browser broke them into', () => {
    const chars = [char('N', 0, 0), char('é', 6, 0), char(' ', 12, 0), char('l', 0, 14), char('e', 3, 14)];
    expect(intoLines(chars)).toEqual([
      { text: 'Né', left: 0, top: 0, bottom: 10 },
      { text: 'le', left: 0, top: 14, bottom: 24 },
    ]);
  });

  it('starts a line at its first visible character and keeps letters on the same line together', () => {
    // A superscript sits a little higher, but well within half a line: it is not a new line.
    const chars = [char(' ', 0, 0), char('a', 4, 0), char('b', 9, 2), char(' ', 14, 0)];
    expect(intoLines(chars)).toEqual([{ text: 'ab', left: 4, top: 0, bottom: 10 }]);
    expect(intoLines([char(' ', 0, 0)])).toEqual([]);
  });
});
