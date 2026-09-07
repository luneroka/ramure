import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../gedcom/parse';
import { describeKinship } from './kinship';

const tree = parseGedcom(readFileSync(new URL('../../fixtures/geneanet/input-fixture.ged', import.meta.url), 'utf8'));
const rel = (a: string, b: string, lang: 'fr' | 'en' = 'fr') => describeKinship(tree, a, b, lang);

describe('describeKinship', () => {
  it('names parents, grandparents, siblings and half-siblings', () => {
    expect(rel('I1', 'I2').relation).toBe('le père');
    expect(rel('I1', 'I2').path).toEqual(['I1', 'I2']);
    expect(rel('I1', 'I10').relation).toBe('la grand-mère');
    expect(rel('I29', 'I1').relation).toBe('la grand-mère');
    expect(rel('I29', 'I2').relation).toBe('l’arrière-grand-père');
    expect(rel('I1', 'I7').relation).toBe('le frère');
    expect(rel('I1', 'I5').relation).toBe('le demi-frère');
    expect(rel('I2', 'I1').relation).toBe('la fille');
    expect(rel('I2', 'I29').relation).toBe('l’arrière-petite-fille');
  });

  it('names uncles, nephews and cousins', () => {
    expect(rel('I29', 'I26').relation).toBe('l’oncle');
    expect(rel('I26', 'I29').relation).toBe('la nièce');
    expect(rel('I29', 'I31').relation).toBe('la cousine germaine');
    expect(rel('I31', 'I29', 'en').relation).toBe('the first cousin');
    expect(rel('I29', 'I2', 'en').relation).toBe('the great-grandfather');
  });

  it('handles spouses and in-laws', () => {
    expect(rel('I1', 'I24').relation).toBe('l’époux');
    expect(rel('I24', 'I2').relation).toBe('le beau-père');
    expect(rel('I2', 'I24').relation).toBe('le gendre');
    expect(rel('I28', 'I26').relation).toBe('le beau-frère');
    expect(rel('I2', 'I28').relation).toBe('l’époux de la petite-fille');
    expect(rel('I2', 'I28').path).toEqual(['I2', 'I1', 'I25', 'I28']);
  });

  it('falls back to the shortest path, and admits when there is none', () => {
    const r = rel('I4', 'I3');
    expect(r.kind).toBe('indirect');
    expect(r.path).toEqual(['I4', 'I2', 'I3']);
    expect(rel('I1', 'I1').kind).toBe('same');
    expect(rel('I33', 'I1').kind).toBe('none');
  });

  it('writes full sentences', () => {
    expect(rel('I1', 'I10').sentence).toBe('Marie BRÉHIER est la grand-mère de Marguerite LENOIR');
    expect(rel('I1', 'I10', 'en').sentence).toBe('Marie BRÉHIER is the grandmother of Marguerite LENOIR');
  });
});
