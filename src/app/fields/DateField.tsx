/**
 * Guided date entry: a kind (exact, about, before, between...) then day,
 * month and year, with a second triplet for ranges. Dates the guided form
 * cannot express (Republican calendar, free phrases) fall back to a text
 * mode that uses the human date parser.
 */

import { useState } from 'react';
import { formatDate, formatGedcomDate, type DateKind, type GDate, type SimpleDate } from '../../gedcom/dates';
import { parseHumanDate } from '../../gedcom/humanDate';
import { t, type Lang } from '../../i18n';

interface Props {
  value: GDate | undefined;
  onChange(next: GDate | undefined): void;
  lang: Lang;
  label?: string;
}

const KINDS: DateKind[] = ['exact', 'about', 'estimated', 'before', 'after', 'between', 'from-to'];

const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MONTHS_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function kindLabel(lang: Lang, k: DateKind): string {
  const fr: Record<string, string> = {
    exact: 'Le',
    about: 'Vers',
    estimated: 'Estimé',
    calculated: 'Calculé',
    before: 'Avant',
    after: 'Après',
    between: 'Entre',
    'from-to': 'De … à',
    from: 'À partir de',
    to: 'Jusqu’à',
  };
  const en: Record<string, string> = {
    exact: 'On',
    about: 'About',
    estimated: 'Estimated',
    calculated: 'Calculated',
    before: 'Before',
    after: 'After',
    between: 'Between',
    'from-to': 'From … to',
    from: 'From',
    to: 'Until',
  };
  return (lang === 'fr' ? fr : en)[k] ?? k;
}

/** Can the guided form show this date without losing anything? */
function isGuidable(d: GDate | undefined): boolean {
  if (!d) return true;
  if (!KINDS.includes(d.kind) && d.kind !== 'calculated') return false;
  for (const x of [d.date, d.date2]) if (x && x.calendar !== 'gregorian') return false;
  return d.kind !== 'phrase';
}

interface Triplet {
  day: string;
  month: string;
  year: string;
}
const toTriplet = (x?: SimpleDate): Triplet => ({
  day: x?.day ? String(x.day) : '',
  month: x?.month ? String(x.month) : '',
  year: x?.year !== undefined ? String(x.year) : '',
});
const fromTriplet = (tr: Triplet): SimpleDate | undefined => {
  const year = tr.year.trim() ? Number(tr.year) : undefined;
  if (year === undefined || !Number.isFinite(year)) return undefined;
  const month = tr.month ? Number(tr.month) : undefined;
  const day = tr.day.trim() ? Number(tr.day) : undefined;
  return { calendar: 'gregorian', year, month: month || undefined, day: month && day && day >= 1 && day <= 31 ? day : undefined };
};

