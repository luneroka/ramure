import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseGedcom } from '../gedcom/parse';
import { displayName } from '../gedcom/model';
import { A4, renderChart } from './charts';

const tree = parseGedcom(readFileSync(new URL('../../fixtures/geneanet/input-fixture.ged', import.meta.url), 'utf8'));
const root = Object.values(tree.individuals).find((i) => displayName(i) === 'Marguerite LENOIR')!;

describe('printable charts', () => {
  it('draws a fan sized to one A4 sheet with the root and her parents', () => {
    const c = renderChart(tree, root.id, {
      kind: 'fan',
      generations: 5,
      dates: true,
      orientation: 'portrait',
      title: 'Ascendance de Marguerite',
    });
    expect(c.width).toBe(A4.short);
    expect(c.height).toBe(A4.long);
    expect(c.svg).toContain('Ascendance de Marguerite');
    expect(c.svg).toContain('LENOIR');
    expect(c.svg.startsWith('<svg')).toBe(true);
    // 1 + 2 + 4 + 8 + 16 sectors, every one drawn (empty ones dashed).
    expect(c.svg.match(/<path /g)!.length).toBeGreaterThanOrEqual(31);
  });

  it('draws a landscape pedigree with one column per generation and escapes text', () => {
    const c = renderChart(tree, root.id, { kind: 'pedigree', generations: 4, dates: false, orientation: 'landscape', title: 'A & B <c>' });
    expect(c.width).toBe(A4.long);
    expect(c.svg.match(/<rect /g)!.length).toBe(1 + 15);
    expect(c.svg).toContain('A &amp; B &lt;c&gt;');
    expect(c.svg).not.toContain('<c>');
  });
});
