/**
 * External searches for a person: the big French and worldwide record
 * collections, with the name and the years already filled in. Pure so the
 * URLs are testable; opening the tabs is the panel's business.
 */

import { approximateYear } from '../gedcom/dates';
import { findEvent, type Individual } from '../gedcom/model';

export interface SearchLink {
  id: 'geneanet' | 'familysearch' | 'filae' | 'francearchives';
  label: string;
  url: string;
}

/** Birth-year window used by the sites: the known years, widened when only one is known. */
export function yearWindow(person: Individual): { from?: number; to?: number } {
  const birth = approximateYear(findEvent(person.events, 'birth')?.date ?? findEvent(person.events, 'baptism')?.date);
  const death = approximateYear(findEvent(person.events, 'death')?.date ?? findEvent(person.events, 'burial')?.date);
  if (birth !== undefined) return { from: birth - 2, to: birth + 2 };
  if (death !== undefined) return { from: death - 105, to: death };
  return {};
}

export function searchLinks(person: Individual): SearchLink[] {
  const n = person.names[0];
  const given = (n?.given ?? '').trim();
  const surname = (n?.surname ?? '').trim();
  if (!given && !surname) return [];
  const { from, to } = yearWindow(person);
  const q = (params: Record<string, string | number | undefined>) =>
    Object.entries(params)
      .filter((e): e is [string, string | number] => e[1] !== undefined && e[1] !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
  const full = [given, surname].filter(Boolean).join(' ');
  return [
    {
      id: 'geneanet',
      label: 'Geneanet',
      url: `https://www.geneanet.org/fonds/individus/?${q({
        go: 1,
        nom: surname,
        prenom: given,
        ...(from !== undefined ? { type_periode: 'between', from, to } : {}),
      })}`,
    },
    {
      id: 'familysearch',
      label: 'FamilySearch',
      url: `https://www.familysearch.org/search/record/results?${q({
        'q.givenName': given,
        'q.surname': surname,
        'q.birthLikeDate.from': from,
        'q.birthLikeDate.to': to,
      })}`,
    },
    {
      id: 'filae',
      label: 'Filae',
      url: `https://www.filae.com/recherche/?${q({ nom: surname, prenom: given })}`,
    },
    {
      id: 'francearchives',
      label: 'FranceArchives',
      url: `https://francearchives.gouv.fr/fr/search?${q({ q: full })}`,
    },
  ];
}
