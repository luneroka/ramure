/** Named and automatic versions of the open tree. */

import { useCallback, useState, type RefObject } from 'react';
import { t, type Lang } from '@/i18n';
import { api } from '@/sync/api';
import type { SyncEngine } from '@/sync/engine';
import { ops, type Op } from '@/tree/ops';
import type { AskSpec } from '@/app/ui/Modal';
import type { Source } from './useTreeSession';

export interface SnapshotRow {
  id: string;
  version: number;
  created_at: number;
  label: string | null;
  by: string | null;
}

interface Args {
  lang: Lang;
  source: Source | null;
  engine: RefObject<SyncEngine | null>;
  toast(msg: string): void;
  ask(spec: AskSpec): Promise<string | null>;
  commit(op: Op, opts?: { select?: boolean }): boolean;
  onRestored(): void;
}

export function useSnapshots(a: Args) {
  const { lang, source, engine, toast, ask, commit } = a;
  const [snapshots, setSnapshots] = useState<SnapshotRow[] | null>(null);

  const openSnapshots = useCallback(async () => {
    if (!source) return;
    const r = await api.listSnapshots(source.id);
    setSnapshots(r.snapshots);
  }, [source]);

  const saveVersion = useCallback(async () => {
    if (!source) return;
    await engine.current?.sync();
    const label = await ask({
      title: t(lang, 'saveVersion'),
      input: { label: t(lang, 'versionLabel'), placeholder: t(lang, 'versionLabelHint') },
      confirmLabel: t(lang, 'save'),
    });
    if (label === null) return;
    try {
      await api.saveSnapshot(source.id, label);
      toast(t(lang, 'versionSaved'));
      if (snapshots) setSnapshots((await api.listSnapshots(source.id)).snapshots);
    } catch {
      toast(t(lang, 'syncError'));
    }
  }, [source, engine, ask, lang, toast, snapshots]);

  const restoreSnapshot = useCallback(
    async (sid: string) => {
      if (!source) return;
      const answer = await ask({ title: t(lang, 'restoreTitle'), message: t(lang, 'restoreMessage'), confirmLabel: t(lang, 'restore') });
      if (answer === null) return;
      const s = await api.getSnapshot(source.id, sid);
      if (commit(ops.replaceTree(s.doc), { select: false })) {
        setSnapshots(null);
        a.onRestored();
        toast(t(lang, 'versionRestored'));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source, ask, lang, commit, toast, a.onRestored],
  );

  return { snapshots, setSnapshots, openSnapshots, saveVersion, restoreSnapshot };
}
