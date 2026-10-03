import { describe, expect, it } from 'vitest';
import { parseGedcom } from '@/gedcom/parse';
import { writtenSource } from '@/gedcom/model';
import { applyOp, ops } from '@/tree/ops';
import { citationText, sourceChange, sourceRows } from './lifeEvents';

const tree = parseGedcom(
  [
    '0 HEAD',
    '0 @I1@ INDI',
    '1 NAME Rosalie /Guérin/',
    '1 BIRT',
    '2 DATE 1852',
    '2 SOUR @S1@',
    '3 PAGE f° 12',
    '1 FAMS @F1@',
    '1 SOUR Livret de famille',
    '1 SOUR Acte de naissance',
    '2 CONT https://example.org/acte',
    '0 @I2@ INDI',
    '1 NAME Jean /Guérin/',
    '1 FAMS @F1@',
    '0 @F1@ FAM',
    '1 HUSB @I2@',
    '1 WIFE @I1@',
    '1 MARR',
    '2 SOUR Registre de Conty',
    '0 @S1@ SOUR',
    '1 TITL Registre paroissial',
    '0 TRLR',
  ].join('\n'),
);
const rosalie = tree.individuals.I1!;

describe('sourceRows', () => {
  it('lists the person’s own sources unlabelled, then their events’ and their unions’', () => {
    const rows = sourceRows(tree, rosalie, 'fr');
    expect(rows.map((r) => [r.label ?? '', citationText(tree, r.citation)])).toEqual([
      ['', 'Livret de famille'],
      ['', 'Acte de naissance — https://example.org/acte'],
      ['Naissance', 'Registre paroissial · f° 12'],
      ['Mariage', 'Registre de Conty'],
    ]);
  });
});

describe('sourceChange', () => {
  const rows = sourceRows(tree, rosalie, 'fr');
  const apply = (change: NonNullable<ReturnType<typeof sourceChange>>) =>
    applyOp(tree, 'person' in change ? ops.updatePerson('I1', change.person) : ops.updateFamily(change.family, change.patch)).tree;

  it('edits a written source in place', () => {
    const next = apply(sourceChange(tree, rosalie, rows[1]!.at, writtenSource('Acte de naissance n° 4', 'https://example.org/acte'))!);
    expect(next.individuals.I1!.citations.map((c) => c.flat)).toEqual([
      'Livret de famille',
      'Acte de naissance n° 4\nhttps://example.org/acte',
    ]);
  });

  it('removes a source from the person, from an event, from a union', () => {
    expect(apply(sourceChange(tree, rosalie, rows[0]!.at, null)!).individuals.I1!.citations).toHaveLength(1);
    const birth = apply(sourceChange(tree, rosalie, rows[2]!.at, null)!).individuals.I1!.events[0]!;
    expect(birth.citations).toEqual([]);
    expect(birth.date).toEqual(rosalie.events[0]!.date);
    expect(apply(sourceChange(tree, rosalie, rows[3]!.at, null)!).families.F1!.events[0]!.citations).toEqual([]);
  });

  it('gives nothing when the event is gone', () => {
    expect(sourceChange(tree, rosalie, { on: 'event', event: 9, index: 0 }, null)).toBeNull();
  });
});
