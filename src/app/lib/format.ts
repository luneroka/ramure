/** How dates and lives are written on screen, shared by every list that shows people. */

import { approximateYear } from '@/gedcom/dates';
import { findEvent, type Individual } from '@/gedcom/model';
import { tg, type Lang } from '@/i18n';

/** The BCP 47 locale for dates and numbers. */
export const localeOf = (lang: Lang): string => (lang === 'fr' ? 'fr-FR' : 'en-GB');

/** A life as the lists of relatives write it: « 1850 – 1920 », or « née 1850 » while no death is known. */
export function lifeYears(lang: Lang, p: Individual): string {
  const death = findEvent(p.events, 'death');
  const born = approximateYear(findEvent(p.events, 'birth')?.date);
  const died = approximateYear(death?.date);
  return death ? `${born ?? '?'} – ${died ?? '?'}` : born ? `${tg(lang, 'born', p.sex)} ${born}` : '';
}
