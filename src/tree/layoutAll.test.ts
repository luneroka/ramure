import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../gedcom/parse';
import { addChild, addPartner } from './edit';
import { DEFAULT_LAYOUT } from './layout';
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

/**
 * A tree of several lines marrying into one another over many generations, with second unions that bring
 * nobody else: a wife with no parents and no children in the file. Built from a seed so a failure replays.
 */
function intermarried(seed: number, generations: number, secondUnions: number): string {
  let s = seed;
  const random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const people: Array<{ id: string; sex: 'M' | 'F'; famc?: string; fams: string[] }> = [];
  const families: Array<{ id: string; husb: string; wife: string; children: string[] }> = [];
  const person = (sex: 'M' | 'F', famc?: string) => {
    const p = { id: `I${people.length + 1}`, sex, famc, fams: [] as string[] };
    people.push(p);
    return p;
  };
  const marry = (a: (typeof people)[number], b: (typeof people)[number]) => {
    const [husb, wife] = a.sex === 'M' ? [a, b] : [b, a];
    const f = { id: `F${families.length + 1}`, husb: husb.id, wife: wife.id, children: [] as string[] };
    families.push(f);
    husb.fams.push(f.id);
    wife.fams.push(f.id);
    return f;
  };
  const other = (p: (typeof people)[number]) => person(p.sex === 'M' ? 'F' : 'M');
  let couples = Array.from({ length: 4 }, () => marry(person('M'), person('F')));
  for (let g = 1; g < generations; g++) {
    const children = couples.flatMap((f) =>
      Array.from({ length: 1 + Math.floor(random() * 3) }, () => {
        const c = person(random() < 0.5 ? 'M' : 'F', f.id);
        f.children.push(c.id);
        return c;
      }),
    );
    const single = children.filter(() => random() < 0.8);
    const next: typeof couples = [];
    while (single.length) {
      const a = single.splice(Math.floor(random() * single.length), 1)[0]!;
      // Half the time a child of another family in the row: two lines joined by a marriage.
      const k = single.findIndex((b) => b.sex !== a.sex && b.famc !== a.famc);
      next.push(marry(a, k >= 0 && random() < 0.5 ? single.splice(k, 1)[0]! : other(a)));
    }
    couples = next.slice(0, 10);
  }
  const married = people.filter((p) => p.fams.length);
  for (let k = 0; k < secondUnions; k++) {
    const p = married[Math.floor(random() * married.length)]!;
    marry(p, other(p));
  }
  return [
    '0 HEAD',
    ...people.flatMap((p) => [
      `0 @${p.id}@ INDI`,
      `1 SEX ${p.sex}`,
      ...(p.famc ? [`1 FAMC @${p.famc}@`] : []),
      ...p.fams.map((f) => `1 FAMS @${f}@`),
    ]),
    ...families.flatMap((f) => [`0 @${f.id}@ FAM`, `1 HUSB @${f.husb}@`, `1 WIFE @${f.wife}@`, ...f.children.map((c) => `1 CHIL @${c}@`)]),
    '0 TRLR',
  ].join('\n');
}

describe('large intermarried trees', () => {
  it('keeps every partner beside the person they married, second unions included', () => {
    // A second wife with no parents and no children had nothing to place her by but where the last pass left
    // her, and each reordering pass pushed the rest of her row aside to make room: a 230-person tree came out
    // 75 000 px wide, torn in two along her partner line.
    const { cardW, partnerGap } = DEFAULT_LAYOUT;
    // Ten trees: seven of them caught the original tear, and each is now laid out several times over.
    for (let seed = 1; seed <= 10; seed++) {
      const t = parseGedcom(intermarried(seed, seed % 2 ? 9 : 11, 1 + (seed % 5)));
      const L = layoutEverything(t);
      const at = new Map(L.nodes.map((n) => [n.id, n]));
      for (const f of Object.values(t.families)) {
        const [h, w] = [at.get(f.husbandId!)!, at.get(f.wifeId!)!];
        const between = Math.abs(h.x - w.x) - cardW;
        // Beside, or one partner's width away when a third person married to one of them sits between.
        expect(between, `seed ${seed}: ${f.id} drawn ${Math.round(between)} px apart`).toBeLessThanOrEqual(cardW + 2 * partnerGap);
      }
    }
  });

  it('does not keep a bad arrangement just because the stored order led to it', () => {
    // The same 230 people came out 23 000 px wide from the order one tree stored them in and 15 000 px from
    // another's. In this tree the stored order settles with 155 000 px of sideways lines; another start finds
    // 121 000.
    const t = parseGedcom(intermarried(19, 9, 5));
    const L = layoutEverything(t);
    const x = new Map(L.nodes.map((n) => [n.id, n.x]));
    let sideways = 0;
    for (const f of Object.values(t.families)) {
      const [h, w] = [x.get(f.husbandId!)!, x.get(f.wifeId!)!];
      sideways += Math.abs(h - w);
      for (const c of f.childIds) sideways += Math.abs(x.get(c)! - (h + w) / 2);
    }
    expect(sideways).toBeLessThan(135_000);
  });

  it('seats someone married twice between the two partners', () => {
    const r = addPartner(tree, 'I1', { given: 'Second' });
    const second = Object.keys(r.tree.individuals).find((id) => !tree.individuals[id])!;
    const L = layoutEverything(r.tree);
    const x = (id: string) => L.nodes.find((n) => n.id === id)!.x;
    const [first, again] = [x('I24'), x(second)].sort((a, b) => a - b);
    expect(x('I1')).toBeGreaterThan(first!);
    expect(x('I1')).toBeLessThan(again!);
  });
});
