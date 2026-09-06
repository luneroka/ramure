import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../gedcom/parse';
import { layoutHourglass } from '../tree/layout';
import { computeHandles, detailBand, hitHandle, hitTest, type Camera } from './renderer';

const tree = parseGedcom(readFileSync(new URL('../../fixtures/geneanet/input-fixture.ged', import.meta.url), 'utf8'));
const layout = layoutHourglass(tree, 'I1');
const focus = layout.nodes.find((n) => n.id === 'I1')!;

/** Camera that puts the focus card centre at screen (400, 300) at zoom k. */
const camFor = (k: number): Camera => ({ k, x: 400 - (focus.x + focus.w / 2) * k, y: 300 - (focus.y + focus.h / 2) * k });

describe('handles', () => {
  it('exist only for the selected card', () => {
    expect(computeHandles(layout, tree, undefined)).toEqual([]);
    expect(computeHandles(layout, tree, 'nope')).toEqual([]);
    const hs = computeHandles(layout, tree, 'I1');
    expect(hs).toHaveLength(1);
    expect(hs[0]!.kind).toBe('plus');
    // Sits on the card's top-right corner.
    expect(hs[0]!.x + hs[0]!.w / 2).toBeGreaterThan(focus.x + focus.w - 10);
    expect(hs[0]!.y + hs[0]!.h / 2).toBeLessThan(focus.y + 12);
  });

  it('is hit at its screen position in the cards band, not in the names band', () => {
    const hs = computeHandles(layout, tree, 'I1');
    const h = hs[0]!;
    for (const k of [0.75, 1, 1.6]) {
      const cam = camFor(k);
      const sx = (h.x + h.w / 2) * k + cam.x, sy = (h.y + h.h / 2) * k + cam.y;
      expect(detailBand(k)).toBe('cards');
      expect(hitHandle(hs, cam, sx, sy)?.personId).toBe('I1');
      // The handle wins over the card underneath it, and the card is still hit next to it.
      expect(hitTest(layout, cam, 400, 300)?.id).toBe('I1');
    }
    const cam = camFor(0.5);
    const sx = (h.x + h.w / 2) * 0.5 + cam.x, sy = (h.y + h.h / 2) * 0.5 + cam.y;
    expect(hitHandle(hs, cam, sx, sy)).toBeUndefined();
  });

  it('accepts taps a few pixels off the circle', () => {
    const hs = computeHandles(layout, tree, 'I1');
    const h = hs[0]!;
    const cam = camFor(1);
    expect(hitHandle(hs, cam, h.x + cam.x - 3, h.y + cam.y - 3)).toBeDefined();
    expect(hitHandle(hs, cam, h.x + cam.x - 12, h.y + cam.y - 12)).toBeUndefined();
  });
});
