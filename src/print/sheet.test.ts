import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDate } from '@/gedcom/dates';
import { newFamily, newIndividual, type Tree } from '@/gedcom/model';
import { parseGedcom } from '@/gedcom/parse';
import { eventRows } from '@/app/lib/lifeEvents';
import { personSheet, shortPlace, type SheetOptions } from './sheet';

/**
 * What the person sheet says about the fixture family. Henri has two marriages
 * and grandchildren; Marguerite has a half-brother, a husband the file marks
 * private, and an adopted daughter — between them they reach every rule.
 */

const load = () => parseGedcom(readFileSync('fixtures/geneanet/input-fixture.ged', 'utf8'));
const tree = load();
const opts = (o: Partial<SheetOptions> = {}): SheetOptions => ({
  lang: 'fr',
  discreet: false,
  notes: true,
  sources: true,
  leads: false,
  ...o,
});
const sheetOf = (id: string, o?: Partial<SheetOptions>, t: Tree = tree) => personSheet(t, id, opts(o))!;

describe('the person sheet', () => {
  it('writes the subject out in full, in sentences', () => {
    const s = sheetOf('I2').subject;
    expect(s.given).toBe('Henri Marie');
    expect(s.surname).toBe('LENOIR');
    expect(s.occupation).toBe('Marin-pêcheur');
    expect(s.lines).toEqual(['Né le 4 févr. 1921 à Kerguelen, Plouguerneau', 'Décédé le 17 nov. 1998 à Brest, Finistère, à 77 ans']);
    expect(s.filiation).toBe('Fils d’Auguste LENOIR et de Marie BRÉHIER');
  });

  it('says it in English too', () => {
    const s = sheetOf('I2', { lang: 'en' }).subject;
    expect(s.lines).toEqual(['Born on 4 Feb 1921 in Kerguelen, Plouguerneau', 'Died on 17 Nov 1998 in Brest, Finistère, aged 77']);
    expect(s.filiation).toBe('Son of Auguste LENOIR and Marie BRÉHIER');
  });

  it('gives the parents and their marriage, and stops there', () => {
    const [couple, ...more] = sheetOf('I2').parents;
    expect(more).toEqual([]);
    expect(couple!.slots.map((p) => [p.role, p.person?.name])).toEqual([
      ['Père', 'Auguste LENOIR'],
      ['Mère', 'Marie BRÉHIER'],
    ]);
    expect(couple!.slots[0].person!.facts).toEqual(['Né en 1889 à Plouguerneau, Finistère', 'Décédé en 1954 à Plouguerneau, Finistère']);
    expect(couple!.slots[0].person!.occupation).toBe('Cultivateur');
    expect(couple!.union).toEqual(['Mariés en 1919 à Plouguerneau, Finistère']);
  });

  it('lists each union in date order, its children oldest first, their spouses and the grandchildren', () => {
    const unions = sheetOf('I2').unions;
    expect(unions.map((u) => [u.partner?.name, u.union])).toEqual([
      ['Yvonne KERGOAT', ['Mariés en 1943 à Brest, Finistère']],
      ['Jeanne MARCHAL', ['Mariés le 12 juin 1948 à Quimper, Finistère']],
    ]);
    expect(unions[1]!.partner!.occupation).toBe('Couturière');
    const kids = unions[1]!.children;
    expect(kids.map((k) => k.name)).toEqual(['LENOIR', 'Marguerite «\u00a0Margot\u00a0» LENOIR', 'Yvonne LENOIR', 'Yves LENOIR']);
    const marguerite = kids[1]!;
    expect(marguerite.facts).toEqual(['Née le 12 mars 1952 à Quimper, Finistère']);
    expect(marguerite.unions).toEqual(['Mariée à Michel AUBRY']);
    expect(marguerite.children.map((m) => `${m.name} (${m.life})`)).toEqual([
      'Claire AUBRY (née en 1976)',
      'Thomas AUBRY (né en 1979)',
      'Sophie AUBRY (née en 1984)',
    ]);
  });

  it('puts the subject among the siblings in birth order, half-siblings tagged with their side', () => {
    const sibs = sheetOf('I1').siblings;
    expect(sibs.map((s) => s.name)).toEqual([
      'Robert LENOIR',
      'LENOIR',
      'Marguerite «\u00a0Margot\u00a0» LENOIR',
      'Yvonne LENOIR',
      'Yves LENOIR',
    ]);
    expect(sibs[0]!.tag).toBe('demi-frère par le père');
    expect(sibs[2]).toMatchObject({ self: true, facts: ['cette fiche'] });
    expect(sheetOf('I2').siblings).toEqual([]);
  });

  it('names a half-sibling on the mother’s side too', () => {
    const t = load();
    const jeanne = t.individuals.I3!;
    const other = { ...newFamily('F99'), wifeId: 'I3', childIds: ['I99'] };
    const paul = {
      ...newIndividual('I99'),
      sex: 'M' as const,
      names: [{ given: 'Paul', surname: 'DURAND' }],
      childOf: [{ familyId: 'F99', pedigree: 'birth' as const }],
    };
    t.families.F99 = other;
    t.individuals.I99 = paul;
    jeanne.partnerIn.push('F99');
    const half = sheetOf('I1', {}, t).siblings.find((s) => s.id === 'I99');
    expect(half?.tag).toBe('demi-frère par la mère');
  });

  it('names nephews and nieces under the sibling they belong to', () => {
    const thomas = sheetOf('I25').siblings.find((s) => s.name === 'Thomas AUBRY')!;
    expect(thomas.children.map((m) => `${m.name} (${m.life})`)).toEqual(['Inès AUBRY (née en 2010)']);
  });

  it('keeps the living to a name and a birth year with discretion, and never the subject', () => {
    const s = sheetOf('I1', { discreet: true });
    expect(s.subject.lines).toEqual(['Née le 12 mars 1952 à Quimper, Finistère']);
    const robert = s.siblings[0]!;
    expect(robert).toMatchObject({ facts: ['Né en 1944'], reduced: true });
    // The stillborn child is not living: nothing is held back. Their sex is unknown, and the words say so.
    expect(s.siblings[1]!.facts).toEqual(['Né·e le 2 oct. 1949 à Quimper, Finistère', 'Décédé·e le 2 oct. 1949 à Quimper, Finistère']);
    const claire = s.unions[0]!.children[0]!;
    expect(claire).toMatchObject({ facts: ['Née en 1976'], occupation: undefined });
    expect(s.counts.living).toBeGreaterThan(0);
  });

  it('shows everything without discretion, except who the file marks private', () => {
    const s = sheetOf('I1');
    expect(s.siblings[0]!.facts).toEqual(['Né le 30 mai 1944 à Brest, Finistère']);
    // Michel AUBRY carries RESN privacy in the file.
    expect(s.unions[0]!.partner).toMatchObject({ name: 'Michel AUBRY', facts: ['Né en 1949'], reduced: true });
    expect(s.unions[0]!.union).toEqual(['Mariés le 6 juil. 1974 à Brest, Finistère', 'Divorcés en 1990 à Brest, Finistère']);
    expect(s.counts.private).toBe(1);
    expect(s.unions[0]!.children.find((k) => k.name === 'Sophie AUBRY')!.tag).toBe('adoptée');
  });

  it('lists the events the Fiche tab lists, in its order, with their sources numbered', () => {
    const s = sheetOf('I2');
    expect(s.events.map((e) => e.label)).toEqual(eventRows(tree, tree.individuals.I2!, 'fr').map((r) => r.label));
    expect(s.events.map((e) => e.label)).toEqual(['Naissance', 'Service militaire', 'Mariage', 'Mariage', 'Décès', 'Inhumation']);
    expect(s.events[0]!.refs).toEqual([1]);
    expect(s.events[3]!.refs).toEqual([2]);
    expect(s.sources.map((x) => x.about)).toEqual([['Naissance'], ['Mariage']]);
    expect(s.events[4]!.lines).toContain('Cause : Insuffisance cardiaque');
  });

  it('writes words, never the genealogist’s signs or a dash standing for nothing', () => {
    // ° † ~ and a lone x read as mistakes to the relatives the sheet is for; so did the dash of an undated event.
    for (const id of ['I1', 'I2', 'I25']) {
      const s = sheetOf(id, { discreet: id === 'I25' });
      const written = JSON.stringify([s.subject.lines, s.parents, s.siblings, s.unions, s.events.map((e) => e.date)]);
      expect(written).not.toMatch(/[°†~—–]|(^|[\s"])x\s/);
    }
  });

  it('says a marriage happened even when nothing else about it is known', () => {
    const t = load();
    const marriage = t.families.F3!.events.find((e) => e.type === 'marriage')!;
    delete marriage.date;
    delete marriage.place;
    expect(sheetOf('I2', {}, t).parents[0]!.union).toEqual(['Mariés, date et lieu inconnus']);
  });

  it('leaves the date of an undated event empty', () => {
    const t = load();
    t.individuals.I2!.events.push({
      type: 'religion',
      tag: 'RELI',
      value: 'Catholique',
      notes: [],
      citations: [],
      mediaIds: [],
      extra: [],
    });
    const religion = sheetOf('I2', {}, t).events.find((e) => e.label === 'Religion')!;
    expect(religion.date).toBe('');
  });

  it('leaves out what is not asked for', () => {
    const s = sheetOf('I2', { notes: false, sources: false });
    expect(s.notes).toEqual([]);
    expect(s.sources).toEqual([]);
    expect(s.events.every((e) => e.refs.length === 0)).toBe(true);
    expect(s.leads).toEqual({ open: [], done: [] });
  });

  it('lists leads still open before those done, and documents other than the portrait', () => {
    const t = load();
    const henri = t.individuals.I2!;
    henri.leads = [
      { id: 'L1', title: 'Recensement 1926', url: '', done: true },
      { id: 'L2', title: 'Registre matricule', url: 'https://archives.finistere.fr/', note: 'Classe 1941' },
    ];
    t.media.M9 = {
      id: 'M9',
      file: 'acte.jpg',
      kind: 'birth',
      title: 'Acte de naissance d’Henri',
      date: parseDate('5 FEB 1921'),
      notes: [],
      extra: [],
    };
    henri.mediaIds.push('M9');
    const s = sheetOf('I2', { leads: true }, t);
    expect(s.leads.open.map((l) => l.title)).toEqual(['Registre matricule']);
    expect(s.leads.done.map((l) => l.title)).toEqual(['Recensement 1926']);
    expect(s.documents).toEqual([{ id: 'M9', title: 'Acte de naissance d’Henri', detail: 'Acte de naissance, 5 févr. 1921' }]);
    expect(s.counts.leads).toBe(2);
  });

  it('copes with someone who has no family at all', () => {
    const t = load();
    t.individuals.I98 = { ...newIndividual('I98'), names: [{ given: 'Seul', surname: 'ISOLÉ' }] };
    const s = sheetOf('I98', {}, t);
    expect([s.parents, s.siblings, s.unions, s.events]).toEqual([[], [], [], []]);
    expect(s.subject.filiation).toBeUndefined();
    expect(personSheet(t, 'nobody', opts())).toBeNull();
  });

  it('writes a place short: the first two named parts, without a postal or INSEE code', () => {
    expect(shortPlace({ text: 'x', parts: ['', 'Brest', 'Finistère', 'Bretagne', 'France'] })).toBe('Brest, Finistère');
    expect(shortPlace({ text: 'x', parts: ['Rive-de-Gier', '42186', 'Loire', 'Auvergne-Rhône-Alpes', 'France'] })).toBe(
      'Rive-de-Gier, Loire',
    );
    expect(shortPlace({ text: 'x', parts: ['Ajaccio', '2A004', 'Corse-du-Sud'] })).toBe('Ajaccio, Corse-du-Sud');
    expect(shortPlace(undefined)).toBe('');
  });
});
