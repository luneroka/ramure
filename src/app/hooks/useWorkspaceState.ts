/**
 * Assembles the workspace for the open tree from the smaller hooks:
 * editor state, layout, kinship, report, editing verbs and drafts.
 */

import { useCallback, useMemo, useReducer, useRef, type Dispatch, type RefObject } from 'react';
import type { TreeCanvasHandle } from '../../canvas/TreeCanvas';
import type { HandleKind } from '../../canvas/renderer';
import { t, type Lang } from '../../i18n';
import type { SyncEngine, SyncStatus } from '../../sync/engine';
import type { AskSpec } from '../Modal';
import { editorReducer, initialEditor, type EditorAction, type EditorState } from '../editorState';
import type { HistoryAction, HistoryState } from '../history';
import type { Workspace } from '../session/Workspace';
import { useCamera } from './useCamera';
import { useDrafts } from './useDrafts';
import { useEditing } from './useEditing';
import { pathNeedsOverview, useKinship } from './useKinship';
import { useReport } from './useReport';
import { useTreeLayout } from './useTreeLayout';
import type { Source } from './useTreeSession';

interface Args {
  lang: Lang;
  userId: string | undefined;
  history: HistoryState;
  historyDispatch: Dispatch<HistoryAction>;
  source: Source | null;
  sync: { status: SyncStatus; pending: number };
  engine: RefObject<SyncEngine | null>;
  setCommitting(on: boolean): void;
  toast(msg: string): void;
  ask(spec: AskSpec): Promise<string | null>;
  /** Escape pressed outside a field: the shell closes what it owns (dialogs). */
  onEscape(): void;
}

export function useWorkspaceState(a: Args): {
  editor: EditorState;
  dispatch: Dispatch<EditorAction>;
  workspace: Workspace | null;
  onHandle(kind: HandleKind, id: string, at: { x: number; y: number }): void;
} {
  const { lang, history, source, sync, engine, toast, ask } = a;
  const tree = history.tree;
  const [editor, dispatch] = useReducer(editorReducer, initialEditor);
  const canvas = useRef<TreeCanvasHandle>(null);
  const setCanvas = useCallback((handle: TreeCanvasHandle | null) => {
    canvas.current = handle;
  }, []);
  const readOnly = source?.role === 'viewer' || sync.status === 'locked';
  const displayTree = editor.draft ? editor.draft.preview.tree : tree;

  const { layoutOpts, effectiveFocus, layout, count, hiddenCount } = useTreeLayout(tree, displayTree, editor.focusId, editor.view);
  const { kinship, lit } = useKinship(tree, editor.kinshipIds, lang);
  const { reportNotes, dismissNote } = useReport(tree, source?.id);
  useCamera({ canvas, layout, tree, sourceKey: source?.id ?? '', view: editor.view, effectiveFocus, lit, draft: editor.draft });

  const onCommitted = useCallback((subject: string | undefined, opts: { select?: boolean; edit?: boolean; focus?: boolean }) => {
    dispatch({ type: 'committed', subject, select: opts.select !== false, focus: !!opts.focus, edit: !!opts.edit });
  }, []);
  const onStepped = useCallback(() => dispatch({ type: 'stepped' }), []);
  const onEscape = a.onEscape;
  const escape = useCallback(() => {
    dispatch({ type: 'escape' });
    onEscape();
  }, [onEscape]);
  const { commit, undo, redo } = useEditing({
    tree,
    readOnly,
    lang,
    userId: a.userId,
    engine,
    history,
    dispatch: a.historyDispatch,
    setCommitting: a.setCommitting,
    toast,
    onCommitted,
    onStepped,
    onEscape: escape,
  });

  const { startDraft, saveDraft, addOptions } = useDrafts({
    tree,
    readOnly,
    lang,
    view: editor.view,
    effectiveFocus,
    layoutOpts,
    draft: editor.draft,
    dispatch,
    commit,
    toast,
  });
  const cancelDraft = useCallback(() => dispatch({ type: 'cancelDraft' }), []);

  const startKinship = useCallback(
    (x: string, y: string) => {
      dispatch({ type: 'setKinship', ids: { a: x, b: y } });
      // The whole path has to be on the canvas: the overview shows everyone.
      if (tree && pathNeedsOverview(tree, x, y, lang, layout)) dispatch({ type: 'setView', view: 'all' });
    },
    [tree, lang, layout],
  );
  const focusOn = useCallback(
    (id: string) => dispatch({ type: 'focus', id, view: editor.view === 'all' ? 'hourglass' : undefined }),
    [editor.view],
  );
  const select = useCallback(
    (id: string) => {
      if (editor.kinshipFrom && editor.kinshipFrom !== id) startKinship(editor.kinshipFrom, id);
      else dispatch({ type: 'select', id });
    },
    [editor.kinshipFrom, startKinship],
  );
  const onHandle = useCallback((kind: HandleKind, id: string, at: { x: number; y: number }) => {
    if (kind === 'kin') dispatch({ type: 'armKinship', id });
    else dispatch({ type: 'toggleAddMenu', id, x: at.x, y: at.y });
  }, []);
  const confirmDeleteDocument = useCallback(async () => {
    const answer = await ask({
      title: t(lang, 'deleteDocument'),
      message: t(lang, 'deleteDocumentMessage'),
      confirmLabel: t(lang, 'delete'),
      danger: true,
    });
    return !!answer;
  }, [ask, lang]);

  const workspace = useMemo<Workspace | null>(() => {
    if (!tree || !displayTree || !source) return null;
    return {
      tree,
      displayTree,
      source,
      readOnly,
      sync,
      engineRef: engine,
      canvasRef: canvas,
      setCanvas,
      editor,
      dispatch,
      layout,
      layoutOpts,
      effectiveFocus,
      count,
      hiddenCount,
      kinship,
      lit,
      startKinship,
      reportNotes,
      dismissNote,
      commit,
      undo,
      redo,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
      focusOn,
      select,
      startDraft,
      cancelDraft,
      saveDraft,
      addOptions,
      confirmDeleteDocument,
    };
  }, [
    tree,
    displayTree,
    source,
    readOnly,
    sync,
    engine,
    setCanvas,
    editor,
    layout,
    layoutOpts,
    effectiveFocus,
    count,
    hiddenCount,
    kinship,
    lit,
    startKinship,
    reportNotes,
    dismissNote,
    commit,
    undo,
    redo,
    history.past.length,
    history.future.length,
    focusOn,
    select,
    startDraft,
    cancelDraft,
    saveDraft,
    addOptions,
    confirmDeleteDocument,
  ]);

  return { editor, dispatch, workspace, onHandle };
}
