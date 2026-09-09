import { describe, expect, it } from 'vitest';
import { parseRoute, routeHash } from './router';

describe('routes', () => {
  it('round-trips every route through the hash', () => {
    const routes = [
      { name: 'home' as const },
      { name: 'tree' as const, id: 'Tabc' },
      { name: 'resources' as const, id: 'T/x y' },
      { name: 'settings' as const },
      { name: 'admin' as const },
    ];
    for (const r of routes) expect(parseRoute(routeHash(r))).toEqual(r);
  });
  it('accepts the English aliases and falls back to home', () => {
    expect(parseRoute('#/settings')).toEqual({ name: 'settings' });
    expect(parseRoute('#/admin')).toEqual({ name: 'admin' });
    expect(parseRoute('#/nothing-here')).toEqual({ name: 'home' });
    expect(parseRoute('')).toEqual({ name: 'home' });
  });
});
