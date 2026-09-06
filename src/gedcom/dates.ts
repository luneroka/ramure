/**
 * GEDCOM date values.
 *
 * A date is kept both as the raw GEDCOM string (so nothing is ever lost) and
 * as a parsed structure good enough for sorting, display and consistency
 * checks. Supported: exact and partial Gregorian dates, ABT / CAL / EST,
 * BEF / AFT, BET ... AND ..., FROM ... TO ..., FROM / TO alone, the French
 * Republican calendar escape, and free-text phrases in parentheses.
 */

export type Calendar = 'gregorian' | 'julian' | 'french-republican' | 'hebrew' | 'unknown';

export interface SimpleDate {
  calendar: Calendar;
  /** Year as written. For the Republican calendar this is the year of the Republic. */
  year?: number;
  /** 1-12 (Gregorian/Julian) or 1-13 (Republican, 13 = jours complémentaires). */
  month?: number;
  day?: number;
  /** "B.C." suffix or dual year like 1699/00 are kept but not interpreted. */
  suffix?: string;
}

export type DateKind =
  | 'exact'
  | 'about'
  | 'calculated'
  | 'estimated'
  | 'before'
  | 'after'
  | 'between'
  | 'from'
  | 'to'
  | 'from-to'
  | 'phrase'
  | 'unknown';

export interface GDate {
  raw: string;
  kind: DateKind;
  date?: SimpleDate;
  /** Second date for "between" and "from-to". */
  date2?: SimpleDate;
  phrase?: string;
}

const GREG_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const FRENCH_MONTHS = ['VEND', 'BRUM', 'FRIM', 'NIVO', 'PLUV', 'VENT', 'GERM', 'FLOR', 'PRAI', 'MESS', 'THER', 'FRUC', 'COMP'];
const HEBREW_MONTHS = ['TSH', 'CSH', 'KSL', 'TVT', 'SHV', 'ADR', 'ADS', 'NSN', 'IYR', 'SVN', 'TMZ', 'AAV', 'ELL'];

const CALENDAR_ESCAPES: Record<string, Calendar> = {
  '@#DGREGORIAN@': 'gregorian',
  '@#DJULIAN@': 'julian',
  '@#DFRENCH R@': 'french-republican',
  '@#DHEBREW@': 'hebrew',
  '@#DUNKNOWN@': 'unknown',
};

function monthsFor(cal: Calendar): string[] {
  if (cal === 'french-republican') return FRENCH_MONTHS;
  if (cal === 'hebrew') return HEBREW_MONTHS;
  return GREG_MONTHS;
}

/** Parse one simple date such as "12 MAR 1952", "MAR 1952", "1952", "@#DFRENCH R@ 15 VEND 3". */
export function parseSimpleDate(input: string): SimpleDate | undefined {
  let s = input.trim();
  let calendar: Calendar = 'gregorian';
  for (const [esc, cal] of Object.entries(CALENDAR_ESCAPES)) {
    if (s.toUpperCase().startsWith(esc)) {
      calendar = cal;
      s = s.slice(esc.length).trim();
      break;
    }
  }
  if (!s) return undefined;
  const parts = s.toUpperCase().split(/\s+/);
  const months = monthsFor(calendar);
  const out: SimpleDate = { calendar };

  const yearPart = parts[parts.length - 1]!;
  const ym = /^(\d{1,4})(\/\d{1,2})?(?:\s*(B\.?C\.?))?$/.exec(yearPart);
  if (!ym) return undefined;
  out.year = Number(ym[1]);
  if (ym[2]) out.suffix = ym[2];
  if (parts.length >= 2) {
    const mi = months.indexOf(parts[parts.length - 2]!);
    if (mi < 0) return undefined;
    out.month = mi + 1;
  }
  if (parts.length === 3) {
    const d = Number(parts[0]);
    if (!Number.isInteger(d) || d < 1 || d > 31) return undefined;
    out.day = d;
  }
  if (parts.length > 3) return undefined;
  // "B.C." can also be the last token; handle "44 B.C." style.
  return out;
}

export function parseDate(raw: string): GDate {
  const s = raw.trim();
  const up = s.toUpperCase();
  const g = (kind: DateKind, a?: string, b?: string): GDate => {
    const d1 = a !== undefined ? parseSimpleDate(a) : undefined;
    const d2 = b !== undefined ? parseSimpleDate(b) : undefined;
    if ((a !== undefined && !d1) || (b !== undefined && !d2)) return { raw, kind: 'phrase', phrase: s };
    return { raw, kind, date: d1, date2: d2 };
  };
  if (s === '') return { raw, kind: 'unknown' };
  if (/^\(.*\)$/.test(s)) return { raw, kind: 'phrase', phrase: s.slice(1, -1) };
  let m: RegExpExecArray | null;
  if ((m = /^BET (.+) AND (.+)$/.exec(up))) return g('between', m[1], m[2]);
  if ((m = /^FROM (.+) TO (.+)$/.exec(up))) return g('from-to', m[1], m[2]);
  if ((m = /^FROM (.+)$/.exec(up))) return g('from', m[1]);
  if ((m = /^TO (.+)$/.exec(up))) return g('to', m[1]);
  if ((m = /^ABT (.+)$/.exec(up))) return g('about', m[1]);
  if ((m = /^CAL (.+)$/.exec(up))) return g('calculated', m[1]);
  if ((m = /^EST (.+)$/.exec(up))) return g('estimated', m[1]);
  if ((m = /^BEF (.+)$/.exec(up))) return g('before', m[1]);
  if ((m = /^AFT (.+)$/.exec(up))) return g('after', m[1]);
  if ((m = /^INT (.+?) \((.*)\)$/.exec(up))) {
    const d = parseSimpleDate(m[1]!);
    return { raw, kind: d ? 'exact' : 'phrase', date: d, phrase: m[2] };
  }
  const d = parseSimpleDate(s);
  if (d) return { raw, kind: 'exact', date: d };
  return { raw, kind: 'phrase', phrase: s };
}

