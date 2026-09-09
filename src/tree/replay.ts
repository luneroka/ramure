/**
 * Replay a list of ops on a tree, skipping the ones that no longer apply.
 * Used by the server to advance a tree's document and by the client to
 * rebase its pending edits on top of what the server has.
 */

import type { Tree } from '../gedcom/model';
import { EditError } from './edit';
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
      // Only a failed precondition is a conflict to skip; anything else is a bug that must surface.
      if (!(err instanceof EditError)) throw err;
      rejected.push({ envelope: env, reason: err.message });
    }
  }
  return { tree: current, applied, rejected };
}
