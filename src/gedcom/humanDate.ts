/**
 * Turn what a person types into a GEDCOM date. Accepts French and English
 * forms: "12/03/1952", "12 mars 1952", "mars 1952", "1952", "vers 1860",
 * "avant 1900", "après 1946", "entre 1880 et 1885", "de 1973 à 2012",
 * "about 1860", "before 1900", "between 1880 and 1885", "15 vendémiaire an III",
 * and raw GEDCOM ("ABT 1860", "BET 1880 AND 1885").
 */

import { formatGedcomDate, parseDate, type GDate, type SimpleDate } from './dates';

const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MONTHS_FR_ABBR = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
const MONTHS_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTHS_EN_ABBR = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const REP_MONTHS = ['vendémiaire', 'brumaire', 'frimaire', 'nivôse', 'pluviôse', 'ventôse', 'germinal', 'floréal', 'prairial', 'messidor', 'thermidor', 'fructidor'];

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function monthIndex(word: string): number | undefined {
  const w = fold(word).replace(/\.$/, '');
  for (const list of [MONTHS_FR, MONTHS_FR_ABBR, MONTHS_EN, MONTHS_EN_ABBR]) {
    const i = list.findIndex((m) => fold(m) === w || (w.length >= 3 && fold(m).startsWith(w)));
    if (i >= 0) return i + 1;
  }
  return undefined;
}

function romanToInt(s: string): number | undefined {
  const map: Record<string, number> = { I: 1, V: 5, X: 10, L: 50 };
  let total = 0, prev = 0;
  for (const ch of s.toUpperCase().split('').reverse()) {
    const v = map[ch];
    if (!v) return undefined;
    if (v < prev) total -= v; else { total += v; prev = v; }
  }
  return total || undefined;
}

function simple(text: string): SimpleDate | undefined {
  const s = text.trim();
  if (!s) return undefined;
  // Republican: "15 vendémiaire an III" / "15 vend 3"
  const rep = /^(?:(\d{1,2})\s+)?([a-zéèô]+)\s+an\s+([ivxl]+|\d+)$/i.exec(s);
  if (rep) {
    const mi = REP_MONTHS.findIndex((m) => fold(m).startsWith(fold(rep[2]!).slice(0, 4)));
    const y = /^\d+$/.test(rep[3]!) ? Number(rep[3]) : romanToInt(rep[3]!);
    if (mi >= 0 && y) return { calendar: 'french-republican', day: rep[1] ? Number(rep[1]) : undefined, month: mi + 1, year: y };
  }
  // Numeric: dd/mm/yyyy, dd.mm.yyyy, dd-mm-yyyy, yyyy-mm-dd, mm/yyyy
  let m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{3,4})$/.exec(s);
  if (m) return { calendar: 'gregorian', day: Number(m[1]), month: Number(m[2]), year: Number(m[3]) };
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return { calendar: 'gregorian', day: Number(m[3]), month: Number(m[2]), year: Number(m[1]) };
  m = /^(\d{1,2})[/.\-](\d{3,4})$/.exec(s);
  if (m) return { calendar: 'gregorian', month: Number(m[1]), year: Number(m[2]) };
  // Year only
  m = /^(\d{3,4})$/.exec(s);
  if (m) return { calendar: 'gregorian', year: Number(m[1]) };
  // "12 mars 1952", "mars 1952", "12 March 1952", "March 12, 1952", "1er mai 1900"
  m = /^(?:(\d{1,2})(?:er|st|nd|rd|th)?\s+)?([a-zéèûô.]+)\s+(\d{3,4})$/i.exec(s);
  if (m) {
    const mi = monthIndex(m[2]!);
    if (mi) return { calendar: 'gregorian', day: m[1] ? Number(m[1]) : undefined, month: mi, year: Number(m[3]) };
  }
  m = /^([a-z.]+)\s+(\d{1,2}),?\s+(\d{3,4})$/i.exec(s);
  if (m) {
    const mi = monthIndex(m[1]!);
    if (mi) return { calendar: 'gregorian', day: Number(m[2]), month: mi, year: Number(m[3]) };
  }
  return undefined;
}

/** Parse free text into a GDate. Returns undefined when nothing sensible can be made of it. */
export function parseHumanDate(text: string): GDate | undefined {
  const s = text.trim().replace(/\s+/g, ' ');
  if (!s) return undefined;
  // Raw GEDCOM first: if it parses to something other than a phrase, keep it.
  const raw = parseDate(s);
  if (raw.kind !== 'phrase' && raw.kind !== 'unknown') return { ...raw, raw: formatGedcomDate({ ...raw, raw: '' }) };

  const f = fold(s);
  const build = (kind: GDate['kind'], a: string, b?: string): GDate | undefined => {
    const d1 = simple(a);
    if (!d1) return undefined;
    const d2 = b !== undefined ? simple(b) : undefined;
    if (b !== undefined && !d2) return undefined;
    const g: GDate = { raw: '', kind, date: d1, date2: d2 };
    g.raw = formatGedcomDate(g);
    return g;
  };
  let m: RegExpExecArray | null;
  if ((m = /^(?:entre|between) (.+?) (?:et|and) (.+)$/.exec(f))) return build('between', s.slice(m.index + m[0].indexOf(m[1]!), m.index + m[0].indexOf(m[1]!) + m[1]!.length), s.slice(-m[2]!.length));
  if ((m = /^(?:de|from) (.+?) (?:a|à|to) (.+)$/.exec(f))) return build('from-to', s.slice(m[0].indexOf(m[1]!), m[0].indexOf(m[1]!) + m[1]!.length), s.slice(-m[2]!.length));
  const prefixes: Array<[RegExp, GDate['kind']]> = [
    [/^(?:vers|environ|env\.?|circa|ca\.?|c\.|about|abt\.?|~)\s*(.+)$/, 'about'],
    [/^(?:avant|av\.|before|bef\.?)\s*(.+)$/, 'before'],
    [/^(?:apres|ap\.|after|aft\.?)\s*(.+)$/, 'after'],
    [/^(?:estime|est\.?|estimated)\s*(.+)$/, 'estimated'],
    [/^(?:calcule|cal\.?|calculated)\s*(.+)$/, 'calculated'],
    [/^(?:a partir de|depuis|from)\s*(.+)$/, 'from'],
    [/^(?:jusqu'?a|jusqu'?en|to|until)\s*(.+)$/, 'to'],
  ];
  for (const [re, kind] of prefixes) {
    if ((m = re.exec(f))) return build(kind, s.slice(s.length - m[1]!.length));
  }
  return build('exact', s);
}
