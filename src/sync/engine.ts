/**
 * Sync engine for one cloud tree: keeps the local copy (base + outbox) in
 * IndexedDB, pushes pending ops, pulls remote ones, and tells the app when
 * the working tree changed. Its dependencies are injected so it runs under
 * node in tests; the defaults are the real API, storage and timers.
 */

import { kvDelete, kvGet, kvSet } from '../db';
import { parseGedcom } from '../gedcom/parse';
import { serializeGedcom } from '../gedcom/serialize';
import type { Tree } from '../gedcom/model';
import type { OpEnvelope } from '../tree/ops';
import { api as realApi, ApiError } from './api';
import { absorb, acknowledge, enqueue, working, type RebaseResult, type SyncState } from './rebase';

export type SyncStatus =
  | 'synced'
  | 'pending'
  | 'syncing'
  | 'offline'
  | 'error'
  | 'readonly'
  /** The session expired: sign in again, the pending edits wait locally. */
  | 'signedout'
  /** The server refuses this user's writes (role changed). */
  | 'forbidden'
  /** The tree no longer exists on the server. */
  | 'gone'
  /** The local copy cannot be written: edits live only in memory. */
  | 'storage'
  /** Another tab holds this tree; this one is read-only. */
  | 'locked';

export interface EngineEvent {
  tree: Tree;
  status: SyncStatus;
  pending: number;
  /** Set when the change came from someone else, when pending edits were dropped, or when ours replaced someone else's. */
  notice?: { remote?: boolean; dropped?: Array<{ envelope: OpEnvelope; reason: string }>; overwrote?: string[] };
}

/** What the engine needs from the outside; swapped for fakes in tests. */
export interface EngineDeps {
  api: Pick<typeof realApi, 'getTree' | 'push' | 'pull'>;
  kv: {
    get<T>(key: string): Promise<T | undefined>;
    set(key: string, value: unknown): Promise<boolean>;
    delete(key: string): Promise<void>;
  };
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(id: number): void;
  setInterval(fn: () => void, ms: number): number;
  clearInterval(id: number): void;
  /** The page is visible (polling only then). */
  visible(): boolean;
  /** Ask the browser to keep our storage; no-op elsewhere. */
  persistStorage(): Promise<void>;
  /** Hold an exclusive lock for the tree; resolves false when another tab has it. Release by resolving `until`. */
  lock(name: string, until: Promise<void>): Promise<boolean>;
}

interface PersistedBase {
  schema: 2;
  version: number;
  baseGedcom: string;
}
/** The shape before pass 2, still read once. */
interface PersistedLegacy {
  version: number;
  baseGedcom: string;
  outbox: OpEnvelope[];
}

const PUSH_DEBOUNCE_MS = 600;
const PULL_INTERVAL_MS = 20_000;
/** The server accepts at most this many ops per push (D1 binds at most 100 parameters per statement). */
const MAX_PUSH = 50;

export const browserDeps = (): EngineDeps => ({
  api: realApi,
  kv: { get: kvGet, set: kvSet, delete: kvDelete },
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (id) => window.clearTimeout(id),
  setInterval: (fn, ms) => window.setInterval(fn, ms),
  clearInterval: (id) => window.clearInterval(id),
  visible: () => document.visibilityState === 'visible',
  persistStorage: async () => {
    try {
      await navigator.storage?.persist?.();
    } catch {
      /* not offered */
    }
  },
  lock: (name, until) =>
    new Promise((resolve) => {
      if (!navigator.locks) {
        resolve(true);
        return;
      }
      void navigator.locks.request(name, { ifAvailable: true }, async (lock) => {
        resolve(!!lock);
        if (lock) await until;
      });
    }),
});

/** Working trees are cached per state: the outbox is replayed once, not on every read. */
const workingCache = new WeakMap<SyncState, Tree>();
function workingOf(state: SyncState): Tree {
  let t = workingCache.get(state);
  if (!t) {
    t = working(state);
    workingCache.set(state, t);
  }
  return t;
}

