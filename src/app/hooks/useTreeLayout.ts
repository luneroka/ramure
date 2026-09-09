/** The layout the canvas draws for the current view and focus, and the counts the hud shows. */

import { useMemo } from 'react';
import type { Tree } from '@/gedcom/model';
import { DEFAULT_LAYOUT, layoutHourglass } from '@/tree/layout';
import { layoutEverything } from '@/tree/layoutAll';
import type { ViewMode } from '@/app/state/editorState';

/** Pick a sensible first focus: the person with the most relatives on both sides. */
export function defaultFocus(tree: Tree): string | undefined {
  let best: string | undefined,
    bestScore = -1;
  for (const ind of Object.values(tree.individuals)) {
    const parents = ind.childOf.length ? 1 : 0;
    const kids = ind.partnerIn.reduce((s, f) => s + (tree.families[f]?.childIds.length ?? 0), 0);
    const score = parents * 2 + Math.min(kids, 3) + (ind.partnerIn.length ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = ind.id;
    }
  }
  return best;
}

export function useTreeLayout(tree: Tree | null, displayTree: Tree | null, focusId: string | undefined, view: ViewMode) {
  const layoutOpts = useMemo(
    () => ({
      ...DEFAULT_LAYOUT,
      maxUp: view === 'descendants' ? 0 : DEFAULT_LAYOUT.maxUp,
      maxDown: view === 'ancestors' ? 0 : DEFAULT_LAYOUT.maxDown,
    }),
    [view],
  );
  const effectiveFocus = useMemo(
    () => (tree && focusId && tree.individuals[focusId] ? focusId : tree ? defaultFocus(tree) : undefined),
    [tree, focusId],
  );
  const layout = useMemo(() => {
    if (!displayTree) return null;
    if (view === 'all') return Object.keys(displayTree.individuals).length ? layoutEverything(displayTree) : null;
    return effectiveFocus ? layoutHourglass(displayTree, effectiveFocus, layoutOpts) : null;
  }, [displayTree, effectiveFocus, layoutOpts, view]);
  const count = useMemo(() => (tree ? Object.keys(tree.individuals).length : 0), [tree]);
  const hiddenCount = useMemo(() => (tree && layout ? count - new Set(layout.nodes.map((n) => n.id)).size : 0), [tree, layout, count]);
  return { layoutOpts, effectiveFocus, layout, count, hiddenCount };
}
