import { describe, expect, it } from 'vitest';
import { approximateYear, formatDate, formatGedcomDate, parseDate } from './dates';

describe('parseDate', () => {
  it('parses exact and partial Gregorian dates', () => {
    expect(parseDate('12 MAR 1952')).toMatchObject({ kind: 'exact', date: { year: 1952, month: 3, day: 12 } });
    expect(parseDate('04 FEB 1921').date).toMatchObject({ day: 4, month: 2 });
    expect(parseDate('MAR 1952').date).toMatchObject({ year: 1952, month: 3 });
    expect(parseDate('1952')).toMatchObject({ kind: 'exact', date: { year: 1952 } });
  });

  it('parses modifiers and ranges', () => {
    expect(parseDate('ABT 1860').kind).toBe('about');
    expect(parseDate('CAL 1798').kind).toBe('calculated');
    expect(parseDate('EST 1866').kind).toBe('estimated');
    expect(parseDate('BEF 1860').kind).toBe('before');
    expect(parseDate('AFT 1946').kind).toBe('after');
    expect(parseDate('BET 1857 AND 1859')).toMatchObject({ kind: 'between', date: { year: 1857 }, date2: { year: 1859 } });
    expect(parseDate('FROM 1973 TO 2012')).toMatchObject({ kind: 'from-to', date: { year: 1973 }, date2: { year: 2012 } });
  });

  it('parses the French Republican calendar', () => {
    const d = parseDate('@#DFRENCH R@ 15 VEND 3');
    expect(d).toMatchObject({ kind: 'exact', date: { calendar: 'french-republican', day: 15, month: 1, year: 3 } });
    expect(approximateYear(d)).toBe(1794);
    expect(formatDate(d, 'fr')).toBe('15 vendémiaire an III');
  });

  it('keeps unknown text as a phrase and never throws', () => {
    expect(parseDate('(printemps 1870)')).toMatchObject({ kind: 'phrase', phrase: 'printemps 1870' });
    expect(parseDate('5 february 1921').kind).toBe('phrase');
    expect(parseDate('').kind).toBe('unknown');
  });

  it('round-trips through formatGedcomDate', () => {
    for (const s of ['12 MAR 1952', 'ABT 1860', 'BET 1857 AND 1859', '@#DFRENCH R@ 15 VEND 3', 'FROM 1973 TO 2012']) {
      expect(formatGedcomDate(parseDate(s))).toBe(s);
      expect(formatGedcomDate({ ...parseDate(s), raw: '' })).toBe(s);
    }
  });

  it('formats for humans in French and English', () => {
    expect(formatDate(parseDate('12 MAR 1952'), 'fr')).toBe('12 mars 1952');
    expect(formatDate(parseDate('BET 1857 AND 1859'), 'en')).toBe('between 1857 and 1859');
    expect(formatDate(parseDate('ABT 1860'), 'fr')).toBe('vers 1860');
  });
});
