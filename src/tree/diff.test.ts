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

describe('record patches, pass 2', () => {
  it('refuses to undo over a record someone else changed since', async () => {
    const { readFileSync } = await import('node:fs');
    const { parseGedcom } = await import('../gedcom/parse');
    const { applyOp, ops } = await import('./ops');
    const { EditError } = await import('./edit');
    const base = parseGedcom(readFileSync(new URL('../../fixtures/geneanet/input-fixture.ged', import.meta.url), 'utf8'));
    const after = applyOp(base, ops.updatePerson('I1', { names: [{ given: 'M', surname: 'LENOIR' }] })).tree;
    const undo = diffTrees(after, base);
    expect(undo.expect && Object.keys(undo.expect)).toEqual(['I:I1']);
    // Fine on the tree the undo was computed for.
    expect(applyRecordPatch(after, undo).individuals.I1!.names[0]!.given).toBe('Marguerite');
    // Refused once someone else touched the same person.
    const moved = applyOp(after, ops.updatePerson('I1', { sex: 'U' })).tree;
    expect(() => applyRecordPatch(moved, undo)).toThrow(EditError);
  });

  it('never leaves a family pointing at a person the patch removed', () => {
    const tree = {
      ...emptyTreeWith(),
    };
    const patched = applyRecordPatch(tree, { t: 'patchRecords', individuals: { C: null }, families: {}, media: {} });
    expect(patched.families.F!.childIds).toEqual([]);
    expect(patched.individuals.P!.partnerIn).toEqual(['F']);
  });

  it('ignores a patch key that would rewrite the table itself rather than a record', () => {
    // Built with JSON.parse, which is how an op actually arrives: `__proto__` in an object literal
    // sets the prototype and creates no own property, so a literal here would test nothing.
    // Parsed from the wire it *is* an own property, and `out[id] = value` then invokes the setter
    // and leaves the table with a prototype of the caller's choosing — after which a lookup for an
    // id that does not exist answers with a planted record.
    const tree = parseGedcom('0 HEAD\n1 GEDC\n2 VERS 5.5.1\n0 @I1@ INDI\n1 NAME Anne /B/\n0 TRLR');
    const hostile = JSON.parse(String.raw`{"t":"patchRecords","individuals":{"__proto__":{"id":"IX"}},"families":{},"media":{}}`);
    const patched = applyRecordPatch(tree, hostile);
    expect(Object.keys(patched.individuals)).toEqual(['I1']);
    expect(Object.getPrototypeOf(patched.individuals)).toBe(Object.prototype);
    // The phantom lookup the guard exists to prevent: any id at all used to answer with the plant.
    expect(patched.individuals['nobody-at-all']).toBeUndefined();
  });
});

function emptyTreeWith() {
  const P = {
    id: 'P',
    names: [{ given: 'P', surname: 'X' }],
    sex: 'M' as const,
    events: [],
    notes: [],
    citations: [],
    mediaIds: [],
    childOf: [],
    partnerIn: ['F'],
    leads: [],
    extra: [],
  };
  const C = { ...P, id: 'C', partnerIn: [], childOf: [{ familyId: 'F', pedigree: 'birth' as const }] };
  const F = {
    id: 'F',
    husbandId: 'P',
    childIds: ['C'],
    unionType: 'married' as const,
    events: [],
    notes: [],
    citations: [],
    mediaIds: [],
    extra: [],
  };
  return {
    header: { notes: [], language: 'French' },
    individuals: { P, C },
    families: { F },
    sources: {},
    repositories: {},
    media: {},
    extra: [],
    importNotes: [],
    resources: [],
    documentIds: [],
  };
}
