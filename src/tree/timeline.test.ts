import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../gedcom/parse';
import { buildTimeline } from './timeline';

const tree = parseGedcom(readFileSync(new URL('../../fixtures/geneanet/input-fixture.ged', import.meta.url), 'utf8'));

describe('buildTimeline', () => {
  const tl = buildTimeline(tree, 'fr', 2026);
  const bar = (id: string) => tl.groups.flatMap((g) => g.bars).find((b) => b.id === id)!;

  it('spans the tree, oldest generation first', () => {
    expect(tl.from).toBeLessThanOrEqual(1800);
    expect(tl.to).toBeGreaterThanOrEqual(2026);
    expect(tl.groups[0]!.gen).toBeGreaterThan(tl.groups[tl.groups.length - 1]!.gen);
    // Every generation keeps its people in birth order.
    for (const g of tl.groups)
      for (let i = 1; i < g.bars.length; i++) expect(g.bars[i]!.start).toBeGreaterThanOrEqual(g.bars[i - 1]!.start);
  });

  it('draws births, deaths, living people and marriages', () => {
    const henri = bar('I2');
    expect(henri.start).toBe(1921);
    expect(henri.end).toBe(1998);
    expect(henri.marriages.map((m) => m.year).sort()).toEqual([1943, 1948]);
    expect(henri.marriages.find((m) => m.year === 1943)?.spouseName).toBe('Yvonne KERGOAT');
    const marguerite = bar('I1');
    expect(marguerite.living).toBe(true);
    expect(marguerite.end).toBe(2026);
    expect(marguerite.openEnd).toBe(false);
  });

  it('estimates an end for the long dead without a death, and lists the undated apart', () => {
    const rosalie2 = bar('I33');
    expect(rosalie2.openEnd).toBe(true);
    expect(rosalie2.end).toBe(rosalie2.start + 80);
    expect(tl.undated.every((u) => !tl.groups.some((g) => g.bars.some((b) => b.id === u.id)))).toBe(true);
  });
});
