/** When the canvas moves by itself: a new tree, a view or focus change, a draft to show, a relationship to frame. */

import { useEffect, useRef, type RefObject } from 'react';
import type { TreeCanvasHandle } from '../../canvas/TreeCanvas';
import type { Tree } from '../../gedcom/model';
import type { Layout } from '../../tree/layout';
import { opSubject } from '../../tree/ops';
import type { Draft, ViewMode } from '../editorState';

interface Args {
  canvas: RefObject<TreeCanvasHandle | null>;
  layout: Layout | null;
  tree: Tree | null;
  sourceKey: string;
  view: ViewMode;
  effectiveFocus: string | undefined;
  lit: { path: string[] } | undefined;
  draft: Draft | null;
}

export function useCamera({ canvas, layout, tree, sourceKey, view, effectiveFocus, lit, draft }: Args) {
  useEffect(() => {
    if (!draft || !layout) return;
    const id = opSubject(draft.op, draft.preview);
    if (id && layout.nodes.some((n) => n.id === id)) requestAnimationFrame(() => canvas.current?.centerOn(id, true));
  }, [draft, layout, canvas]);

  const lastKey = useRef<string>('');
  const lastFocus = useRef<string | undefined>(undefined);
  const lastView = useRef<ViewMode>(view);
  const framedPath = useRef<string>('');
  useEffect(() => {
    if (!layout || !tree) return;
    const loadedNew = lastKey.current !== sourceKey;
    const viewChanged = lastView.current !== view;
    const focusChanged = lastFocus.current !== effectiveFocus;
    lastKey.current = sourceKey;
    lastFocus.current = effectiveFocus;
    lastView.current = view;
    // A relationship being shown wins: frame its path as soon as the layout holds every person on it.
    const litKey = lit ? lit.path.join('>') : '';
    if (lit && litKey !== framedPath.current && lit.path.every((id) => layout.nodes.some((n) => n.id === id))) {
      framedPath.current = litKey;
      requestAnimationFrame(() => canvas.current?.fitTo(lit.path, true));
      return;
    }
    if (loadedNew) requestAnimationFrame(() => canvas.current?.initialView());
    else if (viewChanged && view === 'all')
      requestAnimationFrame(() => (effectiveFocus ? canvas.current?.centerOn(effectiveFocus, true) : canvas.current?.fit(true)));
    else if (viewChanged || focusChanged) requestAnimationFrame(() => effectiveFocus && canvas.current?.centerOn(effectiveFocus, true));
  }, [layout, tree, sourceKey, view, effectiveFocus, lit, canvas]);
}
