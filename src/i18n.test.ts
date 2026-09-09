import { describe, expect, it } from 'vitest';
import { tf, tn } from './i18n';

describe('counted and filled strings', () => {
  it('picks the singular for one and the plural above', () => {
    expect(tn('fr', 'peopleCount', 1)).toBe('1 personne');
    expect(tn('fr', 'peopleCount', 34)).toBe('34 personnes');
    expect(tn('en', 'peopleCount', 1)).toBe('1 person');
    expect(tn('en', 'peopleCount', 2)).toBe('2 people');
  });

  it('zero is singular in French and plural in English', () => {
    expect(tn('fr', 'peopleCount', 0)).toBe('0 personne');
    expect(tn('en', 'peopleCount', 0)).toBe('0 people');
  });

  it('fills named placeholders and leaves unknown ones visible', () => {
    expect(tf('fr', 'shownOf', { n: 12, total: 40 })).toBe('12 / 40 affichées');
    expect(tf('en', 'shownOf', { n: 3 })).toBe('3 / {total} shown');
  });
});
