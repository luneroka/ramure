import { describe, expect, it } from 'vitest';
import { emptyTree } from '../gedcom/model';
import { historyReducer, initialHistory } from './history';

const tree = emptyTree();
const op = { t: 'setResources' as const, resources: [] };

describe('history', () => {
  it('commits, undoes, redoes, and forgets the future on a new commit', () => {
    let s = historyReducer(initialHistory, { type: 'load', tree, fileName: 'T' });
    s = historyReducer(s, { type: 'commit', tree, op, inverse: op });
    s = historyReducer(s, { type: 'commit', tree, op, inverse: op });
    expect(s.past).toHaveLength(2);
    s = historyReducer(s, { type: 'undo', tree });
    expect(s.past).toHaveLength(1);
    expect(s.future).toHaveLength(1);
    s = historyReducer(s, { type: 'redo', tree });
    expect(s.past).toHaveLength(2);
    s = historyReducer(s, { type: 'undo', tree });
    s = historyReducer(s, { type: 'commit', tree, op, inverse: op });
    expect(s.future).toHaveLength(0);
  });
  it('keeps or clears history on replace, and caps the past at 200', () => {
    let s = historyReducer(initialHistory, { type: 'load', tree, fileName: 'T' });
    for (let i = 0; i < 250; i++) s = historyReducer(s, { type: 'commit', tree, op, inverse: op });
    expect(s.past).toHaveLength(200);
    expect(historyReducer(s, { type: 'replace', tree, keepHistory: true }).past).toHaveLength(200);
    expect(historyReducer(s, { type: 'replace', tree, keepHistory: false }).past).toHaveLength(0);
    expect(historyReducer(s, { type: 'undo', tree }).past).toHaveLength(199);
    expect(historyReducer(initialHistory, { type: 'undo', tree })).toBe(initialHistory);
  });
});
