import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../gedcom/parse';
import { addChild, addPartner } from './edit';
import { layoutEverything } from './layoutAll';

const tree = parseGedcom(readFileSync(new URL('../../fixtures/geneanet/input-fixture.ged', import.meta.url), 'utf8'));
const exported = parseGedcom(readFileSync(new URL('../../fixtures/geneanet/export-2026-09-06.ged', import.meta.url), 'utf8'));

function overlaps(a: { x: number; y: number; w: number; h: number }, b: typeof a): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe('layoutEverything', () => {
  for (const [name, t] of [
    ['input', tree],
    ['export', exported],
  ] as const) {
    it(`shows every person exactly once and never overlaps (${name})`, () => {
      const L = layoutEverything(t);
      const ids = L.nodes.map((n) => n.id).sort();
      expect(ids).toEqual(Object.keys(t.individuals).sort());
      for (let i = 0; i < L.nodes.length; i++)
        for (let j = i + 1; j < L.nodes.length; j++)
          expect(overlaps(L.nodes[i]!, L.nodes[j]!), `${L.nodes[i]!.id} vs ${L.nodes[j]!.id}`).toBe(false);
    });
  }

  it('puts partners on the same row and children one row below', () => {
    const L = layoutEverything(tree);
    const at = (id: string) => L.nodes.find((n) => n.id === id)!;
    expect(at('I1').y).toBe(at('I24').y); // Marguerite and Michel
    expect(at('I25').y).toBeGreaterThan(at('I1').y); // Claire below (y grows downward)
    expect(at('I2').y).toBe(at('I3').y); // Henri and Jeanne
    expect(at('I21').gen).toBeGreaterThan(at('I13').gen); // Jean above Jean-Baptiste
  });

  it('keeps the unlinked duplicate in its own component to the right', () => {
    const L = layoutEverything(tree);
    const rosalie = L.nodes.find((n) => n.id === 'I33')!;
    const maxMain = Math.max(...L.nodes.filter((n) => n.id !== 'I33').map((n) => n.x + n.w));
    expect(rosalie.x).toBeGreaterThan(maxMain);
  });

  it('labels rows from the oldest generation', () => {
    const L = layoutEverything(tree);
    expect(L.rowLabels?.get(L.rows[0]!)).toBe('G1');
    expect(L.rowLabels?.get(L.rows[L.rows.length - 1]!)).toBe(`G${L.rows.length}`);
  });

  it('survives trees built from scratch with multiple partners', () => {
    let r = addPartner(tree, 'I5', { given: 'A' });
    r = addChild(r.tree, 'I5', { given: 'B' });
    r = addPartner(r.tree, 'I5', { given: 'C' });
    const L = layoutEverything(r.tree);
    expect(L.nodes).toHaveLength(Object.keys(r.tree.individuals).length);
  });
});
