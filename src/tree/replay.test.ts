import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../gedcom/parse';
import { envelope, ops } from './ops';
import { replayOps } from './replay';

const base = parseGedcom(readFileSync(new URL('../../fixtures/geneanet/input-fixture.ged', import.meta.url), 'utf8'));

describe('replayOps', () => {
  it('applies what it can and reports the rest', () => {
    const child = ops.addChild('I1', { given: 'Paul' });
    const list = [envelope(child), envelope(ops.updatePerson('nope', { sex: 'M' })), envelope(ops.deletePerson('I33'))];
    const r = replayOps(base, list);
    expect(r.applied).toHaveLength(2);
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0]!.reason).toContain('Unknown person');
    expect(Object.keys(r.tree.individuals)).toHaveLength(Object.keys(base.individuals).length); // +1 child, -1 Rosalie
  });

  it('is deterministic: two devices replaying the same log agree', () => {
    const list = [envelope(ops.addPartner('I5', { given: 'Anne' })), envelope(ops.addChild('I5', { given: 'Léo' }))];
    const a = replayOps(base, list).tree,
      b = replayOps(base, JSON.parse(JSON.stringify(list))).tree;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
