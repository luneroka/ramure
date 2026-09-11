import { describe, expect, it } from 'vitest';
import { textWidth, truncate } from './text';

describe('measuring text without a DOM', () => {
  it('scales with the font size and counts narrow letters as narrow', () => {
    expect(textWidth('Illi', 10)).toBeLessThan(textWidth('Mmmm', 10));
    expect(textWidth('Dupont', 20)).toBeCloseTo(2 * textWidth('Dupont', 10), 5);
    expect(textWidth('', 10)).toBe(0);
  });

  it('measures an accented name as the letters underneath', () => {
    expect(textWidth('Hélène', 10)).toBeCloseTo(textWidth('Helene', 10), 5);
  });

  it('is within a tenth of a real sans-serif face', () => {
    // Helvetica sets "Marguerite Lenoir" at 10 px in 84.2 px; the estimate must not be off by more than a letter.
    expect(textWidth('Marguerite Lenoir', 10)).toBeGreaterThan(75);
    expect(textWidth('Marguerite Lenoir', 10)).toBeLessThan(93);
  });
});

describe('cutting a name to the room it has', () => {
  it('leaves a name that fits alone', () => {
    const s = 'Marguerite';
    expect(truncate(s, 10, textWidth(s, 10) + 1)).toBe(s);
  });

  it('cuts with an ellipsis and stays inside the width', () => {
    const cut = truncate('Marie-Antoinette de la Fontaine', 10, 60);
    expect(cut.endsWith('…')).toBe(true);
    expect(textWidth(cut, 10)).toBeLessThanOrEqual(60);
  });

  it('gives nothing back when not even one letter fits', () => {
    expect(truncate('Marguerite', 10, 2)).toBe('');
  });
});
