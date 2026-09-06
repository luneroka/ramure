/**
 * Undo / redo over immutable Tree values. Because edit operations share
 * untouched records, keeping a couple of hundred past trees costs little.
 */

import type { Tree } from '../gedcom/model';
import { envelope, type Op, type OpEnvelope } from '../tree/ops';

export interface Doc {
  tree: Tree;
  fileName: string;
}

export interface HistoryState {
  present: Doc | null;
  past: Doc[];
  future: Doc[];
  /** Incremented on every commit, so effects can react to edits and not to undo/redo navigation. */
  version: number;
  /** Ops applied this session, oldest first (capped). The sync engine will read from here. */
  log: OpEnvelope[];
}

export type HistoryAction =
  | { type: 'load'; doc: Doc }
  | { type: 'commit'; tree: Tree; op: Op }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'rename'; fileName: string };

const MAX_PAST = 200;
const MAX_LOG = 2000;

export const initialHistory: HistoryState = { present: null, past: [], future: [], version: 0, log: [] };

export function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case 'load':
      return { present: action.doc, past: [], future: [], version: state.version + 1, log: [] };
    case 'commit': {
      if (!state.present) return state;
      const past = [...state.past, state.present].slice(-MAX_PAST);
      const log = [...state.log, envelope(action.op)].slice(-MAX_LOG);
      return { present: { ...state.present, tree: action.tree }, past, future: [], version: state.version + 1, log };
    }
    case 'undo': {
      const prev = state.past[state.past.length - 1];
      if (!prev || !state.present) return state;
      return {
        ...state,
        present: prev,
        past: state.past.slice(0, -1),
        future: [state.present, ...state.future],
        version: state.version + 1,
      };
    }
    case 'redo': {
      const next = state.future[0];
      if (!next || !state.present) return state;
      return { ...state, present: next, past: [...state.past, state.present], future: state.future.slice(1), version: state.version + 1 };
    }
    case 'rename':
      return state.present ? { ...state, present: { ...state.present, fileName: action.fileName } } : state;
  }
}
