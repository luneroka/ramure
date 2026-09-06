/**
 * Age at an event or today, from GEDCOM dates.
 *
 * Exact when both ends carry day, month and year in the Gregorian calendar
 * and are plain dates. Otherwise the result is a year difference and marked
 * approximate, which is how it is shown ("~77 ans").
 */

import { approximateYear, type GDate, type SimpleDate } from './dates';

export interface Age {
  years: number;
  approx: boolean;
}

function fullGregorian(d: GDate | undefined): SimpleDate | undefined {
  if (!d || d.kind !== 'exact' || !d.date) return undefined;
  const x = d.date;
  if (x.calendar !== 'gregorian' || !x.year || !x.month || !x.day) return undefined;
  return x;
}

function yearsBetween(a: { year: number; month: number; day: number }, b: { year: number; month: number; day: number }): number {
  let years = b.year - a.year;
  if (b.month < a.month || (b.month === a.month && b.day < a.day)) years--;
  return years;
}

/** Age at `end`; pass 'today' for a living person. */
export function computeAge(birth: GDate | undefined, end: GDate | 'today' | undefined): Age | undefined {
  if (!birth || !end) return undefined;
  const b = fullGregorian(birth);
  const now = new Date();
  const today = { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  if (end === 'today') {
    if (b) {
      const y = yearsBetween({ year: b.year!, month: b.month!, day: b.day! }, today);
      return y >= 0 && y < 130 ? { years: y, approx: false } : undefined;
    }
    const by = approximateYear(birth);
    if (by === undefined) return undefined;
    const y = today.year - by;
    return y >= 0 && y < 130 ? { years: y, approx: true } : undefined;
  }
  const e = fullGregorian(end);
  if (b && e) {
    const y = yearsBetween({ year: b.year!, month: b.month!, day: b.day! }, { year: e.year!, month: e.month!, day: e.day! });
    return y >= 0 ? { years: y, approx: false } : undefined;
  }
  const by = approximateYear(birth),
    ey = approximateYear(end);
  if (by === undefined || ey === undefined) return undefined;
  const y = ey - by;
  // Same-year births and deaths with unknown months are legitimately 0.
  return y >= 0 ? { years: y, approx: true } : undefined;
}
