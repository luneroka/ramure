import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDate } from '../gedcom/dates';
import type { Tree } from '../gedcom/model';
import { parseGedcom } from '../gedcom/parse';
import { serializeGedcom } from '../gedcom/serialize';
import { matchTrees, yearFit, yearSpan } from './match';
import { applyOp, ops } from './ops';

const fixture = (name: string): Tree =>
  parseGedcom(readFileSync(new URL(`../../fixtures/geneanet/${name}`, import.meta.url), 'utf8'), { repairGeneWeb: true });
const original = fixture('input-fixture.ged');
const geneanet = fixture('export-2026-09-06.ged');

/** The same records as another program would number them: no id survives, so nothing can be matched by id. */
const renumbered = (tree: Tree): Tree => parseGedcom(serializeGedcom(tree).replace(/@([A-Z])([^@\s]*)@/g, '@$1x$2@'));

/** A small file written inline, one GEDCOM line per line. */
const ged = (body: string): Tree =>
  parseGedcom(
    [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 5.5.1',
      ...body
        .trim()
        .split('\n')
        .map((l) => l.trim()),
      '0 TRLR',
    ].join('\n'),
  );

describe('matchTrees', () => {
  it('recognises every person and family of a Geneanet export, though Geneanet renumbered the families', () => {
    const m = matchTrees(original, geneanet);
    expect(m.people.size).toBe(33);
    // Geneanet kept the person numbers of this file, by the luck of its order; the families it did not.
    for (const [fileId, treeId] of m.people) expect(treeId).toBe(fileId);
    expect(m.families.size).toBe(13);
    for (const [fileId, treeId] of m.families) {
      const theirs = geneanet.families[fileId]!;
      const mine = original.families[treeId]!;
      expect([mine.husbandId, mine.wifeId]).toEqual([theirs.husbandId, theirs.wifeId]);
    }
    expect(m.families.get('F1')).toBe('F2');
  });

  it('needs no ids: the same tree under other numbers is recognised the same', () => {
    const m = matchTrees(original, renumbered(geneanet));
    expect(m.people.size).toBe(33);
    for (const [fileId, treeId] of m.people) expect(treeId).toBe(fileId.replace('x', ''));
  });

  it('tells two Jean LENOIR apart by the years of their lives', () => {
    const m = matchTrees(original, renumbered(original));
    expect(m.people.get('Ix21')).toBe('I21');
    expect(m.people.get('Ix23')).toBe('I23');
  });

  it('places the deliberate duplicate only once her original was found through her family', () => {
    // Rosalie GUÉRIN (I14) and her accentless double (I33) fit each other's dates, so neither is certain alone.
    const m = matchTrees(original, renumbered(original));
    expect(m.people.get('Ix14')).toBe('I14');
    expect(m.people.get('Ix33')).toBe('I33');
  });

  it('leaves a doubtful pair alone rather than guess', () => {
    const tree = ged(`
      0 @A@ INDI
      1 NAME Marie /DURAND/
      1 BIRT
      2 DATE 1850
      0 @B@ INDI
      1 NAME Marie /DURAND/
      1 BIRT
      2 DATE 1851`);
    const file = ged(`
      0 @X@ INDI
      1 NAME Marie /DURAND/
      1 BIRT
      2 DATE 1850`);
    expect(matchTrees(tree, file).people.size).toBe(0);
  });

  it('does not take a name and a year for a person when the parents are plainly other people', () => {
    const tree = ged(`
      0 @C@ INDI
      1 NAME Jean /MARTIN/
      1 SEX M
      1 BIRT
      2 DATE 1850
      1 FAMC @F@
      0 @P@ INDI
      1 NAME Pierre /MARTIN/
      1 SEX M
      1 FAMS @F@
      0 @F@ FAM
      1 HUSB @P@
      1 CHIL @C@`);
    const file = ged(`
      0 @C@ INDI
      1 NAME Jean /MARTIN/
      1 SEX M
      1 BIRT
      2 DATE 1850
      1 FAMC @F@
      0 @P@ INDI
      1 NAME Louis /MARTIN/
      1 SEX M
      1 FAMS @F@
      0 @F@ FAM
      1 HUSB @P@
      1 CHIL @C@`);
    expect(matchTrees(tree, file).people.size).toBe(0);
  });

  it('tells two sisters of one name apart by their years', () => {
    // A daughter who died young and the next given her name: in the family, both fit; the year decides.
    const family = ged(`
      0 @P@ INDI
      1 NAME Hervé /CALVEZ/
      1 SEX M
      1 BIRT
      2 DATE 1705
      1 FAMS @F@
      0 @A@ INDI
      1 NAME Marie /CALVEZ/
      1 SEX F
      1 BIRT
      2 DATE 1736
      1 FAMC @F@
      0 @B@ INDI
      1 NAME Marie /CALVEZ/
      1 SEX F
      1 BIRT
      2 DATE 1738
      1 FAMC @F@
      0 @F@ FAM
      1 HUSB @P@
      1 CHIL @A@
      1 CHIL @B@`);
    const m = matchTrees(family, renumbered(family));
    expect(m.people.get('Ax')).toBe('A');
    expect(m.people.get('Bx')).toBe('B');
  });

  it('finds parents through a recognised child, past a respelled surname', () => {
    const family = (surname: string) =>
      ged(`
      0 @C@ INDI
      1 NAME Yann /LE GALL/
      1 SEX M
      1 BIRT
      2 DATE 1900
      1 FAMC @F@
      0 @P@ INDI
      1 NAME Hervé /${surname}/
      1 SEX M
      1 FAMS @F@
      0 @M@ INDI
      1 NAME Anne /KERJEAN/
      1 SEX F
      1 FAMS @F@
      0 @F@ FAM
      1 HUSB @P@
      1 WIFE @M@
      1 CHIL @C@`);
    const m = matchTrees(family('LE GALL'), renumbered(family('LE GAL')));
    expect(m.people.get('Cx')).toBe('C');
    expect(m.people.get('Px')).toBe('P');
    expect(m.people.get('Mx')).toBe('M');
    expect(m.families.get('Fx')).toBe('F');
  });

  it('brings a Ramure export home by its own ids, even after a rename elsewhere', () => {
    const create = ops.createPerson({ given: 'Testine', surname: 'LENOIR', sex: 'F' });
    const id = create.t === 'createPerson' ? create.id : '';
    const tree = applyOp(original, create).tree;
    const edited = applyOp(tree, ops.updatePerson(id, { names: [{ given: 'Ernestine', surname: 'LENOIR' }] })).tree;
    expect(matchTrees(tree, parseGedcom(serializeGedcom(edited))).people.get(id)).toBe(id);
  });

  it('recognises somebody nobody is linked to by full name alone, but never somebody with a family', () => {
    const lone = `
      0 @A@ INDI
      1 NAME Alice /ISOLÉE/`;
    expect(matchTrees(ged(lone), ged(lone.replace('@A@', '@B@'))).people.get('B')).toBe('A');
    const married = `
      0 @A@ INDI
      1 NAME Alice /ISOLÉE/
      1 FAMS @F@
      0 @F@ FAM
      1 WIFE @A@`;
    expect(matchTrees(ged(married), ged(lone.replace('@A@', '@B@'))).people.size).toBe(0);
  });
});

