import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../gedcom/parse';
import { applyOp, envelope, ops, opSubject, type Op } from './ops';

const base = parseGedcom(readFileSync(new URL('../../fixtures/geneanet/input-fixture.ged', import.meta.url), 'utf8'));

describe('ops', () => {
  it('replays identically: the same op on the same tree gives the same tree', () => {
    const op = ops.addChild('I1', { given: 'Paul' });
    const a = applyOp(base, op),
      b = applyOp(base, op);
    expect(JSON.stringify(a.tree)).toBe(JSON.stringify(b.tree));
    expect(a.focusId).toBe(op.t === 'addChild' ? op.childId : undefined);
  });

  it('survives a JSON round trip, as it will over the wire', () => {
    const op = ops.addParent('I33', 'father', { given: 'Louis' });
    const copy = JSON.parse(JSON.stringify(op)) as Op;
    expect(JSON.stringify(applyOp(base, copy).tree)).toBe(JSON.stringify(applyOp(base, op).tree));
  });

  it('applies a sequence and keeps subjects', () => {
    let tree = base;
    const partner = ops.addPartner('I5', { given: 'Anne', surname: 'DUVAL' });
    let r = applyOp(tree, partner);
    tree = r.tree;
    expect(opSubject(partner, r)).toBe((partner as { newPersonId: string }).newPersonId);
    const child = ops.addChild('I5', { given: 'Léo' });
    r = applyOp(tree, child);
    tree = r.tree;
    const cid = (child as { childId: string }).childId;
    expect(tree.individuals[cid]!.childOf[0]!.familyId).toBe((partner as { familyId: string }).familyId);
    r = applyOp(tree, ops.updatePerson(cid, { sex: 'M' }));
    tree = r.tree;
    expect(tree.individuals[cid]!.sex).toBe('M');
    r = applyOp(tree, ops.deletePerson(cid));
    tree = r.tree;
    expect(tree.individuals[cid]).toBeUndefined();
  });

  it('rejects ops that no longer make sense', () => {
    expect(() => applyOp(base, ops.updatePerson('nope', { sex: 'M' }))).toThrow(expect.objectContaining({ code: 'unknown_person' }));
    expect(() => applyOp(base, ops.linkChild('F5', 'I1'))).toThrow(expect.objectContaining({ code: 'cannot_be_own_child' }));
    const dup: Op = { t: 'createPerson', id: 'I1', data: {} };
    expect(() => applyOp(base, dup)).toThrow(expect.objectContaining({ code: 'duplicate_id' }));
  });

  it('wraps ops in envelopes with unique ids', () => {
    const a = envelope(ops.deletePerson('I33')),
      b = envelope(ops.deletePerson('I33'));
    expect(a.id).not.toBe(b.id);
    expect(a.ts).toBeGreaterThan(0);
  });
});
