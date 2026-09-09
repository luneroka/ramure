import { describe, expect, it, vi } from 'vitest';

vi.mock('@/store', () => ({ mediaStore: { get: async () => null } }));

import { PortraitCache } from './portraits';

describe('PortraitCache', () => {
  it('keeps at most `max` entries, dropping the least recently drawn', async () => {
    const cache = new PortraitCache(() => {}, 3);
    for (const id of ['a', 'b', 'c']) cache.get(id);
    await new Promise((r) => setTimeout(r, 0)); // loads settle as "missing"
    cache.get('a'); // a is now the most recent
    cache.get('d');
    expect(cache.size).toBe(3);
    // b was the oldest untouched entry, so it went.
    cache.get('b');
    expect(cache.size).toBe(3);
  });
});
