import { describe, expect, it } from 'vitest';
import { computeAge } from './age';
import { parseDate } from './dates';

const d = parseDate;

describe('computeAge', () => {
  it('is exact with full dates and respects the birthday', () => {
    expect(computeAge(d('4 FEB 1921'), d('17 NOV 1998'))).toEqual({ years: 77, approx: false });
    expect(computeAge(d('4 FEB 1921'), d('3 FEB 1998'))).toEqual({ years: 76, approx: false });
    expect(computeAge(d('2 OCT 1949'), d('2 OCT 1949'))).toEqual({ years: 0, approx: false });
  });

  it('falls back to years and flags it', () => {
    expect(computeAge(d('1889'), d('1954'))).toEqual({ years: 65, approx: true });
    expect(computeAge(d('ABT 1860'), d('1917'))).toEqual({ years: 57, approx: true });
    expect(computeAge(d('BET 1857 AND 1859'), d('1923'))).toEqual({ years: 66, approx: true });
    expect(computeAge(d('@#DFRENCH R@ 15 VEND 3'), d('BEF 1860'))).toEqual({ years: 66, approx: true });
  });

  it('computes age today for the living', () => {
    const y = new Date().getFullYear();
    expect(computeAge(d(`12 MAR ${y - 30}`), 'today')?.years).toBeGreaterThanOrEqual(29);
    expect(computeAge(d(String(y - 30)), 'today')).toEqual({ years: 30, approx: true });
    expect(computeAge(d('1850'), 'today')).toBeUndefined(); // nobody is 176
  });

  it('refuses impossible orders and missing dates', () => {
    expect(computeAge(d('1954'), d('1889'))).toBeUndefined();
    expect(computeAge(undefined, d('1889'))).toBeUndefined();
    expect(computeAge(d('(printemps 1870)'), d('1900'))).toBeUndefined();
  });
});
