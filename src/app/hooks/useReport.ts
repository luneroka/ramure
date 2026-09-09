/**
 * The live checks report: import notes still relevant plus recomputed checks, minus what was dismissed.
 * Dismissals live in the tree (shared with everyone, synced like an edit); a viewer who cannot edit keeps
 * theirs on the device.
 */

import { useCallback, useMemo, useState } from 'react';
import type { Tree } from '@/gedcom/model';
import { auditTree, noteKey, type CheckNote } from '@/tree/audit';

function readDismissed(key: string | null): Set<string> {
  if (!key) return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(key) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

export function useReport(tree: Tree | null, sourceId: string | undefined) {
  const dismissKey = sourceId ? `ramure.dismissed:${sourceId}` : null;
  // Reloaded when the open tree changes (React's adjust-state-during-render pattern).
  const [dismissedFor, setDismissedFor] = useState<{ key: string | null; set: Set<string> }>(() => ({
    key: dismissKey,
    set: readDismissed(dismissKey),
  }));
  if (dismissedFor.key !== dismissKey) setDismissedFor({ key: dismissKey, set: readDismissed(dismissKey) });
  const local = dismissedFor.set;
  const shared = tree?.dismissedChecks;

  const reportNotes = useMemo(() => {
    if (!tree) return [];
    const dismissed = new Set([...local, ...(shared ?? [])]);
    const stillRelevant: CheckNote[] = tree.importNotes.filter((n) => !n.ids?.length || n.ids.some((id) => tree.individuals[id]));
    const all = [...stillRelevant, ...auditTree(tree)].filter((n) => !dismissed.has(noteKey(n)));
    // Impossible things first, then the merely unusual.
    return all.sort((a, b) => (a.level === b.level ? 0 : a.level === 'warning' ? -1 : 1));
  }, [tree, local, shared]);

  const dismissLocally = useCallback(
    (key: string) => {
      const next = new Set(local);
      next.add(key);
      setDismissedFor({ key: dismissKey, set: next });
      if (dismissKey) localStorage.setItem(dismissKey, JSON.stringify([...next]));
    },
    [local, dismissKey],
  );

  return { reportNotes, dismissLocally };
}
