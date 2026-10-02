import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDate } from '../gedcom/dates';
import { displayName, type Place, type Tree } from '../gedcom/model';
import { parseGedcom } from '../gedcom/parse';
import { serializeGedcom } from '../gedcom/serialize';
import { applyRecordPatch, diffTrees } from './diff';
import { EditError } from './edit';
import { datesAgree, placesAgree, planGraft, type GraftPlan } from './graft';
import { applyOp, describeOp, opSubject, ops, type Op } from './ops';

const fixture = (name: string): Tree =>
  parseGedcom(readFileSync(new URL(`../../fixtures/geneanet/${name}`, import.meta.url), 'utf8'), { repairGeneWeb: true });
const original = fixture('input-fixture.ged');
const geneanet = fixture('export-2026-09-06.ged');

/** The same records as another program would number them: no id survives, so nothing can be matched by id. */
const renumbered = (tree: Tree): Tree => parseGedcom(serializeGedcom(tree).replace(/@([A-Z])([^@\s]*)@/g, '@$1x$2@'));

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

/** Stable serialisation: record maps may change key order, which is not a difference. */
const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, val: unknown) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : val,
  );

const edit = (tree: Tree, list: Op[]): Tree => list.reduce((t, op) => applyOp(t, op).tree, tree);
const named = (tree: Tree, given: string) => Object.values(tree.individuals).find((i) => i.names[0]?.given === given);
const factsOf = (plan: GraftPlan, id: string) =>
  plan.completed.find((c) => c.id === id)?.facts.map((f) => (f.kind === 'event' ? f.event : f.kind));
const place = (text: string): Place => ({ text, parts: text.split(',').map((s) => s.trim()) });

describe('grafting the fixture and its Geneanet export onto each other', () => {
  it('adds nothing when the file is the tree', () => {
    const plan = planGraft(original, original, 'same.ged');
    expect(plan.op).toBeNull();
    expect(plan.recognised).toBe(33);
    expect(plan.differences).toEqual([]);
  });

  it('takes from a Geneanet export only what Geneanet says and the tree did not', () => {
    const plan = planGraft(original, geneanet, 'geneanet.ged');
    expect(plan.added).toEqual([]);
    expect(plan.setAside).toBe(0);
    expect(plan.differences).toEqual([]);
    // Geneanet's reformatted dates and places, flattened citations and slash-less married names add nothing.
    expect(plan.completed).toEqual([]);
    // GeneWeb gives every couple a kind: Sophie's union, unknown in the tree, says « unmarried » there.
    expect(plan.unions).toEqual([{ id: 'F13', facts: [{ kind: 'union' }] }]);
  });

  it('gives a tree imported from Geneanet back what the export dropped', () => {
    const plan = planGraft(geneanet, original, 'original.ged');
    expect(plan.added).toEqual([]);
    expect(plan.differences).toEqual([]);
    expect(factsOf(plan, 'I24')).toEqual(['restriction']);
    expect(factsOf(plan, 'I2')).toEqual(['death', 'media']);
    expect(plan.tree.individuals.I24!.restriction).toBe('privacy');
    expect(plan.tree.individuals.I2!.events.find((e) => e.type === 'death')!.age).toBe('77y');
  });
});

