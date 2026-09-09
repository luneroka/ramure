/** Keyboard moves on the canvas: the nearest card in a direction. */

import type { LayoutNode } from '../tree/layout';

export type Dir = 'left' | 'right' | 'up' | 'down';

export function neighbour(nodes: readonly LayoutNode[], from: LayoutNode, dir: Dir): LayoutNode | undefined {
  const cx = from.x + from.w / 2,
    cy = from.y + from.h / 2;
  let best: LayoutNode | undefined;
  let bestScore = Infinity;
  for (const n of nodes) {
    if (n === from || (n.id === from.id && n.dup === from.dup)) continue;
    const nx = n.x + n.w / 2,
      ny = n.y + n.h / 2;
    const dx = nx - cx,
      dy = ny - cy;
    let score: number;
    if (dir === 'left' || dir === 'right') {
      // Same row only, closest along the row.
      if (Math.abs(dy) > from.h / 2) continue;
      if (dir === 'left' ? dx >= 0 : dx <= 0) continue;
      score = Math.abs(dx);
    } else {
      if (dir === 'up' ? dy >= -from.h / 2 : dy <= from.h / 2) continue;
      // The row just above or below first, then the closest column.
      score = Math.abs(dy) * 2 + Math.abs(dx);
    }
    if (score < bestScore) {
      bestScore = score;
      best = n;
    }
  }
  return best;
}