export function DateField({ value, onChange, lang, label }: Props) {
  const [mode, setMode] = useState<'guided' | 'text'>(isGuidable(value) ? 'guided' : 'text');
  const [kind, setKind] = useState<DateKind>(
    value?.kind && KINDS.includes(value.kind) ? value.kind : value?.kind === 'calculated' ? 'estimated' : 'exact',
  );
  const [a, setA] = useState<Triplet>(toTriplet(value?.date));
  const [b, setB] = useState<Triplet>(toTriplet(value?.date2));
  const [text, setText] = useState(value ? formatDate(value, lang) : '');
  const months = lang === 'fr' ? MONTHS_FR : MONTHS_EN;
  const ranged = kind === 'between' || kind === 'from-to';

  const emit = (k: DateKind, ta: Triplet, tb: Triplet) => {
    const d1 = fromTriplet(ta);
    if (!d1) {
      onChange(undefined);
      return;
    }
    const d2 = ranged || k === 'between' || k === 'from-to' ? fromTriplet(tb) : undefined;
    const g: GDate = { raw: '', kind: k, date: d1, date2: k === 'between' || k === 'from-to' ? (d2 ?? d1) : undefined };
    g.raw = formatGedcomDate(g);
    onChange(g);
  };

  const emitText = (s: string) => {
    setText(s);
    const v = s.trim();
    if (!v) {
      onChange(undefined);
      return;
    }
    onChange(parseHumanDate(v) ?? { raw: `(${v})`, kind: 'phrase', phrase: v });
  };

  // A render helper, not a component: a component declared inside render would remount on every keystroke.
  const triplet = (tr: Triplet, set: (t: Triplet) => void, which: 'a' | 'b') => (
    <span className="date-triplet">
      <input
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder={lang === 'fr' ? 'JJ' : 'DD'}
        aria-label={lang === 'fr' ? 'Jour' : 'Day'}
        value={tr.day}
        maxLength={2}
        onChange={(e) => {
          const n = { ...tr, day: e.target.value.replace(/\D/g, '') };
          set(n);
          emit(kind, which === 'a' ? n : a, which === 'b' ? n : b);
        }}
      />
      <select
        aria-label={lang === 'fr' ? 'Mois' : 'Month'}
        value={tr.month}
        onChange={(e) => {
          const n = { ...tr, month: e.target.value };
          set(n);
          emit(kind, which === 'a' ? n : a, which === 'b' ? n : b);
        }}
      >
        <option value="">{lang === 'fr' ? 'mois' : 'month'}</option>
        {months.map((m, i) => (
          <option key={m} value={String(i + 1)}>
            {m}
          </option>
        ))}
      </select>
      <input
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder={lang === 'fr' ? 'AAAA' : 'YYYY'}
        aria-label={lang === 'fr' ? 'Année' : 'Year'}
        value={tr.year}
        maxLength={4}
        className="year"
        onChange={(e) => {
          const n = { ...tr, year: e.target.value.replace(/\D/g, '') };
          set(n);
          emit(kind, which === 'a' ? n : a, which === 'b' ? n : b);
        }}
      />
    </span>
  );

  return (
    <div className="date-field">
      <div className="date-head">
        <span className="field-label">{label ?? t(lang, 'date')}</span>
        <button
          type="button"
          className="link small"
          onClick={() => {
            if (mode === 'guided') {
              setText(value ? formatDate(value, lang) : '');
              setMode('text');
            } else if (isGuidable(value)) {
              setKind(value?.kind && KINDS.includes(value.kind) ? value.kind : 'exact');
              setA(toTriplet(value?.date));
              setB(toTriplet(value?.date2));
              setMode('guided');
            }
          }}
          disabled={mode === 'text' && !isGuidable(value)}
          title={mode === 'text' && !isGuidable(value) ? t(lang, 'dateNotGuidable') : undefined}
        >
          {mode === 'guided' ? t(lang, 'dateFreeText') : t(lang, 'dateGuided')}
        </button>
      </div>
      {mode === 'guided' ? (
        <div className="date-guided">
          <select
            aria-label={t(lang, 'dateKind')}
            value={kind}
            onChange={(e) => {
              const k = e.target.value as DateKind;
              setKind(k);
              emit(k, a, b);
            }}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {kindLabel(lang, k)}
              </option>
            ))}
          </select>
          {triplet(a, setA, 'a')}
          {ranged && <span className="date-and">{kind === 'between' ? (lang === 'fr' ? 'et' : 'and') : lang === 'fr' ? 'à' : 'to'}</span>}
          {ranged && triplet(b, setB, 'b')}
        </div>
      ) : (
        <input value={text} placeholder={t(lang, 'dateHint')} onChange={(e) => emitText(e.target.value)} />
      )}
      <span className={`date-preview ${value?.kind === 'phrase' ? 'warn' : ''}`}>
        {value ? (value.kind === 'phrase' ? t(lang, 'dateUnreadable') : formatDate(value, lang)) : ''}
      </span>
    </div>
  );
}