describe('a tree researched further elsewhere', () => {
  // The tree: the fixture as imported, and a child added in Ramure since.
  const testine = ops.addChild('I1', { given: 'Testine' });
  const testineId = testine.t === 'addChild' ? testine.childId : '';
  const tree = edit(original, [testine]);
  // The file: the same family researched elsewhere, exported by a program that numbers records its own way.
  const withDate = (id: string, type: string, change: object) =>
    ops.updatePerson(id, { events: original.individuals[id]!.events.map((e) => (e.type === type ? { ...e, ...change } : e)) });
  const researched = edit(original, [
    ops.addChild('I25', { given: 'Jules', surname: 'FERRAND', sex: 'M' }, 'F11'),
    ops.addParent('I21', 'father', { given: 'Yves' }),
    ops.addParent('I21', 'mother', { given: 'Marie', surname: 'QUÉRÉ' }),
    ops.createPerson({ given: 'Alice', surname: 'ISOLÉE', sex: 'F' }),
    withDate('I13', 'death', { place: place('Plouguerneau, Finistère, Bretagne, France') }),
    withDate('I2', 'birth', { date: parseDate('1922') }),
    ops.updatePerson('I8', { names: [{ given: 'Yvon', surname: 'LENOIR' }] }),
    // Marguerite under other parents: recognised all the same, through her husband and children.
    ops.unlinkChild('F2', 'I1'),
    ops.addParent('I1', 'father', { given: 'Paul', surname: 'GUÉGUEN' }),
    ops.addParent('I1', 'mother', { given: 'Anne', surname: 'CORRE' }),
  ]);
  const file = renumbered(researched);
  const plan = planGraft(tree, file, 'recherches.ged');

  it('recognises everyone the tree had and adds only the new people', () => {
    expect(plan.recognised).toBe(33);
    expect(plan.added.map((id) => displayName(plan.tree.individuals[id]!)).sort()).toEqual([
      'Alice ISOLÉE',
      'Jules FERRAND',
      'Marie QUÉRÉ',
      'Yves LENOIR',
    ]);
  });

  it('keeps everything only the tree had, untouched', () => {
    expect(plan.tree.individuals[testineId]).toBe(tree.individuals[testineId]);
    expect(plan.tree.families.F5!.childIds).toContain(testineId);
    for (const id of Object.keys(tree.individuals)) expect(plan.tree.individuals[id]).toBeDefined();
    for (const id of Object.keys(tree.families))
      expect(plan.tree.families[id]!.childIds).toEqual(expect.arrayContaining(tree.families[id]!.childIds));
  });

  it('links the new people where the file has them', () => {
    const jules = named(plan.tree, 'Jules')!;
    expect(jules.childOf).toEqual([{ familyId: 'F11', pedigree: 'birth' }]);
    expect(plan.tree.families.F11!.childIds).toContain(jules.id);
    const [link] = plan.tree.individuals.I21!.childOf;
    const parents = plan.tree.families[link!.familyId]!;
    expect(displayName(plan.tree.individuals[parents.husbandId!]!)).toBe('Yves LENOIR');
    expect(displayName(plan.tree.individuals[parents.wifeId!]!)).toBe('Marie QUÉRÉ');
    expect(plan.tree.individuals[parents.husbandId!]!.partnerIn).toEqual([parents.id]);
  });

  it('fills blanks, and lists a disagreement without applying it', () => {
    expect(plan.tree.individuals.I13!.events.find((e) => e.type === 'death')!.place?.text).toBe(
      'Plouguerneau, Finistère, Bretagne, France',
    );
    expect(plan.tree.individuals.I8!.names[0]!.given).toBe('Yvon');
    expect(plan.tree.individuals.I2!.events.find((e) => e.type === 'birth')!.date!.raw).toBe('4 FEB 1921');
    expect(plan.differences).toContainEqual(
      expect.objectContaining({
        subject: { person: 'I2' },
        what: 'date',
        event: 'birth',
        inFile: expect.objectContaining({ raw: '1922' }),
      }),
    );
  });

  it('never gives anyone a second set of birth parents: that branch stays out, and is named', () => {
    expect(plan.tree.individuals.I1!.childOf).toEqual(tree.individuals.I1!.childOf);
    expect(plan.differences).toContainEqual({ subject: { person: 'I1' }, what: 'parents', inFile: ['Paul GUÉGUEN', 'Anne CORRE'] });
    expect(plan.setAside).toBe(2);
    expect(Object.values(plan.tree.individuals).map(displayName)).not.toContain('Paul GUÉGUEN');
  });

  it('says what each recognised person gained', () => {
    expect(factsOf(plan, 'I13')).toEqual(['death']);
    expect(factsOf(plan, 'I21')).toEqual(['parents']);
    expect(factsOf(plan, 'I8')).toEqual(['name']);
    expect(factsOf(plan, 'I25')).toEqual(['child']);
    expect(factsOf(plan, 'I28')).toEqual(['child']);
    expect(factsOf(plan, 'I1')).toBeUndefined();
    expect(factsOf(plan, 'I2')).toBeUndefined();
  });

  it('is one op that replays to the same tree over the wire, and undoes exactly', () => {
    const op = JSON.parse(JSON.stringify(plan.op)) as Op;
    const after = applyOp(tree, op).tree;
    expect(stable(after)).toBe(stable(plan.tree));
    expect(stable(applyRecordPatch(after, diffTrees(after, tree)))).toBe(stable(tree));
    expect(describeOp(op, 'fr')).toBe('Arbre complété depuis un GEDCOM');
    expect(opSubject(op, { tree: after })).toBeUndefined();
  });

  it('adds nothing the second time round', () => {
    const again = planGraft(plan.tree, file, 'recherches.ged');
    expect(again.op).toBeNull();
    expect(again.recognised).toBe(37);
    expect(again.setAside).toBe(2);
  });

  it('is refused over a person somebody changed after it was planned', () => {
    const moved = applyOp(tree, ops.updatePerson('I13', { notes: ['changé entre-temps'] })).tree;
    expect(() => applyOp(moved, plan.op!)).toThrow(EditError);
  });
});

