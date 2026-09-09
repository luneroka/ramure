/**
 * Sync engine for one cloud tree: keeps the local copy (base + outbox) in
 * IndexedDB, pushes pending ops, pulls remote ones, and tells the app when
 * the working tree changed.
 */

import { kvDelete, kvGet, kvSet } from '../db';
import { parseGedcom } from '../gedcom/parse';
import { serializeGedcom } from '../gedcom/serialize';
import type { Tree } from '../gedcom/model';
import type { OpEnvelope } from '../tree/ops';
import { api, ApiError } from './api';
import { absorb, acknowledge, enqueue, working, type RebaseResult, type SyncState } from './rebase';

export type SyncStatus = 'synced' | 'pending' | 'syncing' | 'offline' | 'error' | 'readonly';

export interface EngineEvent {
  tree: Tree;
  status: SyncStatus;
  pending: number;
  /** Set when the change came from someone else, or when pending edits were dropped. */
  notice?: { remote?: boolean; dropped?: Array<{ envelope: OpEnvelope; reason: string }> };
}

interface Persisted {
  version: number;
  baseGedcom: string;
  outbox: OpEnvelope[];
}

const PUSH_DEBOUNCE_MS = 600;
const PULL_INTERVAL_MS = 20_000;
/** The server accepts at most this many ops per push (D1 binds at most 100 parameters per statement). */
const MAX_PUSH = 50;

export class SyncEngine {
  private state: SyncState | null = null;
  private status: SyncStatus = 'synced';
  private pushTimer = 0;
  private pullTimer = 0;
  private inFlight: Promise<void> | null = null;
  private listeners = new Set<(e: EngineEvent) => void>();
  private disposed = false;

  constructor(
    public readonly treeId: string,
    public readonly readOnly: boolean,
  ) {}

  subscribe(fn: (e: EngineEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get current(): Tree | null {
    return this.state ? working(this.state) : null;
  }

  get pending(): number {
    return this.state?.outbox.length ?? 0;
  }

  /** Load the local copy if any, then fetch or refresh from the server. Returns the working tree. */
  async open(): Promise<Tree> {
    const saved = await kvGet<Persisted>(this.key());
    if (saved) {
      this.state = { version: saved.version, base: parseGedcom(saved.baseGedcom), outbox: saved.outbox };
      this.emit();
      void this.sync();
    } else {
      const remote = await api.getTree(this.treeId);
      this.state = { version: remote.version, base: parseGedcom(remote.doc), outbox: [] };
      await this.persist();
      this.emit();
    }
    this.startPolling();
    return working(this.state);
  }

  /** Apply a local edit and schedule a push. Returns the new working tree. */
  commit(envelope: OpEnvelope): Tree {
    if (!this.state) throw new Error('not open');
    if (this.readOnly) throw new Error('read only');
    this.state = enqueue(this.state, envelope);
    void this.persist();
    this.schedulePush();
    this.emit();
    return working(this.state);
  }

  /** Push now (if anything pending) then pull. */
  async sync(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.run().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  dispose(): void {
    this.disposed = true;
    window.clearTimeout(this.pushTimer);
    window.clearInterval(this.pullTimer);
    document.removeEventListener('visibilitychange', this.onVisible);
    window.removeEventListener('online', this.onVisible);
    this.listeners.clear();
  }

  /** Forget the local copy (after leaving or deleting the tree). */
  async forget(): Promise<void> {
    this.dispose();
    await kvDelete(this.key());
  }

  // ---------- internals ----------

  private key(): string {
    return `cloud:${this.treeId}`;
  }

  private onVisible = () => {
    if (document.visibilityState === 'visible') void this.sync();
  };

  private startPolling(): void {
    this.pullTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void this.sync();
    }, PULL_INTERVAL_MS);
    document.addEventListener('visibilitychange', this.onVisible);
    window.addEventListener('online', this.onVisible);
  }

  private schedulePush(): void {
    window.clearTimeout(this.pushTimer);
    this.pushTimer = window.setTimeout(() => void this.sync(), PUSH_DEBOUNCE_MS);
  }

  private async persist(): Promise<void> {
    if (!this.state) return;
    await kvSet(this.key(), {
      version: this.state.version,
      baseGedcom: serializeGedcom(this.state.base),
      outbox: this.state.outbox,
    } satisfies Persisted);
  }

  private emit(notice?: EngineEvent['notice']): void {
    if (!this.state || this.disposed) return;
    const status: SyncStatus = this.readOnly
      ? 'readonly'
      : this.status === 'syncing' || this.status === 'offline' || this.status === 'error'
        ? this.status
        : this.state.outbox.length
          ? 'pending'
          : 'synced';
    const e: EngineEvent = { tree: working(this.state), status, pending: this.state.outbox.length, notice };
    for (const fn of this.listeners) fn(e);
  }

  private take(result: RebaseResult): void {
    this.state = result.state;
    void this.persist();
    const notice = result.remoteChanges || result.dropped.length ? { remote: result.remoteChanges, dropped: result.dropped } : undefined;
    this.emit(notice);
  }

  private async run(): Promise<void> {
    if (!this.state || this.disposed) return;
    try {
      this.status = 'syncing';
      // Push, rebasing on 409 until the server accepts.
      for (let attempt = 0; attempt < 5 && this.state.outbox.length && !this.readOnly; attempt++) {
        const batch = this.state.outbox.slice(0, MAX_PUSH);
        try {
          const res = await api.push(this.treeId, this.state.version, batch);
          this.take(acknowledge(this.state, batch, res.applied, res.rejected, res.version));
        } catch (err) {
          if (err instanceof ApiError && err.status === 409) {
            const body = err.body as { version: number; ops: Array<{ seq: number; envelope: OpEnvelope }> };
            this.take(absorb(this.state, body.ops ?? [], body.version));
            continue;
          }
          throw err;
        }
      }
      // Pull whatever is new.
      const res = await api.pull(this.treeId, this.state.version);
      if (res.ops.length || res.version !== this.state.version) this.take(absorb(this.state, res.ops, res.version));
      this.status = 'synced';
      this.emit();
    } catch (err) {
      this.status =
        err instanceof ApiError ? (err.status === 401 || err.status === 403 || err.status === 404 ? 'error' : 'error') : 'offline';
      this.emit();
    }
  }
}
