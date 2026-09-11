import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseGedcom } from '@/gedcom/parse';
import { MAX_SHEETS, renderPoster, sheetPlan, type PosterOptions } from './poster';

const tree = parseGedcom(readFileSync(new URL('../../fixtures/geneanet/input-fixture.ged', import.meta.url), 'utf8'));
const everyone = Object.keys(tree.individuals);

const opts = (over: Partial<PosterOptions> = {}): PosterOptions => ({
  page: 'a4',
  orientation: 'landscape',
  dates: true,
  title: 'Famille Lenoir',
  fit: 'readable',
  ...over,
});

const idsOn = (svg: string) => [...svg.matchAll(/data-id="([^"]+)"/g)].map((m) => m[1]!);

describe('the whole-tree poster', () => {
  it('draws every person in the file, which is the whole point of it', () => {
    const p = renderPoster(tree, opts());
    const drawn = new Set(p.sheets.flatMap(idsOn));
    expect([...drawn].sort()).toEqual([...everyone].sort());
    // The fan chart of the same tree reaches 21 of these at its very best.
    expect(drawn.size).toBe(33);
    expect(p.people).toBe(33);
  });

  it('fits on one sheet when asked, and spreads to be read when asked instead', () => {
    const one = renderPoster(tree, opts({ fit: 'one' }));
    const readable = renderPoster(tree, opts({ fit: 'readable' }));
    expect(one.sheets).toHaveLength(1);
    expect(readable.sheets.length).toBeGreaterThan(1);
    expect(readable.scale).toBeGreaterThan(one.scale);
    expect(readable.sheets).toHaveLength(readable.cols * readable.rows);
  });

  it('puts on each sheet only what crosses it', () => {
    const p = renderPoster(tree, opts());
    const first = new Set(idsOn(p.sheets[0]!));
    const last = new Set(idsOn(p.sheets[p.sheets.length - 1]!));
    // Cards on a seam belong to both sheets; nobody may be on every sheet, or nothing was culled.
    expect([...first].some((id) => !last.has(id))).toBe(true);
    expect([...last].some((id) => !first.has(id))).toBe(true);
  });

  it('numbers the sheets, and says nothing about numbering when there is one', () => {
    const many = renderPoster(tree, opts());
    expect(many.sheets[0]).toContain(`1 / ${many.sheets.length}`);
    expect(many.sheets[many.sheets.length - 1]).toContain(`${many.sheets.length} / ${many.sheets.length}`);
    const alone = renderPoster(tree, opts({ fit: 'one' }));
    expect(alone.sheets[0]).not.toMatch(/\d+ \/ \d+/);
    expect(alone.sheets[0]).toContain('Famille Lenoir');
  });

  it('escapes what it writes', () => {
    const p = renderPoster(tree, opts({ title: 'A & B <c>' }));
    expect(p.sheets[0]).toContain('A &amp; B &lt;c&gt;');
    expect(p.sheets[0]).not.toContain('<c>');
  });
});

describe('how many sheets a drawing is worth', () => {
  const A4 = { w: 1047, h: 730 };

  it('gives a small tree one sheet whichever way it is asked', () => {
    expect(sheetPlan(900, 600, A4.w, A4.h, 'one')).toMatchObject({ cols: 1, rows: 1, capped: false });
    expect(sheetPlan(900, 600, A4.w, A4.h, 'readable')).toMatchObject({ cols: 1, rows: 1, capped: false });
  });

  it('spends sheets for a wall chart, and keeps the scale it was asked for', () => {
    const plan = sheetPlan(12000, 4000, A4.w, A4.h, 'readable');
    expect(plan.scale).toBeCloseTo(0.6, 5);
    expect(plan.cols * plan.rows).toBeGreaterThan(10);
    expect(plan.capped).toBe(false);
  });

  it('shrinks rather than hand over a ream', () => {
    const plan = sheetPlan(90000, 40000, A4.w, A4.h, 'readable');
    expect(plan.capped).toBe(true);
    expect(plan.cols * plan.rows).toBeLessThanOrEqual(MAX_SHEETS);
    expect(plan.scale).toBeLessThan(0.6);
  });

  it('never goes below what one sheet would take, even then', () => {
    const onOne = sheetPlan(90000, 40000, A4.w, A4.h, 'one');
    const capped = sheetPlan(90000, 40000, A4.w, A4.h, 'readable');
    expect(capped.scale).toBeGreaterThanOrEqual(onOne.scale);
  });
});
