import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../gedcom/parse';
import { envelope, ops } from '../tree/ops';
import { absorb, acknowledge, enqueue, working, type SyncState } from './rebase';

const base = parseGedcom(readFileSync(new URL('../../fixtures/geneanet/input-fixture.ged', import.meta.url), 'utf8'));
const start: SyncState = { version: 0, base, outbox: [] };

describe('sync rebase', () => {
  it('shows local edits immediately and keeps them pending', () => {
    const e = envelope(ops.addChild('I1', { given: 'Paul' }));
    const s = enqueue(start, e);
    expect(Object.keys(working(s).individuals)).toHaveLength(34);
    expect(s.outbox).toHaveLength(1);
    expect(s.version).toBe(0);
  });

  it('absorbs a remote edit under a pending local edit', () => {
    const mine = envelope(ops.addChild('I1', { given: 'Paul' }));
    const theirs = envelope(ops.addChild('I25', { given: 'Zoé' }), 'U2');
    const s1 = enqueue(start, mine);
    const r = absorb(s1, [{ seq: 1, envelope: theirs }], 1);
    expect(r.remoteChanges).toBe(true);
    expect(r.state.version).toBe(1);
    expect(r.state.outbox.map((e) => e.id)).toEqual([mine.id]);
    expect(Object.keys(r.working.individuals)).toHaveLength(35);
    expect(r.dropped).toEqual([]);
  });

  it('drops a pending edit the remote change made impossible, and says so', () => {
    const mine = envelope(ops.updatePerson('I33', { sex: 'F' }));
    const theirs = envelope(ops.deletePerson('I33'), 'U2');
    const r = absorb(enqueue(start, mine), [{ seq: 1, envelope: theirs }], 1);
    expect(r.state.outbox).toEqual([]);
    expect(r.dropped).toHaveLength(1);
    expect(r.dropped[0]!.reason).toContain('unknown person');
    expect(r.working.individuals['I33']).toBeUndefined();
  });

  it('recognises its own ops coming back and does not double-apply', () => {
    const mine = envelope(ops.addChild('I1', { given: 'Paul' }));
    const s = enqueue(start, mine);
    const r = absorb(s, [{ seq: 1, envelope: mine }], 1);
    expect(r.remoteChanges).toBe(false);
    expect(r.state.outbox).toEqual([]);
    expect(Object.keys(r.working.individuals)).toHaveLength(34);
    expect(Object.keys(r.state.base.individuals)).toHaveLength(34);
  });

  it('acknowledges a push: applied ops move into the base, rejected ones are dropped', () => {
    const a = envelope(ops.addChild('I1', { given: 'Paul' }));
    const b = envelope(ops.updatePerson('nope', { sex: 'M' }));
    const c = envelope(ops.deletePerson('I33'));
    const s = enqueue(enqueue(enqueue(start, a), b), c);
    // Server applied a and c, rejected b, but c was not sent yet (e.g. size cap).
    const r = acknowledge(s, [a, b], [a.id], [{ id: b.id, reason: 'Unknown person nope' }], 1);
    expect(r.state.version).toBe(1);
    expect(r.state.outbox.map((e) => e.id)).toEqual([c.id]);
    expect(r.dropped.map((d) => d.envelope.id)).toEqual([b.id]);
    expect(Object.keys(r.state.base.individuals)).toHaveLength(34);
    expect(Object.keys(r.working.individuals)).toHaveLength(33);
  });

  it('is idempotent for a repeated pull', () => {
    const theirs = envelope(ops.addChild('I25', { given: 'Zoé' }), 'U2');
    const r1 = absorb(start, [{ seq: 1, envelope: theirs }], 1);
    const r2 = absorb(r1.state, [{ seq: 1, envelope: theirs }], 1);
    expect(Object.keys(r2.working.individuals)).toHaveLength(34);
    expect(r2.state.version).toBe(1);
  });
});

describe('absorb, pass 2', () => {
  it('reports the person whose remote save our pending save is about to replace', async () => {
    const { readFileSync } = await import('node:fs');
    const { parseGedcom } = await import('../gedcom/parse');
    const { ops, envelope } = await import('../tree/ops');
    const base = parseGedcom(readFileSync(new URL('../../fixtures/geneanet/input-fixture.ged', import.meta.url), 'utf8'));
    const ours = envelope(ops.updatePerson('I1', { names: [{ given: 'Marguerite', surname: 'LENOIR', nick: 'Margot' }] }));
    const theirs = envelope(ops.updatePerson('I1', { names: [{ given: 'Marguerite', surname: 'LENOIR', nick: 'Gogo' }] }));
    const state = { version: 0, base, outbox: [ours] };
    const r = absorb(state, [{ seq: 1, envelope: theirs }], 1);
    expect(r.remoteChanges).toBe(true);
    expect(r.overwrote).toEqual(['I1']);
    expect(r.state.outbox).toHaveLength(1);
    expect(r.working.individuals.I1!.names[0]!.nick).toBe('Margot');
  });

  it('asks for a reload when the server is behind us or answers nonsense', async () => {
    const { readFileSync } = await import('node:fs');
    const { parseGedcom } = await import('../gedcom/parse');
    const base = parseGedcom(readFileSync(new URL('../../fixtures/geneanet/input-fixture.ged', import.meta.url), 'utf8'));
    const state = { version: 12, base, outbox: [] };
    expect(absorb(state, [], 3).needsReload).toBe(true);
    expect(absorb(state, [], NaN).needsReload).toBe(true);
    expect(absorb(state, [], 12).needsReload).toBe(false);
  });
});
