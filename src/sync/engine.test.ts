import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { SyncEngine, type EngineDeps } from './engine';
import { envelope, ops, type OpEnvelope } from '../tree/ops';
import { serializeGedcom } from '../gedcom/serialize';
import { parseGedcom } from '../gedcom/parse';

const doc = readFileSync(new URL('../../fixtures/geneanet/input-fixture.ged', import.meta.url), 'utf8');

interface FakeServer {
  version: number;
  ops: Array<{ seq: number; envelope: OpEnvelope }>;
  doc: string;
  pageSize: number;
  fail?: number;
}

/** A tiny in-memory server and browser: enough to drive the engine through its cases. */
function harness(server: Partial<FakeServer> = {}) {
  const srv: FakeServer = { version: 0, ops: [], doc, pageSize: 500, ...server };
  const store = new Map<string, unknown>();
  let storageOk = true;
  const timers: Array<() => void> = [];
  const calls: string[] = [];
  const deps: EngineDeps = {
    api: {
      getTree: async (id) => {
        calls.push('getTree');
        return { id, name: 'T', version: srv.version, doc: srv.doc, people: 0, role: 'owner', updatedAt: 0 };
      },
      push: async (_id, baseVersion, batch) => {
        calls.push(`push@${baseVersion}:${batch.length}`);
        if (srv.fail) throw new ApiError(srv.fail, 'nope');
        if (baseVersion !== srv.version) {
          const missing = srv.ops.filter((o) => o.seq > baseVersion);
          throw new ApiError(409, 'stale base', {
            version: srv.version,
            ops: missing.slice(0, srv.pageSize),
            hasMore: missing.length > srv.pageSize,
          });
        }
        for (const e of batch) srv.ops.push({ seq: ++srv.version, envelope: e });
        return { version: srv.version, applied: batch.map((e) => e.id), rejected: [] };
      },
      pull: async (_id, since) => {
        calls.push(`pull@${since}`);
        if (srv.fail) throw new ApiError(srv.fail, 'nope');
        const missing = srv.ops.filter((o) => o.seq > since);
        return { version: srv.version, ops: missing.slice(0, srv.pageSize), hasMore: missing.length > srv.pageSize };
      },
    },
    kv: {
      get: async <T>(k: string) => store.get(k) as T | undefined,
      set: async (k, v) => {
        if (!storageOk) return false;
        store.set(k, v);
        return true;
      },
      delete: async (k) => void store.delete(k),
    },
    setTimeout: (fn) => timers.push(fn),
    clearTimeout: () => undefined,
    setInterval: () => 0,
    clearInterval: () => undefined,
    visible: () => true,
    persistStorage: async () => undefined,
    lock: async () => true,
  };
  return { srv, store, deps, calls, timers, breakStorage: () => (storageOk = false) };
}

const rename = (id: string, given: string) => envelope(ops.updatePerson(id, { names: [{ given, surname: 'LENOIR' }] }));
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('SyncEngine', () => {
  it('opens from the server, stores base and outbox separately, pushes after commit', async () => {
    const h = harness();
    const eng = new SyncEngine('T', false, h.deps);
    const events: string[] = [];
    eng.subscribe((e) => events.push(e.status));
    await eng.open();
    expect(h.store.has('cloud:T')).toBe(true);
    eng.commit(rename('I1', 'Margot'));
    await flush();
    expect((h.store.get('outbox:T') as OpEnvelope[]).length).toBe(1);
    expect(events.at(-1)).toBe('pending');
    // The debounced push fires.
    expect(h.timers.length).toBe(1);
    h.timers[0]!();
    await eng.sync();
    expect(h.srv.version).toBe(1);
    expect(eng.pending).toBe(0);
    expect(events.at(-1)).toBe('synced');
    expect(eng.current!.individuals.I1!.names[0]!.given).toBe('Margot');
  });

  it('rebases on a stale base and keeps the pending edit', async () => {
    const h = harness();
    const eng = new SyncEngine('T', false, h.deps);
    await eng.open();
    // Someone else edits on the server meanwhile.
    h.srv.ops.push({ seq: ++h.srv.version, envelope: rename('I2', 'Henri') });
    eng.commit(rename('I1', 'Margot'));
    await eng.sync();
    expect(h.srv.version).toBe(2);
    expect(eng.current!.individuals.I2!.names[0]!.given).toBe('Henri');
    expect(eng.current!.individuals.I1!.names[0]!.given).toBe('Margot');
    expect(h.calls.filter((c) => c.startsWith('push')).length).toBe(2);
  });

  it('pulls a long backlog page by page', async () => {
    const h = harness({ pageSize: 3 });
    const eng = new SyncEngine('T', false, h.deps);
    await eng.open();
    for (let i = 0; i < 8; i++) h.srv.ops.push({ seq: ++h.srv.version, envelope: rename('I1', `N${i}`) });
    await eng.sync();
    expect(eng.current!.individuals.I1!.names[0]!.given).toBe('N7');
    expect(h.calls.filter((c) => c.startsWith('pull')).length).toBe(3);
  });

  it('reloads the document when the server is behind (a restore), keeping pending edits', async () => {
    const h = harness({ version: 10 });
    const eng = new SyncEngine('T', false, h.deps);
    await eng.open();
    eng.commit(rename('I1', 'Margot'));
    // The server was restored to an older version with a different document.
    h.srv.version = 4;
    h.srv.doc = serializeGedcom(parseGedcom(doc));
    await eng.sync();
    expect(h.calls).toContain('getTree');
    expect(eng.current!.individuals.I1!.names[0]!.given).toBe('Margot');
    expect(h.srv.version).toBe(5);
  });

  it('names the failure: signed out, forbidden, gone, offline', async () => {
    for (const [code, status] of [
      [401, 'signedout'],
      [403, 'forbidden'],
      [404, 'gone'],
    ] as const) {
      const h = harness();
      const eng = new SyncEngine('T', false, h.deps);
      let last = '';
      eng.subscribe((e) => (last = e.status));
      await eng.open();
      h.srv.fail = code;
      await eng.sync();
      expect(last).toBe(status);
    }
  });

  it('says when the local copy cannot be written, and keeps working in memory', async () => {
    const h = harness();
    const eng = new SyncEngine('T', false, h.deps);
    let last = '';
    eng.subscribe((e) => (last = e.status));
    await eng.open();
    h.breakStorage();
    eng.commit(rename('I1', 'Margot'));
    await flush();
    expect(last).toBe('storage');
    expect(eng.current!.individuals.I1!.names[0]!.given).toBe('Margot');
  });

  it('is read-only when another tab holds the tree', async () => {
    const h = harness();
    h.deps.lock = async () => false;
    const eng = new SyncEngine('T', false, h.deps);
    let last = '';
    eng.subscribe((e) => (last = e.status));
    await eng.open();
    expect(last).toBe('locked');
    expect(() => eng.commit(rename('I1', 'X'))).toThrow(/locked/);
  });
});
