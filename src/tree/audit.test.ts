import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDate } from '../gedcom/dates';
import { parseGedcom } from '../gedcom/parse';
import { auditTree } from './audit';
import { blankEvent } from './edit';
import { applyOp, ops } from './ops';

const base = parseGedcom(readFileSync(new URL('../../fixtures/geneanet/input-fixture.ged', import.meta.url), 'utf8'));
const codes = (t: ReturnType<typeof parseGedcom>) => auditTree(t).map((n) => n.code);
const withEvents = (
  t: ReturnType<typeof parseGedcom>,
  id: string,
  events: Array<{ type: 'birth' | 'death' | 'baptism' | 'burial' | 'occupation'; date: string }>,
) => applyOp(t, ops.updatePerson(id, { events: events.map((e) => ({ ...blankEvent(e.type), date: parseDate(e.date) })) })).tree;

describe('auditTree', () => {
  it('reports the fixture as expected: unlinked duplicate, near-duplicate names, an old mother', () => {
    const notes = auditTree(base);
    expect(notes.some((n) => n.code === 'unlinked' && n.ids?.includes('I33'))).toBe(true);
    expect(notes.some((n) => n.code === 'possible-duplicate' && n.ids?.includes('I33'))).toBe(true);
    expect(notes.some((n) => n.code === 'parent-age' && n.ids?.includes('I22'))).toBe(true);
    expect(notes.every((n) => n.fixId)).toBe(true);
    expect(codes(base)).not.toContain('death-before-birth');
    expect(codes(base)).not.toContain('married-too-young');
  });

  it('clears after the fixes', () => {
    let tree = applyOp(base, ops.mergePeople('I14', 'I33')).tree;
    expect(codes(tree)).not.toContain('unlinked');
    tree = withEvents(tree, 'I13', [
      { type: 'birth', date: '1828' },
      { type: 'death', date: '1923' },
    ]);
    expect(auditTree(tree).some((n) => n.code === 'parent-age' && n.ids?.includes('I22'))).toBe(false);
  });

  it('catches impossible orders and lifespans', () => {
    expect(
      codes(
        withEvents(base, 'I5', [
          { type: 'birth', date: '1950' },
          { type: 'death', date: '1944' },
        ]),
      ),
    ).toContain('death-before-birth');
    expect(
      codes(
        withEvents(base, 'I5', [
          { type: 'birth', date: '10 MAY 1944' },
          { type: 'death', date: '9 MAY 1944' },
        ]),
      ),
    ).toContain('death-before-birth');
    expect(
      codes(
        withEvents(base, 'I5', [
          { type: 'birth', date: '1944' },
          { type: 'baptism', date: '1943' },
        ]),
      ),
    ).toContain('baptism-before-birth');
    expect(
      codes(
        withEvents(base, 'I5', [
          { type: 'death', date: '2000' },
          { type: 'burial', date: '1999' },
        ]),
      ),
    ).toContain('burial-before-death');
    expect(
      codes(
        withEvents(base, 'I5', [
          { type: 'birth', date: '1800' },
          { type: 'death', date: '1930' },
        ]),
      ),
    ).toContain('lifespan');
    expect(
      codes(
        withEvents(base, 'I5', [
          { type: 'birth', date: '1944' },
          { type: 'death', date: '2000' },
          { type: 'occupation', date: '2010' },
        ]),
      ),
    ).toContain('event-outside-life');
    expect(codes(withEvents(base, 'I5', []))).toContain('no-dates');
  });

  it('checks marriages and siblings', () => {
    expect(codes(withEvents(base, 'I2', [{ type: 'birth', date: '1932' }]))).toContain('married-too-young');
    expect(
      codes(
        withEvents(base, 'I2', [
          { type: 'birth', date: '1921' },
          { type: 'death', date: '1947' },
        ]),
      ),
    ).toContain('married-after-death');
    expect(codes(base)).not.toContain('siblings-too-close');
    expect(codes(withEvents(base, 'I7', [{ type: 'birth', date: '11 OCT 1955' }]))).toContain('siblings-too-close');
    expect(codes(withEvents(base, 'I24', [{ type: 'birth', date: '1900' }]))).toContain('spouse-gap');
  });
});
