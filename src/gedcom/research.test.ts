import { describe, expect, it } from 'vitest';
import { parseDate } from './dates';
import { parseGedcom } from './parse';
import { serializeGedcom } from './serialize';
import { applyOp, ops } from '../tree/ops';
import { diffTrees, applyRecordPatch } from '../tree/diff';
import { portraitId } from '../tree/edit';

const base = parseGedcom(['0 HEAD', '1 GEDC', '2 VERS 5.5.1', '0 @I1@ INDI', '1 NAME Rosalie /Guérin/', '0 TRLR'].join('\n'));

describe('leads, documents and resources round-trip', () => {
  it('keeps leads, document kinds and dates, the portrait flag and the tree resources', () => {
    let tree = applyOp(
      base,
      ops.updatePerson('I1', {
        leads: [{ id: 'Labc', title: 'Acte de mariage à Conty', url: 'https://example.org/x', note: 'AD Somme', done: true }],
        media: [
          { id: 'M1', file: 'ramure:M1', format: 'pdf', title: 'Naissance', kind: 'birth', date: parseDate('12 MAR 1852'), notes: [], extra: [] },
          { id: 'M2', file: 'ramure:M2', format: 'jpg', title: 'Portrait', kind: 'photo', primary: true, notes: [], extra: [] },
        ],
        mediaIds: ['M1', 'M2'],
      }),
    ).tree;
    tree = applyOp(tree, ops.setResources([{ id: 'Lres', title: 'AD Somme', url: 'https://archives.somme.fr' }])).tree;
    const text = serializeGedcom(tree);
    expect(text).toContain('1 _LINK https://example.org/x');
    expect(text).toContain('2 _DONE Y');
    expect(text).toContain('1 _KIND birth');
    expect(text).toContain('1 _DATE 12 MAR 1852');
    expect(text).toContain('1 _PRIM Y');
    const back = parseGedcom(text);
    expect(back.individuals.I1!.leads).toEqual(tree.individuals.I1!.leads);
    expect(back.media.M1!.kind).toBe('birth');
    expect(back.media.M1!.date).toEqual(parseDate('12 MAR 1852'));
    expect(back.resources).toEqual(tree.resources);
    // The portrait is the flagged picture, not the first attachment (a PDF).
    expect(portraitId(back.individuals.I1!, back)).toBe('M2');
  });

  it('undoes a resources change through the record patch', () => {
    const after = applyOp(base, ops.setResources([{ id: 'L1', title: 'X', url: '' }])).tree;
    const undo = diffTrees(after, base);
    expect(undo.resources).toEqual([]);
    expect(applyRecordPatch(after, undo).resources).toEqual([]);
  });

  it('never picks a document as the portrait of an imported person', () => {
    const tree = applyOp(
      base,
      ops.updatePerson('I1', {
        media: [{ id: 'M1', file: 'ramure:M1', format: 'jpg', kind: 'death', notes: [], extra: [] }],
        mediaIds: ['M1'],
      }),
    ).tree;
    expect(portraitId(tree.individuals.I1!, tree)).toBeUndefined();
  });
});
