import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../gedcom/parse';
import { collectPlaces } from './places';
import { applyOp, ops } from './ops';

const tree = parseGedcom(readFileSync(new URL('../../fixtures/geneanet/input-fixture.ged', import.meta.url), 'utf8'));

describe('places', () => {
  it('indexes distinct places with their mentions, most cited first', () => {
    const places = collectPlaces(tree);
    expect(places.length).toBeGreaterThan(5);
    expect(places[0]!.mentions.length).toBeGreaterThanOrEqual(places[1]!.mentions.length);
    const quimper = places.find((p) => p.text.startsWith('Quimper'))!;
    expect(quimper.text).toBe('Quimper, Finistère, Bretagne, France');
    expect(quimper.mentions.some((m) => m.personId === 'I1' && m.type === 'birth' && m.year === 1952)).toBe(true);
    // A marriage place is a mention for both spouses.
    expect(
      quimper.mentions
        .filter((m) => m.type === 'marriage' && m.familyId === 'F2')
        .map((m) => m.personId)
        .sort(),
    ).toEqual(['I2', 'I3']);
    // Coordinates from the import survive.
    expect(quimper.lat).toBeCloseTo(47.996, 2);
  });

  it('writes coordinates into every matching event, accent-insensitively, and only touches those records', () => {
    const before = tree;
    const after = applyOp(before, ops.geocodePlaces([{ text: 'brest, finistere, bretagne, france', lat: 48.39, lon: -4.49 }])).tree;
    const brest = collectPlaces(after).find((p) => p.text.startsWith('Brest'))!;
    expect(brest.lat).toBe(48.39);
    expect(after.individuals.I2).not.toBe(before.individuals.I2);
    expect(after.individuals.I15).toBe(before.individuals.I15);
    // Idempotent: a second pass changes nothing.
    const again = applyOp(after, ops.geocodePlaces([{ text: 'Brest, Finistère, Bretagne, France', lat: 48.39, lon: -4.49 }])).tree;
    expect(again).toBe(after);
  });
});
