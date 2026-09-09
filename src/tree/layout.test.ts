import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../gedcom/parse';
import { DEFAULT_LAYOUT, generationLabel, layoutHourglass } from './layout';

const tree = parseGedcom(readFileSync(new URL('../../fixtures/geneanet/input-fixture.ged', import.meta.url), 'utf8'));

function overlaps(a: { x: number; y: number; w: number; h: number }, b: typeof a): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe('layoutHourglass', () => {
  const L = layoutHourglass(tree, 'I1');

  it('places the focus at the origin row with ancestors above and descendants below', () => {
    const focus = L.nodes.find((n) => n.id === 'I1')!;
    expect(focus.gen).toBe(0);
    expect(focus.role).toBe('focus');
    expect(L.nodes.filter((n) => n.gen > 0)).toHaveLength(16); // 2 + 4 + 8 + 2 ancestors
    expect(
      L.nodes
        .filter((n) => n.gen === 4)
        .map((n) => n.id)
        .sort(),
    ).toEqual(['I21', 'I22']); // Jean and Perrine
  });

  it('includes four generations up and all descendants with partners', () => {
    expect(Math.max(...L.nodes.map((n) => n.gen))).toBe(4);
    const ids = new Set(L.nodes.map((n) => n.id));
    for (const id of ['I21', 'I22', 'I24', 'I25', 'I26', 'I27', 'I28', 'I29', 'I30', 'I31', 'I32']) expect(ids.has(id)).toBe(true);
    // Michel (partner) sits to the right of Marguerite on the same row.
    const m = L.nodes.find((n) => n.id === 'I1')!,
      p = L.nodes.find((n) => n.id === 'I24')!;
    expect(p.y).toBe(m.y);
    expect(p.x).toBeGreaterThan(m.x);
  });

  it('never overlaps two cards', () => {
    for (let i = 0; i < L.nodes.length; i++)
      for (let j = i + 1; j < L.nodes.length; j++)
        expect(overlaps(L.nodes[i]!, L.nodes[j]!), `${L.nodes[i]!.id} vs ${L.nodes[j]!.id}`).toBe(false);
  });

  it('centres parents above their child', () => {
    const child = L.nodes.find((n) => n.id === 'I2')!; // Henri
    const f = L.nodes.find((n) => n.id === 'I9')!,
      m = L.nodes.find((n) => n.id === 'I10')!;
    const mid = (f.x + m.x + m.w) / 2;
    expect(Math.abs(mid - (child.x + child.w / 2))).toBeLessThan(1);
  });

  it('respects maxUp and reports truncation', () => {
    const short = layoutHourglass(tree, 'I1', { ...DEFAULT_LAYOUT, maxUp: 2 });
    expect(Math.max(...short.nodes.map((n) => n.gen))).toBe(2);
    expect(short.truncatedUp).toBe(true);
    expect(L.truncatedUp).toBe(false);
  });

  it('handles a focus with two marriages', () => {
    const H = layoutHourglass(tree, 'I2'); // Henri: Yvonne then Jeanne
    const row0 = H.nodes.filter((n) => n.gen === 0).map((n) => n.id);
    expect(row0[0]).toBe('I2');
    expect(row0).toContain('I4');
    expect(row0).toContain('I3');
    expect(H.nodes.filter((n) => n.gen === -1).map((n) => n.id)).toEqual(expect.arrayContaining(['I5', 'I8', 'I1', 'I6', 'I7']));
  });

  it('labels generations in both languages', () => {
    expect(generationLabel(3, 'fr')).toBe('Arrière-grands-parents');
    expect(generationLabel(-3, 'en')).toBe('Great-grandchildren');
    expect(generationLabel(4, 'en')).toBe('Great-great-grandparents');
    expect(generationLabel(5, 'en')).toBe('Great-(×3) grandparents');
    expect(generationLabel(4, 'fr')).toBe('Arrière-arrière-grands-parents');
  });
});

describe('connector ownership (hourglass)', () => {
  it('tags parent, partner and child connectors with their family', () => {
    const L = layoutHourglass(tree, 'I1');
    expect(L.links.length).toBeGreaterThan(0);
    for (const l of L.links) expect(l.family, `${l.kind} link without a family`).toBeTruthy();
    // Marguerite's own parents are family F2; the ancestors above carry their own families.
    expect(L.links.some((l) => l.kind === 'parent' && l.family === 'F2')).toBe(true);
    expect(L.links.some((l) => l.kind === 'parent' && l.family === 'F3')).toBe(true);
  });
});
