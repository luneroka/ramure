/**
 * Replay a list of ops on a tree, skipping the ones that no longer apply.
 * Used by the server to advance a tree's document and by the client to
 * rebase its pending edits on top of what the server has.
 */

import type { Tree } from '../gedcom/model';
import { applyOp, type OpEnvelope } from './ops';

export interface ReplayResult {
  tree: Tree;
  applied: OpEnvelope[];
  rejected: Array<{ envelope: OpEnvelope; reason: string }>;
}

export function replayOps(tree: Tree, envelopes: OpEnvelope[]): ReplayResult {
  let current = tree;
  const applied: OpEnvelope[] = [];
  const rejected: ReplayResult['rejected'] = [];
  for (const env of envelopes) {
    try {
      current = applyOp(current, env.op).tree;
      applied.push(env);
    } catch (err) {
      rejected.push({ envelope: env, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  return { tree: current, applied, rejected };
}