/** A sortable approximate Gregorian year, or undefined if unknown. */
export function approximateYear(d: GDate | undefined): number | undefined {
  if (!d) return undefined;
  const pick = d.date ?? d.date2;
  if (!pick?.year) return undefined;
  if (pick.calendar === 'french-republican') return 1791 + pick.year; // an I = 1792-93
  return pick.year;
}

/** Serialise back to a GEDCOM date string. Uses the raw value when it exists. */
export function formatGedcomDate(d: GDate): string {
  if (d.raw) return d.raw;
  const simple = (x?: SimpleDate): string => {
    if (!x) return '';
    const esc = x.calendar === 'french-republican' ? '@#DFRENCH R@ ' : x.calendar === 'julian' ? '@#DJULIAN@ ' : x.calendar === 'hebrew' ? '@#DHEBREW@ ' : '';
    const months = monthsFor(x.calendar);
    const parts: string[] = [];
    if (x.day) parts.push(String(x.day));
    if (x.month) parts.push(months[x.month - 1]!);
    if (x.year !== undefined) parts.push(String(x.year) + (x.suffix ?? ''));
    return esc + parts.join(' ');
  };
  switch (d.kind) {
    case 'exact': return simple(d.date);
    case 'about': return 'ABT ' + simple(d.date);
    case 'calculated': return 'CAL ' + simple(d.date);
    case 'estimated': return 'EST ' + simple(d.date);
    case 'before': return 'BEF ' + simple(d.date);
    case 'after': return 'AFT ' + simple(d.date);
    case 'between': return `BET ${simple(d.date)} AND ${simple(d.date2)}`;
    case 'from': return 'FROM ' + simple(d.date);
    case 'to': return 'TO ' + simple(d.date);
    case 'from-to': return `FROM ${simple(d.date)} TO ${simple(d.date2)}`;
    case 'phrase': return d.phrase ? `(${d.phrase})` : '';
    default: return '';
  }
}

const FR_MONTHS_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const FR_MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const REP_MONTHS = ['vendémiaire', 'brumaire', 'frimaire', 'nivôse', 'pluviôse', 'ventôse', 'germinal', 'floréal', 'prairial', 'messidor', 'thermidor', 'fructidor', 'jours compl.'];

function roman(n: number): string {
  const table: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, r] of table) while (n >= v) { out += r; n -= v; }
  return out;
}

/** Human display of a date, in French or English. */
export function formatDate(d: GDate | undefined, lang: 'fr' | 'en' = 'fr'): string {
  if (!d) return '';
  const fr = lang === 'fr';
  const simple = (x?: SimpleDate): string => {
    if (!x || x.year === undefined) return '';
    if (x.calendar === 'french-republican') {
      const m = x.month ? REP_MONTHS[x.month - 1] : undefined;
      const y = `an ${roman(x.year)}`;
      return [x.day, m, y].filter(Boolean).join(' ');
    }
    const months = fr ? FR_MONTHS_FR : FR_MONTHS_EN;
    const m = x.month ? months[x.month - 1] : undefined;
    return [x.day, m, x.year].filter((v) => v !== undefined).join(' ');
  };
  switch (d.kind) {
    case 'exact': return simple(d.date);
    case 'about': return (fr ? 'vers ' : 'about ') + simple(d.date);
    case 'calculated': return (fr ? 'calc. ' : 'calc. ') + simple(d.date);
    case 'estimated': return (fr ? 'est. ' : 'est. ') + simple(d.date);
    case 'before': return (fr ? 'avant ' : 'before ') + simple(d.date);
    case 'after': return (fr ? 'après ' : 'after ') + simple(d.date);
    case 'between': return fr ? `entre ${simple(d.date)} et ${simple(d.date2)}` : `between ${simple(d.date)} and ${simple(d.date2)}`;
    case 'from': return (fr ? 'à partir de ' : 'from ') + simple(d.date);
    case 'to': return (fr ? "jusqu'à " : 'until ') + simple(d.date);
    case 'from-to': return fr ? `de ${simple(d.date)} à ${simple(d.date2)}` : `${simple(d.date)} to ${simple(d.date2)}`;
    case 'phrase': return d.phrase ?? d.raw;
    default: return d.raw;
  }
}
