/** The single path for changes: build an op, apply it, record it, hand it to sync. Undo and redo are ops too. */

import { useCallback, useEffect, type Dispatch, type RefObject } from 'react';
import type { Tree } from '../../gedcom/model';
import { t, type Lang } from '../../i18n';
import type { SyncEngine } from '../../sync/engine';
import { diffTrees } from '../../tree/diff';
import { applyOp, envelope, opSubject, type Op } from '../../tree/ops';
import type { HistoryAction, HistoryState } from '../history';

interface Args {
  tree: Tree | null;
  readOnly: boolean;
  lang: Lang;
  userId: string | undefined;
  engine: RefObject<SyncEngine | null>;
  history: HistoryState;
  dispatch: Dispatch<HistoryAction>;
  /** Flag our own commit while it runs, so the engine's echo is not treated as a remote change. */
  setCommitting(on: boolean): void;
  toast(msg: string): void;
  onCommitted(subject: string | undefined, opts: { select?: boolean; edit?: boolean; focus?: boolean }): void;
  onStepped(): void;
  onEscape(): void;
}

export function useEditing(a: Args) {
  const { tree, readOnly, lang, userId, engine, history, dispatch, setCommitting, toast } = a;

  const send = useCallback(
    (op: Op) => {
      if (!engine.current) return;
      setCommitting(true);
      try {
        engine.current.commit(envelope(op, userId));
      } finally {
        setCommitting(false);
      }
    },
    [engine, setCommitting, userId],
  );

  const commit = useCallback(
    (op: Op, opts: { select?: boolean; edit?: boolean; focus?: boolean } = {}) => {
      if (!tree || readOnly) return false;
      try {
        const r = applyOp(tree, op);
        const inverse = diffTrees(r.tree, tree);
        send(op);
        dispatch({ type: 'commit', tree: r.tree, op, inverse });
        a.onCommitted(opSubject(op, r), opts);
        return true;
      } catch (err) {
        toast(err instanceof Error ? (err.message === 'choose a family' ? t(lang, 'chooseFamily') : err.message) : String(err));
        return false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tree, readOnly, lang, toast, send, dispatch, a.onCommitted],
  );

  const step = useCallback(
    (dir: 'undo' | 'redo') => {
      if (!tree || readOnly) return;
      const entry = dir === 'undo' ? history.past[history.past.length - 1] : history.future[0];
      if (!entry) return;
      const op = dir === 'undo' ? entry.inverse : entry.op;
      try {
        const r = applyOp(tree, op);
        send(op);
        dispatch({ type: dir, tree: r.tree });
        a.onStepped();
      } catch {
        toast(t(lang, 'syncError'));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tree, readOnly, history.past, history.future, lang, toast, send, dispatch, a.onStepped],
  );
  const undo = useCallback(() => step('undo'), [step]);
  const redo = useCallback(() => step('redo'), [step]);

  // Keyboard: ⌘Z / ⌘⇧Z / ⌘Y, and Escape closes what is floating.
  const onEscape = a.onEscape;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
      )
        return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (e.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, onEscape]);

  return { commit, undo, redo };
}
