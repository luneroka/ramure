/**
 * Everything about what the person is looking at in an open tree: selection,
 * focus, the edit form, a draft relative, the stage view and mode, the add
 * menu, the relationship lookup, the report and the search box. One reducer,
 * so "close the panel" or "open a tree" mean the same thing everywhere.
 */

import type { EditResult } from '../tree/edit';
import type { Op } from '../tree/ops';
import type { StageMode } from './ui/icons';

export type ViewMode = 'all' | 'hourglass' | 'ancestors' | 'descendants';
export type AddKind = 'father' | 'mother' | 'partner' | 'child' | 'sibling';

/** A relative being added: previewed on the canvas, committed only on save. The op is built once so ids are stable. */
export interface Draft {
  kind: AddKind;
  relativeId: string;
  op: Op;
  preview: EditResult;
}

export interface EditorState {
  selectedId?: string;
  focusId?: string;
  editing: boolean;
  draft: Draft | null;
  view: ViewMode;
  mode: StageMode;
  addMenu: { id: string; x: number; y: number } | null;
  /** Kinship lookup started from a card: the next card tapped completes it. */
  kinshipFrom: string | null;
  kinshipIds: { a: string; b: string } | null;
  showReport: boolean;
  searchOpen: boolean;
}

export type EditorAction =
  | { type: 'select'; id: string | undefined }
  | { type: 'focus'; id: string; view?: ViewMode }
  | { type: 'closePanel' }
  | { type: 'setEditing'; editing: boolean }
  | { type: 'openDraft'; draft: Draft; newId: string; view?: ViewMode }
  | { type: 'cancelDraft' }
  | { type: 'draftSaved' }
  /** After a local edit: what to select, focus and whether to keep editing. */
  | { type: 'committed'; subject: string | undefined; select: boolean; focus: boolean; edit: boolean }
  | { type: 'stepped' }
  | { type: 'setView'; view: ViewMode }
  | { type: 'setMode'; mode: StageMode }
  | { type: 'toggleAddMenu'; id: string; x: number; y: number }
  | { type: 'closeAddMenu' }
  | { type: 'armKinship'; id: string | null }
  | { type: 'setKinship'; ids: { a: string; b: string } | null }
  | { type: 'showReport'; show: boolean }
  | { type: 'setSearchOpen'; open: boolean }
  | { type: 'treeOpened'; focusId: string | undefined; view: ViewMode }
  | { type: 'treeClosed' }
  | { type: 'escape' };

export const initialEditor: EditorState = {
  editing: false,
  draft: null,
  view: 'hourglass',
  mode: 'tree',
  addMenu: null,
  kinshipFrom: null,
  kinshipIds: null,
  showReport: false,
  searchOpen: false,
};

export function editorReducer(s: EditorState, a: EditorAction): EditorState {
  switch (a.type) {
    case 'select':
      return { ...s, selectedId: a.id, draft: null, editing: false, addMenu: null };
    case 'focus':
      return { ...s, focusId: a.id, selectedId: a.id, draft: null, editing: false, addMenu: null, view: a.view ?? s.view };
    case 'closePanel':
      return { ...s, selectedId: s.draft ? s.draft.relativeId : undefined, draft: null, editing: false };
    case 'setEditing':
      return { ...s, editing: a.editing };
    case 'openDraft':
      return { ...s, draft: a.draft, selectedId: a.newId, editing: true, addMenu: null, view: a.view ?? s.view };
    case 'cancelDraft':
      return { ...s, selectedId: s.draft ? s.draft.relativeId : s.selectedId, draft: null, editing: false };
    case 'draftSaved':
      return { ...s, draft: null };
    case 'committed':
      return {
        ...s,
        selectedId: a.subject && a.select ? a.subject : s.selectedId,
        focusId: a.subject && a.focus ? a.subject : s.focusId,
        editing: a.edit,
      };
    case 'stepped':
      return { ...s, editing: false, draft: null };
    case 'setView':
      return { ...s, view: a.view, addMenu: null };
    case 'setMode':
      return { ...s, mode: a.mode, addMenu: null, kinshipIds: null, kinshipFrom: null };
    case 'toggleAddMenu':
      return {
        ...s,
        selectedId: a.id,
        kinshipFrom: null,
        addMenu: s.addMenu && s.addMenu.id === a.id ? null : { id: a.id, x: a.x, y: a.y },
      };
    case 'closeAddMenu':
      return { ...s, addMenu: null };
    case 'armKinship':
      return { ...s, selectedId: a.id ?? s.selectedId, addMenu: null, kinshipFrom: s.kinshipFrom === a.id ? null : a.id };
    case 'setKinship':
      return { ...s, kinshipIds: a.ids, kinshipFrom: null };
    case 'showReport':
      return { ...s, showReport: a.show };
    case 'setSearchOpen':
      return { ...s, searchOpen: a.open };
    case 'treeOpened':
      return { ...initialEditor, focusId: a.focusId, view: a.view, mode: s.mode };
    case 'treeClosed':
      return { ...initialEditor, view: s.view, mode: s.mode };
    case 'escape':
      return { ...s, kinshipFrom: null, addMenu: null, searchOpen: false };
  }
}
