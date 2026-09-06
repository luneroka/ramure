/**
 * Tests against the real fixtures from phase 0: the hand-written input and
 * the file Geneanet gave back.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { displayName, findEvent, type Tree } from './model';
import { parseGedcom } from './parse';
import { serializeGedcom } from './serialize';

const fixture = (name: string): string => readFileSync(new URL(`../../fixtures/geneanet/${name}`, import.meta.url), 'utf8');
const input = parseGedcom(fixture('input-fixture.ged'));
const exported = parseGedcom(fixture('export-2026-09-06.ged'));

const byName = (tree: Tree, name: string) => {
  const hit = Object.values(tree.individuals).find((i) => displayName(i) === name);
  if (!hit) throw new Error(`No individual named ${name}`);
  return hit;
};

describe('input fixture (our own GEDCOM)', () => {
  it('has every record', () => {
    expect(Object.keys(input.individuals)).toHaveLength(33);
    expect(Object.keys(input.families)).toHaveLength(13);
    expect(Object.keys(input.sources)).toHaveLength(2);
    expect(Object.keys(input.repositories)).toHaveLength(1);
    expect(Object.keys(input.media)).toHaveLength(1);
    expect(input.importNotes.filter((n) => n.code === 'tokenize')).toEqual([]);
  });

  it('keeps structured details', () => {
    const henri = byName(input, 'Henri Marie LENOIR');
    const birth = findEvent(henri.events, 'birth')!;
    expect(birth.place?.parts).toEqual(['Kerguelen', 'Plouguerneau', 'Finistère', 'Bretagne', 'France']);
    expect(birth.place?.lat).toBeCloseTo(48.6064);
    expect(birth.place?.lon).toBeCloseTo(-4.5033);
    expect(birth.citations[0]).toMatchObject({ sourceId: 'S1', quality: 3, page: expect.stringContaining('acte n° 17') });
    expect(findEvent(henri.events, 'death')?.cause).toBe('Insuffisance cardiaque');
    expect(henri.notes[0]).toContain('Note partagée');
    expect(henri.mediaIds).toEqual(['O1']);
    expect(byName(input, 'Michel AUBRY').restriction).toBe('privacy');
    expect(byName(input, 'Sophie AUBRY').childOf).toEqual([{ familyId: 'F5', pedigree: 'adopted' }]);
  });

  it('parses names with GIVN/SURN, married names and empty given names', () => {
    const jeanne = byName(input, 'Jeanne MARCHAL');
    expect(jeanne.names[1]).toMatchObject({ given: 'Jeanne', surname: 'LENOIR', type: 'married' });
    const stillborn = input.individuals['I8']!;
    expect(stillborn.names[0]).toMatchObject({ given: '', surname: 'LENOIR' });
    expect(stillborn.sex).toBe('U');
    expect(displayName(stillborn)).toBe('LENOIR');
  });

  it('round-trips through serialize without loss', () => {
    const text = serializeGedcom(input, { date: new Date(2026, 8, 6) });
    const again = parseGedcom(text);
    // Line numbers of preserved raw records legitimately move; nothing else may.
    const strip = (t: Tree) =>
      JSON.parse(
        JSON.stringify(
          { ...t, header: { ...t.header, date: undefined, sourceVersion: undefined, sourceSystem: undefined }, importNotes: [] },
          (k, v) => (k === 'line' ? undefined : v),
        ),
      );
    expect(strip(again)).toEqual(strip(input));
    // Nothing longer than the spec allows.
    for (const line of text.split('\n')) expect(line.length).toBeLessThanOrEqual(255);
  });
});

describe('Geneanet export (GeneWeb dialect)', () => {
  it('is recognised and parsed completely', () => {
    expect(exported.header.sourceSystem).toBe('Geneanet');
    expect(exported.importNotes.some((n) => n.code === 'geneweb')).toBe(true);
    expect(Object.keys(exported.individuals)).toHaveLength(33);
    expect(exported.importNotes.filter((n) => n.code === 'tokenize')).toEqual([]);
  });

  it('repairs the adoption and drops the duplicate family', () => {
    const sophie = byName(exported, 'Sophie AUBRY');
    const marguerite = byName(exported, 'Marguerite LENOIR');
    const michel = byName(exported, 'Michel AUBRY');
    const parents = Object.values(exported.families).filter((f) => f.husbandId === michel.id && f.wifeId === marguerite.id);
    expect(parents).toHaveLength(1);
    expect(parents[0]!.childIds).toContain(sophie.id);
    expect(sophie.childOf).toEqual([{ familyId: parents[0]!.id, pedigree: 'adopted' }]);
    expect(sophie.notes[0]).not.toContain('Pedigree linkage');
    expect(exported.importNotes.some((n) => n.code === 'adoption-repaired')).toBe(true);
  });

  it('drops the parentless placeholder family around the duplicate Rosalie', () => {
    const rosalie = byName(exported, 'Rosalie GUERIN');
    expect(rosalie.childOf).toEqual([]);
    expect(Object.values(exported.families).every((f) => f.husbandId || f.wifeId)).toBe(true);
    // 13 in, 15 out of Geneanet, 13 after repair.
    expect(Object.keys(exported.families)).toHaveLength(13);
  });

  it('lifts cause, address and unknown given name', () => {
    const henri = byName(exported, 'Henri Marie LENOIR');
    const death = findEvent(henri.events, 'death')!;
    expect(death.cause).toBe('Insuffisance cardiaque');
    expect(death.notes).toEqual([]);
    const marguerite = byName(exported, 'Marguerite LENOIR');
    expect(findEvent(marguerite.events, 'residence')?.address).toBe('Brest, 29200, France');
    expect(exported.individuals['I8']!.names[0]).toMatchObject({ given: '', surname: 'LENOIR' });
  });

  it('merges the duplicated occupation', () => {
    const marguerite = byName(exported, 'Marguerite LENOIR');
    const occ = marguerite.events.filter((e) => e.type === 'occupation');
    expect(occ).toHaveLength(1);
    expect(occ[0]).toMatchObject({ value: 'Institutrice', date: { kind: 'between' } });
  });

  it('maps the unmarried relation kind to the union type', () => {
    const sophie = byName(exported, 'Sophie AUBRY');
    const fam = exported.families[sophie.partnerIn[0]!]!;
    expect(fam.unionType).toBe('unmarried');
    expect(fam.events).toEqual([]);
  });

  it('keeps flat citations verbatim', () => {
    const henri = byName(exported, 'Henri Marie LENOIR');
    const c = findEvent(henri.events, 'birth')!.citations[0]!;
    expect(c.sourceId).toBeUndefined();
    expect(c.flat).toContain('acte n° 17');
  });

  it('agrees with the input on everything Geneanet kept', () => {
    for (const ind of Object.values(input.individuals)) {
      const twin = exported.individuals[ind.id]!;
      expect(displayName(twin)).toBe(displayName(ind));
      for (const type of ['birth', 'death', 'burial', 'baptism'] as const) {
        const a = findEvent(ind.events, type),
          b = findEvent(twin.events, type);
        expect(!!a).toBe(!!b);
        if (a && b && a.date && a.date.kind !== 'calculated' && a.date.kind !== 'from-to') {
          expect(b.date?.date?.year).toBe(a.date.date?.year);
        }
      }
    }
  });
});
