import { describe, expect, it } from 'vitest';
import { parseRoute, routeHash } from './router';

describe('routes', () => {
  it('round-trips every route through the hash', () => {
    const routes = [
      { name: 'home' as const },
      { name: 'tree' as const, id: 'Tabc' },
      { name: 'resources' as const, id: 'T/x y' },
      { name: 'print' as const, id: 'Tp' },
      { name: 'print' as const, id: 'Tp', sheet: true },
      { name: 'print' as const, id: 'Tp', sheet: true, person: 'I2' },
      { name: 'settings' as const },
      { name: 'admin' as const },
    ];
    for (const r of routes) expect(parseRoute(routeHash(r))).toEqual(r);
  });
  it('opens the print page on a person sheet from its own address', () => {
    expect(routeHash({ name: 'print', id: 'T1', sheet: true, person: 'I 7' })).toBe('#/arbre/T1/imprimer/fiche/I%207');
    expect(parseRoute('#/arbre/T1/imprimer/fiche/I%207')).toEqual({ name: 'print', id: 'T1', sheet: true, person: 'I 7' });
    // A person is only ever named after « fiche »: the plain print address stays the plain print page.
    expect(parseRoute('#/arbre/T1/imprimer')).toEqual({ name: 'print', id: 'T1' });
  });
  it('accepts the English aliases and falls back to home', () => {
    expect(parseRoute('#/settings')).toEqual({ name: 'settings' });
    expect(parseRoute('#/admin')).toEqual({ name: 'admin' });
    expect(parseRoute('#/nothing-here')).toEqual({ name: 'home' });
    expect(parseRoute('')).toEqual({ name: 'home' });
  });
});
