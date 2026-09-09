/** The relationship being shown: recomputed live, its path lit on the canvas. */

import { useMemo } from 'react';
import type { Tree } from '@/gedcom/model';
import type { Lang } from '@/i18n';
import { describeKinship } from '@/tree/kinship';
import type { Layout } from '@/tree/layout';

export function useKinship(tree: Tree | null, ids: { a: string; b: string } | null, lang: Lang) {
  const kinship = useMemo(() => {
    if (!ids || !tree || !tree.individuals[ids.a] || !tree.individuals[ids.b]) return null;
    return describeKinship(tree, ids.a, ids.b, lang);
  }, [ids, tree, lang]);
  const lit = useMemo(
    () => (kinship && kinship.path.length > 1 ? { ids: new Set(kinship.path), path: kinship.path } : undefined),
    [kinship],
  );
  return { kinship, lit };
}

/** Whether the whole path fits on the current layout; if not the overview is needed. */
export function pathNeedsOverview(tree: Tree, a: string, b: string, lang: Lang, layout: Layout | null): boolean {
  const r = describeKinship(tree, a, b, lang);
  return !!layout && r.path.some((id) => !layout.nodes.some((n) => n.id === id));
}