export class SyncEngine {
  private state: SyncState | null = null;
  private status: SyncStatus = 'synced';
  private storageOk = true;
  private pushTimer = 0;
  private pullTimer = 0;
  private inFlight: Promise<void> | null = null;
  private listeners = new Set<(e: EngineEvent) => void>();
  private disposed = false;
  private lockedElsewhere = false;
  private release!: () => void;
  private released = new Promise<void>((r) => {
    this.release = r;
  });
  private persisting: Promise<void> = Promise.resolve();
  private deps: EngineDeps;

  constructor(
    public readonly treeId: string,
    public readonly readOnly: boolean,
    deps?: EngineDeps,
  ) {
    this.deps = deps ?? browserDeps();
  }

  subscribe(fn: (e: EngineEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get current(): Tree | null {
    return this.state ? workingOf(this.state) : null;
  }

  get pending(): number {
    return this.state?.outbox.length ?? 0;
  }

  /** True when edits are not accepted here: viewer role, or the tree is open in another tab. */
  get frozen(): boolean {
    return this.readOnly || this.lockedElsewhere;
  }

  /** Load the local copy if any, then fetch or refresh from the server. Returns the working tree. */
  async open(): Promise<Tree> {
    this.lockedElsewhere = !(await this.deps.lock(`ramure:tree:${this.treeId}`, this.released));
    void this.deps.persistStorage();
    const saved = await this.deps.kv.get<PersistedBase | PersistedLegacy>(this.baseKey());
    if (saved) {
      const outbox = 'schema' in saved ? ((await this.deps.kv.get<OpEnvelope[]>(this.outboxKey())) ?? []) : saved.outbox;
      this.state = { version: saved.version, base: parseGedcom(saved.baseGedcom), outbox };
      if (!('schema' in saved)) await this.persistAll();
      this.emit();
      void this.sync();
    } else {
      const remote = await this.deps.api.getTree(this.treeId);
      this.state = { version: remote.version, base: parseGedcom(remote.doc), outbox: [] };
      await this.persistAll();
      this.emit();
    }
    this.startPolling();
    return workingOf(this.state);
  }

  /** Apply a local edit and schedule a push once it is safely stored. Returns the new working tree. */
  commit(envelope: OpEnvelope): Tree {
    if (!this.state) throw new Error('not open');
    if (this.frozen) throw new Error(this.lockedElsewhere ? 'locked' : 'read only');
    this.state = enqueue(this.state, envelope);
    this.persistOutbox().then(() => this.schedulePush());
    this.emit();
    return workingOf(this.state);
  }

  /** Push now (if anything pending) then pull. */
  async sync(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.run().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  /** The server is not where we thought (a restore, a repair): rebuild the base from its document, keep our pending edits. */
  async reloadFromServer(): Promise<void> {
    if (!this.state) return;
    const remote = await this.deps.api.getTree(this.treeId);
    const outbox = this.state.outbox;
    const replay = absorb({ version: remote.version, base: parseGedcom(remote.doc), outbox }, [], remote.version);
    this.take({ ...replay, remoteChanges: true }, true);
  }

  dispose(): void {
    this.disposed = true;
    this.deps.clearTimeout(this.pushTimer);
    this.deps.clearInterval(this.pullTimer);
    this.release();
    this.listeners.clear();
  }

  /** Forget the local copy (after leaving or deleting the tree). */
  async forget(): Promise<void> {
    this.dispose();
    await this.deps.kv.delete(this.baseKey());
    await this.deps.kv.delete(this.outboxKey());
  }

  // ---------- internals ----------

  private baseKey(): string {
    return `cloud:${this.treeId}`;
  }
  private outboxKey(): string {
    return `outbox:${this.treeId}`;
  }

  private startPolling(): void {
    if (this.disposed) return;
    this.pullTimer = this.deps.setInterval(() => {
      if (this.deps.visible()) void this.sync();
    }, PULL_INTERVAL_MS);
  }

  private schedulePush(): void {
    if (this.disposed) return;
    this.deps.clearTimeout(this.pushTimer);
    this.pushTimer = this.deps.setTimeout(() => void this.sync(), PUSH_DEBOUNCE_MS);
  }

  /** Writes are queued so an older state never lands after a newer one. */
  private queueWrite(fn: () => Promise<boolean>): Promise<void> {
    this.persisting = this.persisting.then(async () => {
      const ok = await fn();
      if (ok !== this.storageOk) {
        this.storageOk = ok;
        this.emit();
      }
    });
    return this.persisting;
  }

  private persistOutbox(): Promise<void> {
    const state = this.state;
    if (!state) return Promise.resolve();
    return this.queueWrite(() => this.deps.kv.set(this.outboxKey(), state.outbox));
  }

  private persistAll(): Promise<void> {
    const state = this.state;
    if (!state) return Promise.resolve();
    return this.queueWrite(async () => {
      const a = await this.deps.kv.set(this.baseKey(), {
        schema: 2,
        version: state.version,
        baseGedcom: serializeGedcom(state.base),
      } satisfies PersistedBase);
      const b = await this.deps.kv.set(this.outboxKey(), state.outbox);
      return a && b;
    });
  }

  private emit(notice?: EngineEvent['notice']): void {
    if (!this.state || this.disposed) return;
    const status: SyncStatus = this.lockedElsewhere
      ? 'locked'
      : this.readOnly
        ? 'readonly'
        : !this.storageOk
          ? 'storage'
          : ['syncing', 'offline', 'error', 'signedout', 'forbidden', 'gone'].includes(this.status)
            ? this.status
            : this.state.outbox.length
              ? 'pending'
              : 'synced';
    const e: EngineEvent = { tree: workingOf(this.state), status, pending: this.state.outbox.length, notice };
    for (const fn of this.listeners) fn(e);
  }

  private take(result: RebaseResult, baseChanged = true): void {
    this.state = result.state;
    void (baseChanged ? this.persistAll() : this.persistOutbox());
    const notice =
      result.remoteChanges || result.dropped.length || result.overwrote.length
        ? { remote: result.remoteChanges, dropped: result.dropped, overwrote: result.overwrote }
        : undefined;
    this.emit(notice);
  }

  /** Pull every page the server has past our version. */
  private async pullAll(): Promise<void> {
    if (!this.state) return;
    for (let page = 0; page < 50; page++) {
      const res = await this.deps.api.pull(this.treeId, this.state.version);
      // A partial page only advances us to its last op; the server's version comes with the last page.
      const upTo = res.hasMore && res.ops.length ? res.ops[res.ops.length - 1]!.seq : res.version;
      const result = absorb(this.state, res.ops, upTo);
      if (result.needsReload) {
        await this.reloadFromServer();
        return;
      }
      if (res.ops.length || res.version !== this.state.version) this.take(result);
      if (!res.hasMore) return;
    }
  }

  private async run(): Promise<void> {
    if (!this.state || this.disposed) return;
    try {
      this.status = 'syncing';
      // Push, rebasing on 409 until the server accepts.
      for (let attempt = 0; attempt < 5 && this.state.outbox.length && !this.frozen; attempt++) {
        const batch = this.state.outbox.slice(0, MAX_PUSH);
        try {
          const res = await this.deps.api.push(this.treeId, this.state.version, batch);
          this.take(acknowledge(this.state, batch, res.applied, res.rejected, res.version));
        } catch (err) {
          if (err instanceof ApiError && err.status === 409) {
            const body = err.body as { version?: number; ops?: Array<{ seq: number; envelope: OpEnvelope }>; hasMore?: boolean };
            const ops = body.ops ?? [];
            const upTo = body.hasMore && ops.length ? ops[ops.length - 1]!.seq : Number(body.version);
            const result = absorb(this.state, ops, upTo);
            if (result.needsReload) await this.reloadFromServer();
            else {
              this.take(result);
              if (body.hasMore) await this.pullAll();
            }
            continue;
          }
          throw err;
        }
      }
      // Pull whatever is new, page by page.
      await this.pullAll();
      this.status = 'synced';
      this.emit();
    } catch (err) {
      this.status = !(err instanceof ApiError)
        ? 'offline'
        : err.status === 401
          ? 'signedout'
          : err.status === 403
            ? 'forbidden'
            : err.status === 404
              ? 'gone'
              : 'error';
      this.emit();
    }
  }
}
