import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../gedcom/parse';
import { serializeGedcom } from '../gedcom/serialize';
import { displayName, type Tree } from '../gedcom/model';
import { addChild, addParent, addPartner, addSibling, deletePerson, linkPartner, mergePeople, newTree, nextId, unlinkChild, updatePerson } from './edit';

const base = parseGedcom(readFileSync(new URL('../../fixtures/geneanet/input-fixture.ged', import.meta.url), 'utf8'));

/** Every link must be symmetric after any edit. */
function assertConsistent(tree: Tree): void {
  for (const ind of Object.values(tree.individuals)) {
    for (const l of ind.childOf) expect(tree.families[l.familyId]?.childIds, `${ind.id} childOf ${l.familyId}`).toContain(ind.id);
    for (const f of ind.partnerIn) { const fam = tree.families[f]!; expect([fam.husbandId, fam.wifeId], `${ind.id} partnerIn ${f}`).toContain(ind.id); }
  }
  for (const fam of Object.values(tree.families)) {
    for (const c of fam.childIds) expect(tree.individuals[c]?.childOf.map((l) => l.familyId), `${fam.id} child ${c}`).toContain(fam.id);
    for (const p of [fam.husbandId, fam.wifeId]) if (p) expect(tree.individuals[p]?.partnerIn, `${fam.id} partner ${p}`).toContain(fam.id);
    expect(fam.husbandId || fam.wifeId || fam.childIds.length, `${fam.id} empty`).toBeTruthy();
  }
}

describe('edit operations', () => {
  it('does not mutate the input tree', () => {
    const before = JSON.stringify(base);
    addChild(base, 'I1');
    addParent(base, 'I33', 'father');
    deletePerson(base, 'I2');
    expect(JSON.stringify(base)).toBe(before);
  });

  it('adds a child to a couple, with the father\'s surname', () => {
    const r = addChild(base, 'I1', { given: 'Paul' });
    const child = r.tree.individuals[r.focusId!]!;
    expect(displayName(child)).toBe('Paul AUBRY');
    expect(child.childOf).toEqual([{ familyId: 'F5', pedigree: 'birth' }]);
    expect(r.tree.families['F5']!.childIds).toContain(child.id);
    assertConsistent(r.tree);
  });

  it('adds a child to a person without a family by creating one', () => {
    const r = addChild(base, 'I33', { given: 'Anna' });
    const fam = Object.values(r.tree.families).find((f) => f.wifeId === 'I33')!;
    expect(fam.childIds).toEqual([r.focusId]);
    assertConsistent(r.tree);
  });

  it('refuses to guess between two families', () => {
    expect(() => addChild(base, 'I2')).toThrow('choose a family');
    const r = addChild(base, 'I2', {}, 'F1');
    expect(r.tree.families['F1']!.childIds).toHaveLength(2);
  });

  it('adds parents into the free slots of the birth family', () => {
    const r1 = addParent(base, 'I31', 'mother', { given: 'Camille', surname: 'ROY' }); // Inès has a father only
    const fam = r1.tree.families['F12']!;
    expect(fam.wifeId).toBe(r1.focusId);
    expect(() => addParent(r1.tree, 'I31', 'mother')).toThrow('already has a mother');
    const r2 = addParent(base, 'I33', 'father'); // Rosalie GUERIN has no family at all
    const f2 = r2.tree.individuals['I33']!.childOf[0]!.familyId;
    expect(r2.tree.families[f2]!.husbandId).toBe(r2.focusId);
    expect(displayName(r2.tree.individuals[r2.focusId!]!)).toBe('GUERIN');
    assertConsistent(r1.tree);
    assertConsistent(r2.tree);
  });

  it('adds a partner in a new family and a sibling in birth order', () => {
    const p = addPartner(base, 'I5', { given: 'Anne', surname: 'DUVAL' });
    const fam = Object.values(p.tree.families).find((f) => f.husbandId === 'I5')!;
    expect(fam.wifeId).toBe(p.focusId);
    expect(p.tree.individuals[p.focusId!]!.sex).toBe('F');
    const s = addSibling(base, 'I1', { given: 'Louis' });
    expect(s.tree.families['F2']!.childIds).toContain(s.focusId);
    expect(s.tree.individuals[s.focusId!]!.names[0]!.surname).toBe('LENOIR');
    assertConsistent(p.tree);
    assertConsistent(s.tree);
  });

  it('deletes a person and cleans up families', () => {
    const r = deletePerson(base, 'I24'); // Michel, Marguerite's ex-husband
    expect(r.tree.individuals['I24']).toBeUndefined();
    expect(r.tree.families['F5']!.husbandId).toBeUndefined();
    expect(r.tree.families['F5']!.childIds).toHaveLength(3);
    expect(r.focusId).toBe('I1');
    assertConsistent(r.tree);
    const r2 = deletePerson(r.tree, 'I1');
    assertConsistent(r2.tree);
  });

  it('unlinks a child and drops the empty family', () => {
    const r = unlinkChild(base, 'F13', 'I32');
    expect(r.tree.families['F13']!.wifeId).toBe('I27');
    expect(r.tree.individuals['I32']!.childOf).toEqual([]);
    assertConsistent(r.tree);
  });

  it('links two existing people as partners once', () => {
    const r = linkPartner(base, 'I5', 'I33');
    const again = linkPartner(r.tree, 'I5', 'I33');
    expect(Object.keys(again.tree.families)).toHaveLength(Object.keys(base.families).length + 1);
    assertConsistent(again.tree);
  });

  it('merges the deliberate duplicate into the original', () => {
    const r = mergePeople(base, 'I14', 'I33');
    expect(r.tree.individuals['I33']).toBeUndefined();
    const rosalie = r.tree.individuals['I14']!;
    expect(rosalie.names).toHaveLength(2); // GUÉRIN and GUERIN kept as alternates
    expect(rosalie.events.filter((e) => e.type === 'birth')).toHaveLength(2); // 1862 and ABT 1863, different dates
    expect(rosalie.notes.some((n) => n.includes('DOUBLON'))).toBe(true);
    assertConsistent(r.tree);
  });

  it('merges families that describe the same couple', () => {
    // Give Henri a duplicate "Jeanne" with her own family with Henri, then merge the Jeannes.
    const p = addPartner(base, 'I2', { given: 'Jeanne', surname: 'MARCHAL', sex: 'F' });
    const dupId = p.focusId!;
    const c = addChild(p.tree, dupId, { given: 'Extra' });
    const r = mergePeople(c.tree, 'I3', dupId);
    const fams = r.tree.individuals['I3']!.partnerIn.map((f) => r.tree.families[f]!).filter((f) => f.husbandId === 'I2');
    expect(fams).toHaveLength(1);
    expect(fams[0]!.childIds).toContain(c.focusId);
    assertConsistent(r.tree);
  });

  it('updates a person and round-trips through GEDCOM', () => {
    const r = updatePerson(base, 'I1', { names: [{ given: 'Marguerite Anne', surname: 'LENOIR' }], restriction: 'privacy' });
    const again = parseGedcom(serializeGedcom(r.tree));
    expect(displayName(again.individuals['I1']!)).toBe('Marguerite Anne LENOIR');
    expect(again.individuals['I1']!.restriction).toBe('privacy');
  });

  it('starts a new tree and allocates ids past the maximum', () => {
    const r = newTree('Jean', 'DUPONT', 'M');
    expect(r.focusId).toBe('I1');
    expect(nextId(base, 'I')).toBe('I34');
    expect(nextId(base, 'F')).toBe('F14');
  });
});
