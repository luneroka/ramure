import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../src/gedcom/parse';
import { planGraft } from '../src/tree/graft';
import { Client, invite } from './test/helpers';

const GED = '0 HEAD\n1 GEDC\n2 VERS 5.5.1\n0 @I1@ INDI\n1 NAME Anne /B/\n1 SEX F\n0 @I2@ INDI\n1 NAME Bob /C/\n1 SEX M\n0 TRLR';

async function owner(email = 'owner@example.org'): Promise<{ c: Client; treeId: string; accountId: string }> {
  await invite(email);
  const c = new Client();
  await c.signIn(email);
  const acc = await c.call<{ id: string }>('POST', '/api/accounts', { name: 'F' });
  const tree = await c.call<{ id: string }>('POST', '/api/trees', { accountId: acc.body.id, name: 'T', gedcom: GED });
  return { c, treeId: tree.body.id, accountId: acc.body.id };
}

const env = (id: string, op: unknown) => ({ id, ts: Date.now(), op });
const rename = (i: number, given: string) =>
  env(`op${i}${given}`, { t: 'updatePerson', id: 'I1', patch: { names: [{ given, surname: 'B' }] } });

describe('push limits and validation', () => {
  it('caps a push at 50 ops and refuses malformed envelopes', async () => {
    const { c, treeId } = await owner();
    const many = Array.from({ length: 51 }, (_, i) => rename(i, `N${i}`));
    expect((await c.call('POST', `/api/trees/${treeId}/ops`, { baseVersion: 0, ops: many })).status).toBe(413);
    const fifty = many.slice(0, 50);
    const ok = await c.call<{ version: number; applied: string[] }>('POST', `/api/trees/${treeId}/ops`, { baseVersion: 0, ops: fifty });
    expect(ok.status).toBe(200);
    expect(ok.body.version).toBe(50);
    expect(
      (await c.call('POST', `/api/trees/${treeId}/ops`, { baseVersion: 50, ops: [{ id: 'x y', ts: 1, op: { t: 'noop' } }] })).status,
    ).toBe(400);
    expect((await c.call('POST', `/api/trees/${treeId}/ops`, { baseVersion: 50, ops: [{ id: 'ok1', ts: 1, op: null }] })).status).toBe(400);
    expect((await c.call('POST', `/api/trees/${treeId}/ops`, { baseVersion: 'NaN', ops: [rename(99, 'Z')] })).status).toBe(400);
  });

  it('answers a stale base with the missing ops, and a retry with an already-known op is harmless', async () => {
    const { c, treeId } = await owner('o2@example.org');
    await c.call('POST', `/api/trees/${treeId}/ops`, { baseVersion: 0, ops: [rename(1, 'A')] });
    const stale = await c.call<{ version: number; ops: Array<{ seq: number }> }>('POST', `/api/trees/${treeId}/ops`, {
      baseVersion: 0,
      ops: [rename(2, 'B')],
    });
    expect(stale.status).toBe(409);
    expect(stale.body.version).toBe(1);
    expect(stale.body.ops.map((o) => o.seq)).toEqual([1]);
    const again = await c.call<{ applied: string[] }>('POST', `/api/trees/${treeId}/ops`, {
      baseVersion: 1,
      ops: [rename(1, 'A'), rename(3, 'C')],
    });
    expect(again.status).toBe(200);
    expect(again.body.applied).toEqual(['op3C']);
  });

  it('refuses a tree over the byte limit', async () => {
    const { c, accountId } = await owner('o3@example.org');
    const big = GED + '\n1 NOTE ' + 'é'.repeat(800_000);
    const res = await c.call<{ maxBytes: number }>('POST', '/api/trees', { accountId, name: 'Big', gedcom: big });
    expect(res.status).toBe(413);
    expect(res.body.maxBytes).toBe(1_500_000);
  });
});

