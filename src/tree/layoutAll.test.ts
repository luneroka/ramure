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

describe('child buses in the overview', () => {
  it('never lets two families share a horizontal bus segment in one row', () => {
    // Josephine Battaglia's union and Rina Benelli's parents sat on the same height with overlapping spans,
    // which read as one connection; buses that would cross now take different lanes.
    const L = layoutEverything(exported);
    const buses = L.links.filter((l) => l.kind === 'child' && l.points[0]![1] === l.points[1]![1]); // horizontal segments
    for (let i = 0; i < buses.length; i++)
      for (let j = i + 1; j < buses.length; j++) {
        const a = buses[i]!,
          b = buses[j]!;
        if (a.points[0]![1] !== b.points[0]![1]) continue;
        const [a0, a1] = [a.points[0]![0], a.points[1]![0]];
        const [b0, b1] = [b.points[0]![0], b.points[1]![0]];
        expect(a0 < b1 && b0 < a1, `two buses share a segment at y=${a.points[0]![1]}`).toBe(false);
      }
  });
});

describe('connector ownership', () => {
  it('tags every connector with its family so the selected person’s lines can be told apart', () => {
    const L = layoutEverything(tree);
    for (const l of L.links) expect(l.family, `${l.kind} link without a family`).toBeTruthy();
    expect(L.links.some((l) => l.family === 'F2')).toBe(true);
  });
});
