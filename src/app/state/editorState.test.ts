import { describe, expect, it } from 'vitest';
import { editorReducer, initialEditor, type Draft, type EditorState } from './editorState';

const draft = { kind: 'child', relativeId: 'I1', op: { type: 'noop' }, preview: { tree: {}, focusId: 'I9' } } as unknown as Draft;

describe('editorReducer', () => {
  it('opening a tree resets everything but the stage mode', () => {
    const s: EditorState = { ...initialEditor, mode: 'map', selectedId: 'I1', editing: true, showReport: true };
    const next = editorReducer(s, { type: 'treeOpened', focusId: 'I2', view: 'all' });
    expect(next).toEqual({ ...initialEditor, mode: 'map', focusId: 'I2', view: 'all' });
  });

  it('a draft selects the new person for editing and cancelling goes back to the relative', () => {
    const opened = editorReducer(initialEditor, { type: 'openDraft', draft, newId: 'I9', view: 'all' });
    expect(opened.selectedId).toBe('I9');
    expect(opened.editing).toBe(true);
    expect(opened.view).toBe('all');
    const cancelled = editorReducer(opened, { type: 'cancelDraft' });
    expect(cancelled.draft).toBeNull();
    expect(cancelled.selectedId).toBe('I1');
    expect(cancelled.editing).toBe(false);
  });

  it('closing the panel during a draft returns to the relative', () => {
    const opened = editorReducer(initialEditor, { type: 'openDraft', draft, newId: 'I9' });
    expect(editorReducer(opened, { type: 'closePanel' }).selectedId).toBe('I1');
    expect(editorReducer({ ...initialEditor, selectedId: 'I3' }, { type: 'closePanel' }).selectedId).toBeUndefined();
  });

  it('a commit selects and focuses its subject as asked', () => {
    const s = { ...initialEditor, selectedId: 'I1', focusId: 'I1', editing: true };
    const kept = editorReducer(s, { type: 'committed', subject: 'I2', select: false, focus: false, edit: false });
    expect(kept.selectedId).toBe('I1');
    expect(kept.editing).toBe(false);
    const moved = editorReducer(s, { type: 'committed', subject: 'I2', select: true, focus: true, edit: true });
    expect(moved).toMatchObject({ selectedId: 'I2', focusId: 'I2', editing: true });
  });

  it('the relationship handle arms, re-arms off, and a lookup clears the arm', () => {
    const armed = editorReducer(initialEditor, { type: 'armKinship', id: 'I1' });
    expect(armed.kinshipFrom).toBe('I1');
    expect(armed.selectedId).toBe('I1');
    expect(editorReducer(armed, { type: 'armKinship', id: 'I1' }).kinshipFrom).toBeNull();
    const found = editorReducer(armed, { type: 'setKinship', ids: { a: 'I1', b: 'I2' } });
    expect(found.kinshipFrom).toBeNull();
    expect(found.kinshipIds).toEqual({ a: 'I1', b: 'I2' });
  });

  it('the add menu toggles on the same card and switching mode drops menus and lookups', () => {
    const open = editorReducer(initialEditor, { type: 'toggleAddMenu', id: 'I1', x: 10, y: 20 });
    expect(open.addMenu).toEqual({ id: 'I1', x: 10, y: 20 });
    expect(editorReducer(open, { type: 'toggleAddMenu', id: 'I1', x: 1, y: 2 }).addMenu).toBeNull();
    const withKin = { ...open, kinshipIds: { a: 'I1', b: 'I2' } };
    const switched = editorReducer(withKin, { type: 'setMode', mode: 'timeline' });
    expect(switched.mode).toBe('timeline');
    expect(switched.addMenu).toBeNull();
    expect(switched.kinshipIds).toBeNull();
  });

  it('focus leaves the overview when asked and escape closes what floats', () => {
    const focused = editorReducer({ ...initialEditor, view: 'all' }, { type: 'focus', id: 'I4', view: 'hourglass' });
    expect(focused).toMatchObject({ focusId: 'I4', selectedId: 'I4', view: 'hourglass' });
    const busy = { ...initialEditor, kinshipFrom: 'I1', searchOpen: true, addMenu: { id: 'I1', x: 0, y: 0 } };
    expect(editorReducer(busy, { type: 'escape' })).toMatchObject({ kinshipFrom: null, searchOpen: false, addMenu: null });
  });
});
