import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../gedcom/parse';
import { auditTree } from './audit';
import { applyOp, ops } from './ops';

const base = parseGedcom(readFileSync(new URL('../../fixtures/geneanet/input-fixture.ged', import.meta.url), 'utf8'));

describe('auditTree', () => {
  it('flags the unlinked duplicate and the too-old mother, and clears after the fixes', () => {
    const before = auditTree(base);
    expect(before.some((n) => n.code === 'unlinked' && n.ids?.includes('I33'))).toBe(true);
    expect(before.some((n) => n.code === 'parent-age' && n.ids?.includes('I22'))).toBe(true); // Perrine, 59 at Jean-Baptiste's birth
    let tree = applyOp(base, ops.mergePeople('I14', 'I33')).tree;
    expect(auditTree(tree).some((n) => n.code === 'unlinked')).toBe(false);
    tree = applyOp(
      tree,
      ops.updatePerson('I13', {
        events: base.individuals['I13']!.events.map((e) =>
          e.type === 'birth' ? { ...e, date: { raw: '1828', kind: 'exact', date: { calendar: 'gregorian', year: 1828 } } } : e,
        ),
      }),
    ).tree;
    expect(auditTree(tree).some((n) => n.code === 'parent-age' && n.ids?.includes('I22'))).toBe(false);
  });

  it('flags name duplicates with close births', () => {
    const added = applyOp(base, ops.addChild('I1', { given: 'Claire' })); // a second Claire AUBRY, undated vs 1976: not flagged
    expect(auditTree(added.tree).some((n) => n.code === 'possible-duplicate' && n.ids?.includes(added.focusId!))).toBe(false);
    // The fixture's deliberate duplicate differs only by an accent and a year: flagged.
    expect(auditTree(base).some((n) => n.code === 'possible-duplicate' && n.ids?.includes('I33'))).toBe(true);
    const two = applyOp(base, ops.updatePerson('I33', { names: [{ given: 'Rosalie', surname: 'GUÉRIN' }] })).tree; // now same name, 1862 vs ~1863
    expect(auditTree(two).some((n) => n.code === 'possible-duplicate' && n.ids?.includes('I33'))).toBe(true);
  });
});
