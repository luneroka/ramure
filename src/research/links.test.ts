import { describe, expect, it } from 'vitest';
import { parseDate } from '@/gedcom/dates';
import { newIndividual } from '@/gedcom/model';
import { blankEvent } from '@/tree/edit';
import { searchLinks, yearWindow } from './links';

function person(given: string, surname: string, birth?: string, death?: string) {
  const p = newIndividual('X');
  p.names = [{ given, surname }];
  if (birth) p.events.push({ ...blankEvent('birth'), date: parseDate(birth) });
  if (death) p.events.push({ ...blankEvent('death'), date: parseDate(death) });
  return p;
}

describe('searchLinks', () => {
  it('fills name and years into each site', () => {
    const links = searchLinks(person('Rosalie', 'Guérin', '1852'));
    expect(links.map((l) => l.id)).toEqual(['geneanet', 'familysearch', 'filae', 'francearchives']);
    const geneanet = links[0]!.url;
    expect(geneanet).toContain('nom=Gu%C3%A9rin');
    expect(geneanet).toContain('prenom=Rosalie');
    expect(geneanet).toContain('from=1850&to=1854');
    expect(links[1]!.url).toContain('q.birthLikeDate.from=1850');
    expect(links[3]!.url).toContain('q=Rosalie%20Gu%C3%A9rin');
  });

  it('widens the window from a death year and skips years when unknown', () => {
    expect(yearWindow(person('A', 'B', undefined, '1900'))).toEqual({ from: 1795, to: 1900 });
    expect(yearWindow(person('A', 'B'))).toEqual({});
    expect(searchLinks(person('A', 'B'))[0]!.url).not.toContain('type_periode');
  });

  it('returns nothing for a nameless person', () => {
    expect(searchLinks(person('', ''))).toEqual([]);
  });
});
