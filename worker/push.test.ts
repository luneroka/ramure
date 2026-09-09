import { describe, expect, it } from 'vitest';
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

describe('destructive record patches', () => {
  async function editorOn(treeId: string, accountId: string, ownerClient: Client): Promise<Client> {
    const inv = await ownerClient.call<{ link: string }>('POST', `/api/accounts/${accountId}/invites`, { role: 'member' });
    const token = new URL(inv.body.link).searchParams.get('invite') ?? new URL(inv.body.link).hash.replace(/^#invite=/, '');
    await invite('editor2@example.org');
    const e = new Client();
    await e.signIn('editor2@example.org');
    const accept = await e.call('POST', `/api/invites/${encodeURIComponent(token)}/accept`, {});
    expect(accept.status).toBe(200);
    return e;
  }

  it('snapshots before a patch that removes a few records, and stops an editor removing many', async () => {
    const { c, treeId, accountId } = await owner('o4@example.org');
    // A tree with 30 people, through ordinary ops.
    const adds = Array.from({ length: 28 }, (_, i) =>
      env(`add${i}`, { t: 'createPerson', id: `P${i}`, person: { given: `G${i}`, surname: 'X', sex: 'U' } }),
    );
    expect((await c.call('POST', `/api/trees/${treeId}/ops`, { baseVersion: 0, ops: adds })).status).toBe(200);
    const e = await editorOn(treeId, accountId, c);
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
});
