import { describe, expect, it } from 'vitest';
import { stringTable, t, tg } from './i18n';

describe('string table', () => {
  it('has French and English for every key, with no empty text', () => {
    for (const [key, v] of Object.entries(stringTable)) {
      expect(v.fr, key).toBeTruthy();
      expect(v.en, key).toBeTruthy();
    }
    expect(Object.keys(stringTable).length).toBeGreaterThan(300);
  });
  it('genders the inclusive form for an unknown sex', () => {
    expect(tg('fr', 'living', 'F')).toBe('Vivante');
    expect(tg('fr', 'living', 'U')).toContain('·');
    expect(t('en', 'appName')).toBe('Ramure');
  });
});
