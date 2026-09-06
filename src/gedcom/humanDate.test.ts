import { describe, expect, it } from 'vitest';
import { parseHumanDate } from './humanDate';

const raw = (s: string) => parseHumanDate(s)?.raw;

describe('parseHumanDate', () => {
  it('reads French and numeric forms', () => {
    expect(raw('12/03/1952')).toBe('12 MAR 1952');
    expect(raw('12 mars 1952')).toBe('12 MAR 1952');
    expect(raw('1er mai 1900')).toBe('1 MAY 1900');
    expect(raw('mars 1952')).toBe('MAR 1952');
    expect(raw('1952')).toBe('1952');
    expect(raw('03/1952')).toBe('MAR 1952');
    expect(raw('1952-03-12')).toBe('12 MAR 1952');
    expect(raw('4 févr. 1921')).toBe('4 FEB 1921');
  });

  it('reads modifiers in both languages', () => {
    expect(raw('vers 1860')).toBe('ABT 1860');
    expect(raw('about 1860')).toBe('ABT 1860');
    expect(raw('~1860')).toBe('ABT 1860');
    expect(raw('avant 1900')).toBe('BEF 1900');
    expect(raw('après 1946')).toBe('AFT 1946');
    expect(raw('entre 1880 et 1885')).toBe('BET 1880 AND 1885');
    expect(raw('between 1880 and 1885')).toBe('BET 1880 AND 1885');
    expect(raw('de 1973 à 2012')).toBe('FROM 1973 TO 2012');
    expect(raw('from 1973 to 2012')).toBe('FROM 1973 TO 2012');
    expect(raw('entre 12 mars 1880 et avril 1885')).toBe('BET 12 MAR 1880 AND APR 1885');
  });

  it('reads English month names', () => {
    expect(raw('12 March 1952')).toBe('12 MAR 1952');
    expect(raw('March 12, 1952')).toBe('12 MAR 1952');
    expect(raw('Sep 1999')).toBe('SEP 1999');
  });

  it('reads the Republican calendar', () => {
    expect(raw('15 vendémiaire an III')).toBe('@#DFRENCH R@ 15 VEND 3');
    expect(raw('vend an 3')).toBe('@#DFRENCH R@ VEND 3');
  });

  it('passes raw GEDCOM through', () => {
    expect(raw('BET 1857 AND 1859')).toBe('BET 1857 AND 1859');
    expect(raw('ABT 1860')).toBe('ABT 1860');
  });

  it('gives up on nonsense', () => {
    expect(parseHumanDate('un jour de pluie')).toBeUndefined();
    expect(parseHumanDate('')).toBeUndefined();
  });
});
