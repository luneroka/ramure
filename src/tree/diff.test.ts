import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../gedcom/parse';
import { applyRecordPatch, diffTrees, isEmptyPatch } from './diff';
import { applyOp, ops } from './ops';

/** Stable serialisation: record maps may change key order after a delete and restore, which is not a difference. */
const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, val) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : val,
  );

const base = parseGedcom(readFileSync(new URL('../../fixtures/geneanet/input-fixture.ged', import.meta.url), 'utf8'));

describe('diffTrees', () => {
  it('is empty for identical trees and lists only touched records', () => {
    expect(isEmptyPatch(diffTrees(base, base))).toBe(true);
    const after = applyOp(base, ops.addChild('I1', { given: 'Paul' })).tree;
    const p = diffTrees(base, after);
    expect(Object.keys(p.individuals)).toHaveLength(1); // the new child
    expect(Object.keys(p.families)).toEqual(['F5']); // the family that gained a child
    expect(Object.keys(p.media)).toHaveLength(0);
  });

  it('inverts any edit: undo then redo restores each state exactly', () => {
    for (const op of [
      ops.addChild('I1', { given: 'Paul' }),
      ops.deletePerson('I2'),
      ops.mergePeople('I14', 'I33'),
      ops.addParent('I33', 'father'),
      ops.updatePerson('I1', { sex: 'M', notes: ['x'] }),
    ]) {
      const after = applyOp(base, op).tree;
      const undo = diffTrees(after, base);
      const back = applyRecordPatch(after, undo);
      expect(stable(back)).toBe(stable(base));
      const redo = diffTrees(base, after);
      expect(stable(applyRecordPatch(back, redo))).toBe(stable(after));
    }
  });

  it('patchRecords is an op like any other', () => {
    const after = applyOp(base, ops.deletePerson('I33')).tree;
    const undo = diffTrees(after, base);
    const restored = applyOp(after, undo).tree;
    expect(restored.individuals['I33']).toBeDefined();
    expect(stable(applyOp(restored, JSON.parse(JSON.stringify(diffTrees(base, after)))).tree)).toBe(stable(after));
  });
});
