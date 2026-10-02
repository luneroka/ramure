import { describe, expect, it } from 'vitest';
import { FIT_SCALES, fitScale, heightOf, packPages, type MeasuredBlock } from './pack';

const block = (height: number, lead = 0, keepWithNext = false): MeasuredBlock => ({ height, lead, keepWithNext });

describe('packing the person sheet into pages', () => {
  it('keeps everything on one page when it fits', () => {
    expect(packPages([block(40), block(30, 4), block(20, 4)], 100)).toEqual([[0, 1, 2]]);
  });

  it('starts a new page when the next block would run past the room', () => {
    expect(packPages([block(60), block(30, 4), block(30, 4)], 100)).toEqual([[0, 1], [2]]);
  });

  it('never leaves a section title at the foot of a page', () => {
    // The title (keepWithNext) fits, but the row it introduces does not: both move over.
    const pages = packPages([block(80), block(10, 6, true), block(20, 2)], 100);
    expect(pages).toEqual([[0], [1, 2]]);
  });

  it('keeps a whole chain together: a title, a union header and its first child', () => {
    const pages = packPages([block(70), block(8, 6, true), block(12, 3, true), block(15, 1), block(15, 1)], 100);
    expect(pages).toEqual([[0], [1, 2, 3, 4]]);
  });

  it('does not count the space above a block that opens a page', () => {
    // 60 + 45 runs over; on the new page the 45 costs 45 - 10, so the next 60 still fits beside it.
    expect(packPages([block(60), block(45, 10), block(60, 5)], 100)).toEqual([[0], [1, 2]]);
  });

  it('gives a block taller than a page a page of its own instead of stopping', () => {
    expect(packPages([block(30), block(250, 4), block(30, 4)], 100)).toEqual([[0], [1], [2]]);
  });

  it('packs nothing into no pages', () => {
    expect(packPages([], 100)).toEqual([]);
  });
});

describe('fitting the sheet on one page', () => {
  it('measures the height a page pays for', () => {
    expect(heightOf([block(40, 5), block(30, 4)])).toBe(65);
    expect(heightOf([])).toBe(0);
  });

  it('keeps the full size when the sheet already fits', () => {
    expect(fitScale(() => [block(90)], 100)).toBe(1);
  });

  it('takes the largest smaller size that fits, never below the last step', () => {
    // The sheet shrinks with its text: at 0.9 it is 99, which fits.
    const measure = (scale: number) => [block(110 * scale)];
    expect(fitScale(measure, 100)).toBe(0.9);
    expect(FIT_SCALES[FIT_SCALES.length - 1]).toBe(0.85);
  });

  it('gives up when even the smallest size runs over, so a second page is taken', () => {
    expect(fitScale((scale) => [block(200 * scale)], 100)).toBeNull();
  });
});
