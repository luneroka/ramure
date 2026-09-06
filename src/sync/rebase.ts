/**
 * Pure sync state machine for one cloud tree.
 *
 * `base` is the tree as the server had it at `version`; `outbox` holds our
 * ops not yet accepted by the server. What the user sees is base + outbox.
 * Incoming server ops advance base; our outbox is then replayed on top and
 * anything that no longer applies is dropped and reported.
 */

import type { Tree } from '../gedcom/model';
import type { OpEnvelope } from '../tree/ops';
import { replayOps } from '../tree/replay';

export interface SyncState {
  version: number;
  base: Tree;
  outbox: OpEnvelope[];
}

export interface Incoming {
  seq: number;
  envelope: OpEnvelope;
}

export interface RebaseResult {
  state: SyncState;
  working: Tree;
  /** Our ops that could not be replayed on the new base. */
  dropped: Array<{ envelope: OpEnvelope; reason: string }>;
  /** True when the incoming batch contained ops from someone else. */
  remoteChanges: boolean;
}

export function working(state: SyncState): Tree {
  return replayOps(state.base, state.outbox).tree;
}

/** Apply ops received from the server (a pull, or the payload of a 409). */
export function absorb(state: SyncState, incoming: Incoming[], version: number): RebaseResult {
  const ours = new Set(state.outbox.map((e) => e.id));
  const fresh = incoming.filter((i) => i.seq > state.version).sort((a, b) => a.seq - b.seq);
  const base = replayOps(
    state.base,
    fresh.map((i) => i.envelope),
  ).tree;
  const remoteChanges = fresh.some((i) => !ours.has(i.envelope.id));
  // Our own ops echoed back are done; the rest is replayed on the new base.
  const remaining = state.outbox.filter((e) => !fresh.some((i) => i.envelope.id === e.id));
  const replay = replayOps(base, remaining);
  const next: SyncState = {
    version: Math.max(version, fresh.length ? fresh[fresh.length - 1]!.seq : state.version),
    base,
    outbox: replay.applied,
  };
  return { state: next, working: replay.tree, dropped: replay.rejected, remoteChanges };
}

/** Record the server's answer to a push: which of our ops it applied, which it rejected, the new version. */
export function acknowledge(
  state: SyncState,
  sent: OpEnvelope[],
  applied: string[],
  rejected: Array<{ id: string; reason: string }>,
  version: number,
): RebaseResult {
  const appliedSet = new Set(applied);
  const rejectedMap = new Map(rejected.map((r) => [r.id, r.reason]));
  const acceptedOps = sent.filter((e) => appliedSet.has(e.id));
  const base = replayOps(state.base, acceptedOps).tree;
  const outbox = state.outbox.filter((e) => !appliedSet.has(e.id) && !rejectedMap.has(e.id));
  const replay = replayOps(base, outbox);
  const dropped = [
    ...sent.filter((e) => rejectedMap.has(e.id)).map((e) => ({ envelope: e, reason: rejectedMap.get(e.id)! })),
    ...replay.rejected,
  ];
  return { state: { version, base, outbox: replay.applied }, working: replay.tree, dropped, remoteChanges: false };
}

/** Queue a local edit. */
export function enqueue(state: SyncState, envelope: OpEnvelope): SyncState {
  return { ...state, outbox: [...state.outbox, envelope] };
}
