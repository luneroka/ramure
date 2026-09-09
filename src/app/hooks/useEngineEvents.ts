/** What the sync engine reports while a tree is open: the tree after a pull, dropped or overwritten edits, a tree gone, a session lost. */

import { useCallback, useRef, type Dispatch, type RefObject } from 'react';
import { displayName } from '@/gedcom/model';
import { t, tn, type Lang } from '@/i18n';
import { describeOp } from '@/tree/ops';
import type { EngineEvent, SyncEngine, SyncStatus } from '@/sync/engine';
import type { HistoryAction } from '@/app/state/history';

interface Args {
  lang: Lang;
  toast(msg: string): void;
  historyDispatch: Dispatch<HistoryAction>;
  /** True while our own commit runs: the echo is not a remote change. */
  committing: RefObject<boolean>;
  goHome: RefObject<() => void>;
  refreshAuth(): Promise<void>;
}

export function useEngineEvents({ lang, toast, historyDispatch, committing, goHome, refreshAuth }: Args) {
  const lastStatus = useRef<SyncStatus>('synced');
  const reset = useCallback(() => {
    lastStatus.current = 'synced';
  }, []);
  const onEvent = useCallback(
    (e: EngineEvent, eng: SyncEngine) => {
      const prev = lastStatus.current;
      lastStatus.current = e.status;
      if (e.status === 'gone' && prev !== 'gone') {
        toast(t(lang, 'treeGone'));
        void eng.forget();
        goHome.current();
      }
      if (e.status === 'signedout' && prev !== 'signedout') void refreshAuth();
      if (committing.current) return;
      if (e.notice?.remote || e.notice?.dropped?.length) {
        historyDispatch({ type: 'replace', tree: e.tree, keepHistory: false });
        if (e.notice.dropped?.length) {
          const what = e.notice.dropped
            .slice(0, 2)
            .map((d) => describeOp(d.envelope.op, lang))
            .join(', ');
          toast(`${tn(lang, 'droppedChangesCount', e.notice.dropped.length)} : ${what}`);
        } else toast(t(lang, 'remoteChanges'));
      } else historyDispatch({ type: 'replace', tree: e.tree, keepHistory: true });
      if (e.notice?.overwrote?.length) {
        const names = e.notice.overwrote.map((id) => (e.tree.individuals[id] ? displayName(e.tree.individuals[id]!) : id)).join(', ');
        toast(`${t(lang, 'overwroteChanges')} ${names}`);
      }
    },
    [lang, toast, historyDispatch, committing, goHome, refreshAuth],
  );
  return { onEvent, reset };
}