async function editorOn(accountId: string, ownerClient: Client, email = 'editor2@example.org'): Promise<Client> {
  const inv = await ownerClient.call<{ link: string }>('POST', `/api/accounts/${accountId}/invites`, { email, role: 'member' });
  const token = decodeURIComponent(new URL(inv.body.link).hash.replace(/^#invite=/, ''));
  await invite(email);
  const e = new Client();
  await e.signIn(email);
  const accept = await e.call('POST', '/api/invites/accept', { token });
  expect(accept.status).toBe(200);
  return e;
}

describe('destructive record patches', () => {
  it('snapshots before a patch that removes a few records, and stops an editor removing many', async () => {
    const { c, treeId, accountId } = await owner('o4@example.org');
    // A tree with 30 people, through ordinary ops.
    const adds = Array.from({ length: 28 }, (_, i) =>
      env(`add${i}`, { t: 'createPerson', id: `P${i}`, person: { given: `G${i}`, surname: 'X', sex: 'U' } }),
    );
    expect((await c.call('POST', `/api/trees/${treeId}/ops`, { baseVersion: 0, ops: adds })).status).toBe(200);
    const e = await editorOn(accountId, c);
    const remove = (ids: string[], id: string) =>
      env(id, { t: 'patchRecords', individuals: Object.fromEntries(ids.map((x) => [x, null])), families: {}, media: {} });
    // Three removals: allowed for an editor, but a snapshot is taken first.
    const few = await e.call<{ version: number }>('POST', `/api/trees/${treeId}/ops`, {
      baseVersion: 28,
      ops: [remove(['P0', 'P1', 'P2'], 'rm3')],
    });
    expect(few.status).toBe(200);
    const snaps = await c.call<{ snapshots: Array<{ label: string | null }> }>('GET', `/api/trees/${treeId}/snapshots`);
    expect(snaps.body.snapshots.some((s) => s.label?.startsWith('Avant modification groupée'))).toBe(true);
    // Twenty removals: administrators only.
    const many = remove(
      Array.from({ length: 20 }, (_, i) => `P${i + 3}`),
      'rm20',
    );
    expect((await e.call('POST', `/api/trees/${treeId}/ops`, { baseVersion: 29, ops: [many] })).status).toBe(403);
    expect((await c.call('POST', `/api/trees/${treeId}/ops`, { baseVersion: 29, ops: [many] })).status).toBe(200);
  });

  it('refuses a batch nested past the cap instead of overflowing the stack', async () => {
    // Flattening and replaying both recurse. Fifty thousand levels used to answer 500 with a
    // RangeError; the same code runs in the browser, whose stack is smaller still.
    const { c, treeId } = await owner('deep@example.org');
    let deep: unknown = { t: 'createPerson', id: 'I9' };
    for (let i = 0; i < 50_000; i++) deep = { t: 'batch', ops: [deep] };
    const r = await c.call<{ code: string; max: number }>('POST', `/api/trees/${treeId}/ops`, {
      baseVersion: 0,
      ops: [env('deep1', deep)],
    });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('op_too_deep');
    expect(r.body.max).toBe(32);

    // A batch of the depth the interface actually builds still goes through.
    let shallow: unknown = { t: 'createPerson', id: 'I9' };
    for (let i = 0; i < 3; i++) shallow = { t: 'batch', ops: [shallow] };
    const ok = await c.call('POST', `/api/trees/${treeId}/ops`, { baseVersion: 0, ops: [env('shallow1', shallow)] });
    expect(ok.status).toBe(200);
  });
});

describe('completing a tree from a file', () => {
  const TREE = '0 HEAD\n1 GEDC\n2 VERS 5.5.1\n0 @I1@ INDI\n1 NAME Anne /B/\n1 SEX F\n1 BIRT\n2 DATE 1900\n0 TRLR';
  const FILE =
    '0 HEAD\n1 GEDC\n2 VERS 5.5.1\n0 @X1@ INDI\n1 NAME Anne /B/\n1 SEX F\n1 BIRT\n2 DATE 1900\n1 FAMS @XF@\n' +
    '0 @X2@ INDI\n1 NAME Carl /B/\n1 SEX M\n1 FAMC @XF@\n0 @XF@ FAM\n1 WIFE @X1@\n1 CHIL @X2@\n0 TRLR';

  async function treeOf(email: string): Promise<{ c: Client; treeId: string; accountId: string; doc: string }> {
    await invite(email);
    const c = new Client();
    await c.signIn(email);
    const acc = await c.call<{ id: string }>('POST', '/api/accounts', { name: 'F' });
    const tree = await c.call<{ id: string }>('POST', '/api/trees', { accountId: acc.body.id, name: 'T', gedcom: TREE });
    const got = await c.call<{ doc: string }>('GET', `/api/trees/${tree.body.id}`);
    return { c, treeId: tree.body.id, accountId: acc.body.id, doc: got.body.doc };
  }

  it('is for owners, and keeps the version it started from', async () => {
    const { c, treeId, accountId, doc } = await treeOf('graft-owner@example.org');
    const plan = planGraft(parseGedcom(doc), parseGedcom(FILE, { repairGeneWeb: true }), 'recherches.ged');
    expect(plan.added).toHaveLength(1);
    const graft = env('graft1', plan.op);

    const e = await editorOn(accountId, c, 'graft-editor@example.org');
    const refused = await e.call<{ code: string }>('POST', `/api/trees/${treeId}/ops`, { baseVersion: 0, ops: [graft] });
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe('import_is_for_owners');
    // Not even folded inside a batch.
    const hidden = await e.call('POST', `/api/trees/${treeId}/ops`, {
      baseVersion: 0,
      ops: [env('graft2', { t: 'batch', ops: [plan.op] })],
    });
    expect(hidden.status).toBe(403);

    const ok = await c.call<{ version: number; applied: string[] }>('POST', `/api/trees/${treeId}/ops`, { baseVersion: 0, ops: [graft] });
    expect(ok.status).toBe(200);
    expect(ok.body.applied).toEqual(['graft1']);
    const after = await c.call<{ people: number; doc: string }>('GET', `/api/trees/${treeId}`);
    expect(after.body.people).toBe(2);
    expect(after.body.doc).toContain('Carl');
    const snaps = await c.call<{ snapshots: Array<{ label: string | null; version: number }> }>('GET', `/api/trees/${treeId}/snapshots`);
    expect(snaps.body.snapshots.find((s) => s.label === 'Avant import de recherches.ged')?.version).toBe(0);
  });

  it('refuses a graft that would remove a record', async () => {
    const { c, treeId } = await treeOf('graft-removal@example.org');
    const removal = {
      t: 'graft',
      file: 'x.ged',
      individuals: { I1: null },
      families: {},
      sources: {},
      repositories: {},
      media: {},
      expect: {},
    };
    const r = await c.call<{ applied: string[]; rejected: Array<{ id: string }> }>('POST', `/api/trees/${treeId}/ops`, {
      baseVersion: 0,
      ops: [env('graft3', removal)],
    });
    expect(r.status).toBe(200);
    expect(r.body.applied).toEqual([]);
    expect(r.body.rejected.map((x) => x.id)).toEqual(['graft3']);
    expect((await c.call<{ people: number }>('GET', `/api/trees/${treeId}`)).body.people).toBe(1);
  });
});
