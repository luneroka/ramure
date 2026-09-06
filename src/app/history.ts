/**
 * Undo / redo as ops. Each entry keeps the op that was applied and its
 * inverse (a record-level patch), so undo and redo are ordinary ops that
 * reach the server like any edit. The tree itself is held here as the
 * single "present" the app renders.
 */

import type { Tree } from '../gedcom/model';
import { envelope, type Op, type OpEnvelope } from '../tree/ops';

export interface Entry {
  op: Op;
  inverse: Op;
}

export interface HistoryState {
  tree: Tree | null;
  fileName: string;
  past: Entry[];
  future: Entry[];
  /** Incremented on every change to `tree`, whatever its origin. */
  version: number;
  /** Ops applied this session, oldest first (capped). */
  log: OpEnvelope[];
}

export type HistoryAction =
  | { type: 'load'; tree: Tree; fileName: string }
  /** A local edit: the tree after it, the op and its inverse. */
  | { type: 'commit'; tree: Tree; op: Op; inverse: Op }
  /** The tree changed for another reason (sync). Undo history is kept when `keepHistory` is set. */
  | { type: 'replace'; tree: Tree; keepHistory: boolean }
  | { type: 'undo'; tree: Tree }
  | { type: 'redo'; tree: Tree }
  | { type: 'rename'; fileName: string }
  | { type: 'close' };

const MAX_PAST = 200;
const MAX_LOG = 2000;

export const initialHistory: HistoryState = { tree: null, fileName: '', past: [], future: [], version: 0, log: [] };

export function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case 'load':
      return { tree: action.tree, fileName: action.fileName, past: [], future: [], version: state.version + 1, log: [] };
    case 'close':
      return { ...initialHistory, version: state.version + 1 };
    case 'rename':
      return { ...state, fileName: action.fileName };
    case 'commit':
      return {
        ...state,
        tree: action.tree,
        past: [...state.past, { op: action.op, inverse: action.inverse }].slice(-MAX_PAST),
        future: [],
        version: state.version + 1,
        log: [...state.log, envelope(action.op)].slice(-MAX_LOG),
      };
    case 'replace':
      return action.keepHistory
        ? { ...state, tree: action.tree, version: state.version + 1 }
        : { ...state, tree: action.tree, past: [], future: [], version: state.version + 1 };
    case 'undo': {
      const entry = state.past[state.past.length - 1];
      if (!entry) return state;
      return { ...state, tree: action.tree, past: state.past.slice(0, -1), future: [entry, ...state.future], version: state.version + 1 };
    }
    case 'redo': {
      const entry = state.future[0];
      if (!entry) return state;
      return { ...state, tree: action.tree, past: [...state.past, entry], future: state.future.slice(1), version: state.version + 1 };
    }
  }
}
