import { describe, expect, it } from 'vitest';
import { newTree } from './edit';
import { applyOp, ops } from './ops';
import { ahnentafel, depthOf, generationOf } from './ancestry';

describe('ahnentafel', () => {
  it('numbers the father 2n and the mother 2n+1, stopping at the requested generation', () => {
    let tree = newTree('Jean', 'Dupont', 'M').tree;
    const me = Object.keys(tree.individuals)[0]!;
    let r = applyOp(tree, ops.addParent(me, 'father'));
    tree = r.tree;
    const father = r.focusId!;
    r = applyOp(tree, ops.addParent(me, 'mother'));
    tree = r.tree;
    const mother = r.focusId!;
    r = applyOp(tree, ops.addParent(father, 'father'));
    tree = r.tree;
    const grandpa = r.focusId!;
    const table = ahnentafel(tree, me, 3);
    expect(table.get(1)?.id).toBe(me);
    expect(table.get(2)?.id).toBe(father);
    expect(table.get(3)?.id).toBe(mother);
    expect(table.get(4)?.id).toBe(grandpa);
    expect(table.get(5)).toBeUndefined();
    expect(depthOf(table)).toBe(3);
    expect(depthOf(ahnentafel(tree, me, 2))).toBe(2);
    expect(generationOf(1)).toBe(0);
    expect(generationOf(7)).toBe(2);
  });
});