describe('dates as spans of years', () => {
  it('widens estimates, opens ranges and reads the Republican calendar', () => {
    expect(yearSpan(parseDate('ABT 1850'))).toEqual({ lo: 1848, hi: 1852, exact: false });
    expect(yearSpan(parseDate('BEF 1860'))).toEqual({ lo: -Infinity, hi: 1860, exact: false });
    expect(yearSpan(parseDate('AFT 1860'))).toEqual({ lo: 1860, hi: Infinity, exact: false });
    expect(yearSpan(parseDate('BET 1857 AND 1859'))).toEqual({ lo: 1857, hi: 1859, exact: false });
    expect(yearSpan(parseDate('@#DFRENCH R@ 15 VEND 3'))?.lo).toBe(1794);
    expect(yearSpan(parseDate('(pendant la guerre)'))).toBeUndefined();
    expect(yearSpan(undefined)).toBeUndefined();
  });

  it('allows a couple of years between two accounts of one life, not more', () => {
    const fit = (a: string, b: string) => yearFit(yearSpan(parseDate(a)), yearSpan(parseDate(b)));
    expect(fit('1850', '1850')).toBe('same');
    expect(fit('1850', '1852')).toBe('near');
    expect(fit('1850', '1853')).toBe('conflict');
    expect(fit('BEF 1860', '1855')).toBe('near');
    expect(fit('BEF 1860', '1870')).toBe('conflict');
    expect(yearFit(undefined, yearSpan(parseDate('1850')))).toBe('unknown');
  });
});
