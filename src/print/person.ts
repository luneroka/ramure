/**
 * What a person is called and when they lived, in the short form paper wants.
 *
 * Shared by the charts and the poster: both write a name over two lines and a
 * pair of years under it, and both need the same answer for "no dates known".
 * The canvas has its own, richer version (ages, « né·e », living markers); on
 * paper those cost room that a chart does not have.
 */

import { approximateYear } from '@/gedcom/dates';
import { displayName, findEvent, type Individual } from '@/gedcom/model';

/** « 1872 – 1940 », « 1872 – … » for someone whose death is recorded without a date, or nothing at all. */
export function lifeYears(ind: Individual): string {
  const b = approximateYear(findEvent(ind.events, 'birth')?.date ?? findEvent(ind.events, 'baptism')?.date);
  const d = approximateYear(findEvent(ind.events, 'death')?.date ?? findEvent(ind.events, 'burial')?.date);
  if (b === undefined && d === undefined) return '';
  return `${b ?? '…'} – ${d ?? (findEvent(ind.events, 'death') ? '…' : '')}`.replace(/ – $/, '');
}

/** Given names, then the surname in capitals — the way charts have set names since before printing. */
export function nameParts(ind: Individual): [string, string] {
  const n = ind.names[0];
  if (!n) return [displayName(ind), ''];
  return [n.given || '', n.surname.toUpperCase()];
}
