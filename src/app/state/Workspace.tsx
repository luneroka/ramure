/**
 * The open tree as the screens see it: what is loaded, what is selected,
 * how it is laid out, and the handful of verbs that change it. Built once
 * in the shell, read anywhere below through `useWorkspace()`.
 */

import { createContext, useContext, type Dispatch, type ReactNode, type RefObject } from 'react';
import type { TreeCanvasHandle } from '@/canvas/TreeCanvas';
import type { Tree } from '@/gedcom/model';
import type { SyncEngine, SyncStatus } from '@/sync/engine';
import type { CheckNote } from '@/tree/audit';
import type { PersonPatch } from '@/tree/edit';
import type { Kinship } from '@/tree/kinship';
import type { Layout, LayoutOptions } from '@/tree/layout';
import type { Op } from '@/tree/ops';
import type { AddKind, EditorAction, EditorState } from './editorState';
import type { Source } from '@/app/hooks/useTreeSession';

export interface Workspace {
  tree: Tree;
  /** The tree with the draft relative added, when one is being previewed. */
  displayTree: Tree;
  source: Source;
  readOnly: boolean;
  sync: { status: SyncStatus; pending: number };
  engineRef: RefObject<SyncEngine | null>;
  canvasRef: RefObject<TreeCanvasHandle | null>;
  /** The canvas registers its handle here (a callback ref). */
  setCanvas(handle: TreeCanvasHandle | null): void;

  editor: EditorState;
  dispatch: Dispatch<EditorAction>;

  layout: Layout | null;
  layoutOpts: LayoutOptions;
  effectiveFocus: string | undefined;
  count: number;
  hiddenCount: number;

  kinship: Kinship | null;
  lit: { ids: Set<string>; path: string[] } | undefined;
  startKinship(a: string, b: string): void;

  reportNotes: CheckNote[];
  dismissNote(key: string): void;

  commit(op: Op, opts?: { select?: boolean; edit?: boolean; focus?: boolean }): boolean;
  undo(): void;
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;
  /** Focus the hourglass on a person (and leave the overview). */
  focusOn(id: string): void;
  /** Select a person; completes a relationship lookup when one is armed. */
  select(id: string): void;
  startDraft(kind: AddKind, id: string, familyId?: string): void;
  cancelDraft(): void;
  saveDraft(patch: PersonPatch): void;
  addOptions(id: string): Array<{ kind: AddKind; label: string }>;
  /** Confirm through the modal; true when the person agreed. */
  confirmDeleteDocument(): Promise<boolean>;
}

const Ctx = createContext<Workspace | null>(null);

export function WorkspaceProvider({ value, children }: { value: Workspace; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace(): Workspace {
  const w = useContext(Ctx);
  if (!w) throw new Error('useWorkspace outside an open tree');
  return w;
}