describe('what comes with a citation or a picture', () => {
  const tree = ged(`
    0 @I1@ INDI
    1 NAME Jean /MARTIN/
    1 BIRT
    2 DATE 1850
    2 SOUR @S1@
    3 PAGE acte 12
    0 @S1@ SOUR
    1 TITL État civil de Brest`);

  it('brings the sources a new citation needs, and reuses the tree’s own', () => {
    const file = ged(`
      0 @P1@ INDI
      1 NAME Jean /MARTIN/
      1 BIRT
      2 DATE 1850
      2 SOUR @S7@
      3 PAGE acte 12
      1 DEAT
      2 DATE 1910
      2 SOUR @S8@
      3 PAGE acte 3
      0 @S7@ SOUR
      1 TITL État civil de Brest
      0 @S8@ SOUR
      1 TITL État civil de Quimper
      1 REPO @R1@
      0 @R1@ REPO
      1 NAME Archives du Finistère`);
    const plan = planGraft(tree, file, 'sources.ged');
    const jean = plan.tree.individuals.I1!;
    expect(jean.events.find((e) => e.type === 'birth')!.citations).toHaveLength(1);
    const cited = plan.tree.sources[jean.events.find((e) => e.type === 'death')!.citations[0]!.sourceId!]!;
    expect(cited.title).toBe('État civil de Quimper');
    expect(plan.tree.repositories[cited.repositoryId!]!.name).toBe('Archives du Finistère');
    expect(Object.keys(plan.tree.sources)).toHaveLength(2);
    // Undoing the graft takes the source back out with the death it came for.
    const undone = applyRecordPatch(plan.tree, diffTrees(plan.tree, tree));
    expect(Object.keys(undone.sources)).toEqual(['S1']);
    expect(Object.keys(undone.repositories)).toEqual([]);
  });

  it('knows a citation Geneanet wrote out as text', () => {
    const file = ged(`
      0 @P1@ INDI
      1 NAME Jean /MARTIN/
      1 BIRT
      2 DATE 1850
      2 SOUR État civil de Brest - Mairie - acte 12`);
    expect(planGraft(tree, file, 'geneanet.ged').op).toBeNull();
  });

  it('brings a picture from the web, never one another Ramure tree stored', () => {
    const file = ged(`
      0 @P1@ INDI
      1 NAME Jean /MARTIN/
      1 BIRT
      2 DATE 1850
      1 OBJE @M1@
      1 OBJE @M2@
      0 @M1@ OBJE
      1 FILE https://example.org/jean.jpg
      0 @M2@ OBJE
      1 FILE ramure:Mabcdefghijk`);
    const plan = planGraft(tree, file, 'photos.ged');
    const ids = plan.tree.individuals.I1!.mediaIds;
    expect(ids.map((id) => plan.tree.media[id]!.file)).toEqual(['https://example.org/jean.jpg']);
  });
});

describe('the graft op', () => {
  const empty = { t: 'graft', file: 'x.ged', individuals: {}, families: {}, sources: {}, repositories: {}, media: {}, expect: {} };

  it('only ever adds: a removal, or a record filed under another id, is refused', () => {
    expect(() => applyOp(original, { ...empty, individuals: { I1: null } } as unknown as Op)).toThrow(EditError);
    expect(() => applyOp(original, { ...empty, individuals: { I1: original.individuals.I2 } } as unknown as Op)).toThrow(EditError);
    expect(() => applyOp(original, { ...empty, sources: undefined } as unknown as Op)).toThrow(EditError);
  });
});

describe('agreement between two accounts', () => {
  it('reads past formatting and vagueness, but not past other years or other days', () => {
    const agree = (a: string, b: string) => datesAgree(parseDate(a), parseDate(b));
    expect(agree('FROM 1973 TO 2012', 'BET 1973 AND 2012')).toBe(true);
    expect(agree('2 OCT 1949', '02 OCT 1949')).toBe(true);
    expect(agree('1949', '2 OCT 1949')).toBe(true);
    expect(agree('ABT 1863', '1862')).toBe(true);
    expect(agree('@#DFRENCH R@ 15 VEND 3', '6 OCT 1794')).toBe(true);
    expect(agree('1850', '1851')).toBe(false);
    expect(agree('2 OCT 1949', '3 OCT 1949')).toBe(false);
    expect(agree('2 OCT 1949', '2 NOV 1949')).toBe(false);
    expect(datesAgree(undefined, parseDate('1850'))).toBe(true);
  });

  it('takes a place written with more or fewer parts for the same place', () => {
    expect(placesAgree(place(', Quimper, Finistère, Bretagne, France'), place('Quimper, Finistère, Bretagne, France'))).toBe(true);
    expect(placesAgree(place('Kerguelen, Plouguerneau, Finistère'), place('Plouguerneau, Finistère'))).toBe(true);
    expect(placesAgree(place('Brest'), place('Quimper'))).toBe(false);
    expect(placesAgree(undefined, place('Brest'))).toBe(true);
  });
});
