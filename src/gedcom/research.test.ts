import { describe, expect, it } from 'vitest';
import { parseDate } from './dates';
import { parseGedcom } from './parse';
import { serializeGedcom } from './serialize';
import { applyOp, ops } from '../tree/ops';
import { diffTrees, applyRecordPatch } from '../tree/diff';
import { portraitId } from '../tree/edit';
import { leadCitation, sourceParts, writtenSource } from './model';

const base = parseGedcom(['0 HEAD', '1 GEDC', '2 VERS 5.5.1', '0 @I1@ INDI', '1 NAME Rosalie /Guérin/', '0 TRLR'].join('\n'));

describe('sources, documents and resources round-trip', () => {
  it('keeps written sources, document kinds and dates, the portrait flag and the tree resources', () => {
    let tree = applyOp(
      base,
      ops.updatePerson('I1', {
        citations: [writtenSource('Acte de mariage à Conty', 'https://example.org/x', ['AD Somme'])],
        media: [
          {
            id: 'M1',
            file: 'ramure:M1',
            format: 'pdf',
            title: 'Naissance',
            kind: 'birth',
            date: parseDate('12 MAR 1852'),
            notes: [],
            extra: [],
          },
          { id: 'M2', file: 'ramure:M2', format: 'jpg', title: 'Portrait', kind: 'photo', primary: true, notes: [], extra: [] },
        ],
        mediaIds: ['M1', 'M2'],
      }),
    ).tree;
    tree = applyOp(tree, ops.setResources([{ id: 'Lres', title: 'AD Somme', url: 'https://archives.somme.fr' }])).tree;
    tree = applyOp(
      tree,
      ops.updateTree({
        media: [{ id: 'M9', file: 'ramure:M9', format: 'pdf', title: 'Livret de famille', kind: 'other', notes: [], extra: [] }],
        documentIds: ['M9'],
      }),
    ).tree;
    const text = serializeGedcom(tree);
    expect(text).toContain('1 SOUR Acte de mariage à Conty\n2 CONT https://example.org/x\n2 NOTE AD Somme');
    expect(text).not.toContain('_LINK https://example.org/x');
    expect(text).toContain('1 _KIND birth');
    expect(text).toContain('1 _DATE 12 MAR 1852');
    expect(text).toContain('1 _PRIM Y');
    const back = parseGedcom(text);
    expect(back.individuals.I1!.citations).toEqual(tree.individuals.I1!.citations);
    expect(back.media.M1!.kind).toBe('birth');
    expect(back.media.M1!.date).toEqual(parseDate('12 MAR 1852'));
    expect(back.resources).toEqual(tree.resources);
    expect(text).toContain('1 _DOC @M9@');
    expect(back.documentIds).toEqual(['M9']);
    expect(back.media.M9!.title).toBe('Livret de famille');
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

describe('research leads folded into sources', () => {
  const old = [
    '0 HEAD',
    '1 _LINK https://archives.somme.fr',
    '2 _ID Lres',
    '2 TITL AD Somme',
    '0 @I1@ INDI',
    '1 NAME Rosalie /Guérin/',
    '1 SOUR Registre paroissial de Conty',
    '1 _LINK https://example.org/x',
    '2 _ID L1',
    '2 TITL Acte de mariage à Conty',
    '2 NOTE Demander à la mairie',
    '2 _DONE Y',
    '1 _LINK https://example.org/y',
    '2 _ID L2',
    '1 _LINK',
    '2 _ID L3',
    '2 TITL Cousin Jules, à appeler',
    '0 TRLR',
  ].join('\n');

  it('reads a person’s leads as sources after their own, keeping title, link and note', () => {
    const tree = parseGedcom(old);
    expect(tree.individuals.I1!.citations).toEqual([
      { flat: 'Registre paroissial de Conty', notes: [] },
      { flat: 'Acte de mariage à Conty\nhttps://example.org/x', notes: ['Demander à la mairie'] },
      { flat: 'https://example.org/y', notes: [] },
      { flat: 'Cousin Jules, à appeler', notes: [] },
    ]);
    expect('leads' in tree.individuals.I1!).toBe(false);
    // The tree's own links stay resources.
    expect(tree.resources).toEqual([{ id: 'Lres', url: 'https://archives.somme.fr', title: 'AD Somme', note: undefined, done: undefined }]);
  });

  it('writes them as GEDCOM sources, and reads its own output back the same', () => {
    const tree = parseGedcom(old);
    const text = serializeGedcom(tree, { date: new Date(2026, 9, 3) });
    expect(text.match(/_LINK/g)).toHaveLength(1);
    expect(text).toContain('1 SOUR https://example.org/y');
    const again = parseGedcom(text);
    expect(again.individuals).toEqual(tree.individuals);
    expect(serializeGedcom(again, { date: new Date(2026, 9, 3) })).toBe(text);
  });

  it('splits a written source back into its text and its link', () => {
    expect(sourceParts(writtenSource('Acte', 'https://example.org/a'))).toEqual({ text: 'Acte', url: 'https://example.org/a' });
    expect(sourceParts(writtenSource('', 'https://example.org/a'))).toEqual({ text: '', url: 'https://example.org/a' });
    expect(sourceParts(writtenSource('Acte de 1854', ''))).toEqual({ text: 'Acte de 1854', url: '' });
    expect(leadCitation({ title: 'https://e.org/', url: 'https://e.org/' })).toEqual({ flat: 'https://e.org/', notes: [] });
  });

  it('takes an old device’s lead edit as sources, adding each once', () => {
    const tree = parseGedcom(old);
    const legacy = {
      t: 'updatePerson',
      id: 'I1',
      patch: {
        leads: [
          { id: 'L9', title: 'Recensement 1906', url: '' },
          { id: 'L1', title: 'Acte de mariage à Conty', url: 'https://example.org/x' },
        ],
      },
    };
    const after = applyOp(tree, legacy as never).tree.individuals.I1!;
    expect(after.citations.map((c) => c.flat)).toEqual([
      'Registre paroissial de Conty',
      'Acte de mariage à Conty\nhttps://example.org/x',
      'https://example.org/y',
      'Cousin Jules, à appeler',
      'Recensement 1906',
    ]);
    expect('leads' in after).toBe(false);
  });

  it('replays an old record patch the way the server’s document now reads', () => {
    const tree = parseGedcom(old);
    const oldRecord = { ...tree.individuals.I1!, citations: [], leads: [{ id: 'L1', title: 'Acte', url: 'https://example.org/x' }] };
    const patched = applyRecordPatch(tree, { t: 'patchRecords', individuals: { I1: oldRecord as never }, families: {}, media: {} });
    expect(patched.individuals.I1!.citations).toEqual([{ flat: 'Acte\nhttps://example.org/x', notes: [] }]);
    expect('leads' in patched.individuals.I1!).toBe(false);
  });
});
