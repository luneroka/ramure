/** Files from other programs: what they put where the 5.5.1 grammar allows it, and what we keep. */
import { describe, expect, it } from 'vitest';
import { parseGedcom } from './parse';
import { serializeGedcom } from './serialize';

const ged = (body: string) => `0 HEAD\n1 SOUR Test\n1 GEDC\n2 VERS 5.5.1\n1 CHAR UTF-8\n${body}\n0 TRLR\n`;
const roundTrip = (text: string) => parseGedcom(serializeGedcom(parseGedcom(text)));

describe('foreign dialects', () => {
  it('keeps notes and sources attached to a name, through export', () => {
    const text = ged(
      [
        '0 @I1@ INDI',
        '1 NAME Jean /Dupont/',
        '2 NOTE Nom orthographié Dupond sur l’acte',
        '2 SOUR @S1@',
        '3 PAGE vue 12',
        '0 @S1@ SOUR',
        '1 TITL Registre',
      ].join('\n'),
    );
    for (const tree of [parseGedcom(text), roundTrip(text)]) {
      const name = tree.individuals['I1']!.names[0]!;
      expect(name.notes).toEqual(['Nom orthographié Dupond sur l’acte']);
      expect(name.citations?.[0]).toMatchObject({ sourceId: 'S1', page: 'vue 12' });
    }
  });

  it('keeps every FILE of a media object and every REPO of a source', () => {
    const text = ged(
      [
        '0 @O1@ OBJE',
        '1 FILE recto.jpg',
        '2 FORM jpg',
        '1 FILE verso.jpg',
        '0 @S1@ SOUR',
        '1 TITL Actes',
        '1 REPO @R1@',
        '2 CALN 4E 12',
        '1 REPO @R2@',
        '0 @R1@ REPO',
        '1 NAME AD 29',
        '0 @R2@ REPO',
        '1 NAME Mairie',
      ].join('\n'),
    );
    for (const tree of [parseGedcom(text), roundTrip(text)]) {
      expect(tree.media['O1']).toMatchObject({ file: 'recto.jpg', files: ['verso.jpg'] });
      expect(tree.sources['S1']).toMatchObject({
        repositoryId: 'R1',
        callNumber: '4E 12',
        repositories: [{ id: 'R1', callNumber: '4E 12' }, { id: 'R2' }],
      });
    }
  });

  it('keeps place substructures: FORM, NOTE and unknown tags', () => {
    const text = ged(
      [
        '0 @I1@ INDI',
        '1 BIRT',
        '2 PLAC Brest, Finistère, France',
        '3 FORM ville, département, pays',
        '3 NOTE Ancienne commune de Lambézellec',
        '3 FONE Brest',
      ].join('\n'),
    );
    for (const tree of [parseGedcom(text), roundTrip(text)]) {
      const place = tree.individuals['I1']!.events[0]!.place!;
      expect(place.form).toBe('ville, département, pays');
      expect(place.notes).toEqual(['Ancienne commune de Lambézellec']);
      expect(place.extra?.map((r) => r.tag)).toEqual(['FONE']);
    }
  });

  it('gives an inline OBJE an id that no declared media record uses', () => {
    const text = ged(
      ['0 @I1@ INDI', '1 BIRT', '2 OBJE', '3 FILE acte.jpg', '1 OBJE @M1@', '0 @M1@ OBJE', '1 FILE portrait.jpg'].join('\n'),
    );
    const tree = parseGedcom(text);
    const ind = tree.individuals['I1']!;
    const inlineId = ind.events[0]!.mediaIds[0]!;
    expect(inlineId).not.toBe('M1');
    expect(tree.media[inlineId]?.file).toBe('acte.jpg');
    expect(tree.media['M1']?.file).toBe('portrait.jpg');
    expect(Object.keys(tree.media)).toHaveLength(2);
  });

  it('reports the tags it kept without interpreting them', () => {
    const text = ged(
      ['0 @I1@ INDI', '1 NAME A /B/', '1 _UID 1234', '1 BIRT', '2 DATE 1900', '2 _CUSTOM x', '0 @U1@ SUBM', '1 NAME Someone'].join('\n'),
    );
    const note = parseGedcom(text).importNotes.find((n) => n.code === 'kept-tags');
    expect(note?.level).toBe('info');
    expect(note?.message).toContain('_UID');
    expect(note?.message).toContain('_CUSTOM');
    expect(note?.message).toContain('SUBM');
  });
});

describe('dismissed checks', () => {
  it('travel with the tree through export and import', () => {
    const text = ged(['1 _DISMISS date-order:I1', '1 _DISMISS unknown-given:I2', '0 @I1@ INDI', '1 NAME A /B/'].join('\n'));
    for (const tree of [parseGedcom(text), roundTrip(text)]) expect(tree.dismissedChecks).toEqual(['date-order:I1', 'unknown-given:I2']);
    expect(parseGedcom(ged('0 @I1@ INDI\n1 NAME A /B/')).dismissedChecks).toBeUndefined();
  });
});
