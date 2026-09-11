import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseGedcom } from '@/gedcom/parse';
import { displayName, type Individual } from '@/gedcom/model';
import { PAGES, renderChart, type ChartOptions } from './charts';

const tree = parseGedcom(readFileSync(new URL('../../fixtures/geneanet/input-fixture.ged', import.meta.url), 'utf8'));
const person = (name: string): Individual => Object.values(tree.individuals).find((i) => displayName(i) === name)!;
const root = person('Marguerite LENOIR');

const opts = (over: Partial<ChartOptions> = {}): ChartOptions => ({
  kind: 'fan',
  generations: 5,
  dates: true,
  orientation: 'portrait',
  page: 'a4',
  sweep: 180,
  empties: true,
  title: 'Ascendance de Marguerite',
  ...over,
});

/** The box the drawing actually occupies, read back from the sector corners and the centre disc. */
function bounds(svg: string) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const m of svg.matchAll(/ d="([^"]+)"/g)) {
    for (const cmd of m[1]!.matchAll(/([MLA])\s+([-\d.\s]+)/g)) {
      const nums = cmd[2]!.trim().split(/\s+/).map(Number);
      const pts = cmd[1] === 'A' ? nums.slice(5) : nums;
      for (let i = 0; i + 1 < pts.length; i += 2) {
        xs.push(pts[i]!);
        ys.push(pts[i + 1]!);
      }
    }
  }
  for (const m of svg.matchAll(/<circle cx="([-\d.]+)" cy="([-\d.]+)" r="([-\d.]+)"/g)) {
    const [cx, cy, r] = [Number(m[1]), Number(m[2]), Number(m[3])];
    xs.push(cx - r, cx + r);
    ys.push(cy - r, cy + r);
  }
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

describe('the fan fills the sheet', () => {
  it('spans the full width of the page and sits centred down it', () => {
    const c = renderChart(tree, root.id, opts({ sweep: 180 }));
    const b = bounds(c.svg);
    expect(c.width).toBe(PAGES.a4.short);
    expect(b.x1 - b.x0).toBeGreaterThan(c.width - 2 * 38 - 1);
    // The old fan hung from the top of the sheet; a half fan on a portrait page now sits in the middle of it.
    const above = b.y0 - 68; // the margin plus the title line
    const below = c.height - 38 - b.y1;
    expect(Math.abs(above - below)).toBeLessThan(2);
  });

  // A half fan is twice as wide as it is tall, a three-quarter one a little wider than square, a full one square.
  it.each([
    [180, 2],
    [270, 1.172],
    [360, 1],
  ])('keeps a %i° sweep in proportion and inside the margins', (sweep, ratio) => {
    const c = renderChart(tree, root.id, opts({ sweep: sweep as 180 | 270 | 360, orientation: 'landscape' }));
    const b = bounds(c.svg);
    expect((b.x1 - b.x0) / (b.y1 - b.y0)).toBeCloseTo(ratio, 1);
    expect(b.x0).toBeGreaterThanOrEqual(37);
    expect(b.x1).toBeLessThanOrEqual(c.width - 37);
    expect(b.y0).toBeGreaterThanOrEqual(37);
    expect(b.y1).toBeLessThanOrEqual(c.height - 37);
  });

  it('uses more of a portrait sheet when the rings run all the way round', () => {
    const half = bounds(renderChart(tree, root.id, opts({ sweep: 180 })).svg);
    const full = bounds(renderChart(tree, root.id, opts({ sweep: 360 })).svg);
    expect(full.y1 - full.y0).toBeGreaterThan(2 * (half.y1 - half.y0) - 1);
  });

  it('puts the subject in a full disc only when the fan closes', () => {
    expect(renderChart(tree, root.id, opts({ sweep: 360 })).svg).toContain('<circle');
    expect(renderChart(tree, root.id, opts({ sweep: 180 })).svg).not.toContain('<circle');
  });
});

describe('what the chart says it drew', () => {
  it('stops at the last generation anyone is known in', () => {
    // Jeanne's line stops at her grandparents: three generations, whatever the chart is asked for.
    const c = renderChart(tree, person('Jeanne MARCHAL').id, opts({ generations: 8 }));
    expect(c.generations).toBe(3);
    // One path for the subject, then a ring of two, and no empty ring beyond the last known ancestor.
    expect(c.svg.match(/<path /g)!.length).toBe(2 ** c.generations - 1);
  });

  it('counts the people it drew, not the ones it left out', () => {
    const four = renderChart(tree, root.id, opts({ generations: 4 }));
    const six = renderChart(tree, root.id, opts({ generations: 6, page: 'a3' }));
    expect(four.people).toBe(15); // the fixture knows every one of Marguerite's four generations
    expect(six.people).toBe(17);
    expect(six.people).toBeLessThan(Object.keys(tree.individuals).length);
  });

  it('reports the generations the paper could take, which is fewer than asked on a small sheet', () => {
    const deep = person('Léa FERRAND'); // seven generations are known behind her
    const a4 = renderChart(tree, deep.id, opts({ kind: 'pedigree', generations: 8 }));
    const a3 = renderChart(tree, deep.id, opts({ kind: 'pedigree', generations: 8, page: 'a3' }));
    expect(a4.generations).toBeLessThan(7);
    expect(a3.generations).toBeGreaterThan(a4.generations);
  });

  it('leaves out the unknown ancestors when asked to', () => {
    const shown = renderChart(tree, root.id, opts({ empties: true }));
    const hidden = renderChart(tree, root.id, opts({ empties: false }));
    expect(shown.svg).toContain('stroke-dasharray');
    expect(hidden.svg).not.toContain('stroke-dasharray');
    expect(hidden.people).toBe(shown.people);
  });
});

describe('what a sector can hold', () => {
  it('writes the whole name where there is room and cuts it where there is not', () => {
    const c = renderChart(tree, root.id, opts({ generations: 6, sweep: 180, orientation: 'landscape' }));
    expect(c.svg).toContain('LENOIR');
    const sizes = [...c.svg.matchAll(/font-size="([\d.]+)"/g)].map((m) => Number(m[1]));
    // Nothing is set below the size that survives a printer, and the inner rings stay comfortable.
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(6);
    expect(Math.max(...sizes)).toBeGreaterThanOrEqual(10);
  });

  it('escapes what it writes', () => {
    const c = renderChart(tree, root.id, opts({ kind: 'pedigree', generations: 4, dates: false, title: 'A & B <c>' }));
    expect(c.svg).toContain('A &amp; B &lt;c&gt;');
    expect(c.svg).not.toContain('<c>');
  });

  it('gives the drawing the title line only when there is a title', () => {
    const titled = bounds(renderChart(tree, root.id, opts({ sweep: 360, orientation: 'landscape' })).svg);
    const bare = bounds(renderChart(tree, root.id, opts({ sweep: 360, orientation: 'landscape', title: '' })).svg);
    expect(bare.y1 - bare.y0).toBeGreaterThan(titled.y1 - titled.y0);
  });
});
