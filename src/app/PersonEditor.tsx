import { useMemo, useState } from 'react';
import { formatDate, type GDate } from '../gedcom/dates';
import { parseHumanDate } from '../gedcom/humanDate';
import { placeText, type Event, type EventType, type Individual, type Name, type Sex, type Tree } from '../gedcom/model';
import { eventLabel, t, type Lang } from '../i18n';
import { blankEvent, type PersonPatch } from '../tree/edit';

interface Props {
  tree: Tree;
  person: Individual;
  lang: Lang;
  onSave(patch: PersonPatch): void;
  onCancel(): void;
  onDelete(): void;
}

const EVENT_TYPES: EventType[] = ['birth', 'baptism', 'death', 'burial', 'cremation', 'occupation', 'residence', 'census', 'education', 'religion', 'emigration', 'immigration', 'naturalization', 'retirement', 'will', 'probate', 'graduation', 'confirmation', 'first-communion', 'title', 'description', 'custom'];

interface EventDraft {
  key: number;
  type: EventType;
  customType: string;
  value: string;
  dateText: string;
  placeText: string;
  cause: string;
  note: string;
  original?: Event;
}

let draftKey = 1;

function toDraft(e: Event, lang: Lang): EventDraft {
  return {
    key: draftKey++,
    type: e.type,
    customType: e.customType ?? '',
    value: e.value ?? '',
    dateText: e.date ? formatDate(e.date, lang) : '',
    placeText: placeText(e.place),
    cause: e.cause ?? '',
    note: e.notes.join('\n\n'),
    original: e,
  };
}

function interpretDate(text: string, original: Event | undefined, lang: Lang): { date?: GDate; ok: boolean } {
  const s = text.trim();
  if (!s) return { ok: true };
  // Unchanged display text keeps the original structured date (including raw calendar escapes).
  if (original?.date && formatDate(original.date, lang) === s) return { date: original.date, ok: true };
  const d = parseHumanDate(s);
  if (d) return { date: d, ok: true };
  return { date: { raw: `(${s})`, kind: 'phrase', phrase: s }, ok: false };
}

function fromDraft(d: EventDraft, lang: Lang): Event {
  const base = d.original ? { ...d.original } : blankEvent(d.type);
  if (base.type !== d.type) { const fresh = blankEvent(d.type); base.type = fresh.type; base.tag = fresh.tag; }
  base.customType = d.type === 'custom' ? d.customType.trim() || undefined : undefined;
  base.value = d.value.trim() || undefined;
  base.date = interpretDate(d.dateText, d.original, lang).date;
  const pt = d.placeText.trim();
  if (pt) {
    const parts = pt.split(',').map((s) => s.trim());
    base.place = d.original?.place && placeText(d.original.place) === pt ? d.original.place : { text: pt, parts };
  } else base.place = undefined;
  base.cause = d.cause.trim() || undefined;
  base.notes = d.note.trim() ? d.note.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean) : [];
  return base;
}

export function PersonEditor({ tree, person, lang, onSave, onCancel, onDelete }: Props) {
  const first = person.names[0] ?? { given: '', surname: '' };
  const [given, setGiven] = useState(first.given);
  const [surname, setSurname] = useState(first.surname);
  const [nick, setNick] = useState(first.nick ?? '');
  const [sex, setSex] = useState<Sex>(person.sex);
  const [isPrivate, setPrivate] = useState(person.restriction === 'privacy');
  const [notes, setNotes] = useState(person.notes.join('\n\n'));
  const [events, setEvents] = useState<EventDraft[]>(() => person.events.map((e) => toDraft(e, lang)));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const places = useMemo(() => {
    const set = new Set<string>();
    for (const i of Object.values(tree.individuals)) for (const e of i.events) if (e.place) set.add(placeText(e.place));
    for (const f of Object.values(tree.families)) for (const e of f.events) if (e.place) set.add(placeText(e.place));
    return [...set].sort();
  }, [tree]);

  const update = (key: number, patch: Partial<EventDraft>) => setEvents((evs) => evs.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  const remove = (key: number) => setEvents((evs) => evs.filter((e) => e.key !== key));
  const add = () => setEvents((evs) => [...evs, { key: draftKey++, type: evs.some((e) => e.type === 'birth') ? 'death' : 'birth', customType: '', value: '', dateText: '', placeText: '', cause: '', note: '' }]);

  const save = () => {
    const names: Name[] = [{ ...first, given: given.trim(), surname: surname.trim() }, ...person.names.slice(1)];
    if (nick.trim()) names[0]!.nick = nick.trim(); else delete names[0]!.nick;
    onSave({
      names,
      sex,
      events: events.map((d) => fromDraft(d, lang)),
      notes: notes.trim() ? notes.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean) : [],
      restriction: isPrivate ? 'privacy' : undefined,
    });
  };

  return (
    <form className="editor" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <div className="grid2">
        <label>{t(lang, 'givenName')}<input autoFocus value={given} onChange={(e) => setGiven(e.target.value)} /></label>
        <label>{t(lang, 'surname')}<input value={surname} onChange={(e) => setSurname(e.target.value)} /></label>
      </div>
      <div className="grid2">
        <label>{t(lang, 'nickname')}<input value={nick} onChange={(e) => setNick(e.target.value)} /></label>
        <fieldset className="sex">
          <legend>{t(lang, 'sex')}</legend>
          {(['M', 'F', 'U'] as Sex[]).map((s) => (
            <label key={s} className="radio"><input type="radio" name="sex" checked={sex === s} onChange={() => setSex(s)} />{t(lang, s === 'M' ? 'male' : s === 'F' ? 'female' : 'unknownSex')}</label>
          ))}
        </fieldset>
      </div>

      <h3>{t(lang, 'events')}</h3>
      <div className="event-drafts">
        {events.map((d) => {
          const di = interpretDate(d.dateText, d.original, lang);
          return (
            <div key={d.key} className="event-draft">
              <div className="row">
                <select value={d.type} onChange={(e) => update(d.key, { type: e.target.value as EventType })} aria-label={t(lang, 'eventType')}>
                  {EVENT_TYPES.map((ty) => <option key={ty} value={ty}>{eventLabel(lang, ty)}</option>)}
                </select>
                {d.type === 'custom' && <input value={d.customType} placeholder={t(lang, 'other')} onChange={(e) => update(d.key, { customType: e.target.value })} />}
                <button type="button" className="icon-btn" onClick={() => remove(d.key)} aria-label={t(lang, 'delete')}>×</button>
              </div>
              {(d.type === 'occupation' || d.type === 'residence' || d.type === 'education' || d.type === 'religion' || d.type === 'title' || d.type === 'description' || d.type === 'custom') && (
                <input value={d.value} placeholder={t(lang, 'description')} onChange={(e) => update(d.key, { value: e.target.value })} />
              )}
              <div className="grid2">
                <label className="stack">{t(lang, 'date')}
                  <input value={d.dateText} placeholder={t(lang, 'dateHint')} onChange={(e) => update(d.key, { dateText: e.target.value })} />
                  <span className={`date-preview ${di.ok ? '' : 'warn'}`}>{d.dateText.trim() ? (di.ok && di.date ? di.date.raw : t(lang, 'dateUnreadable')) : ''}</span>
                </label>
                <label className="stack">{t(lang, 'place')}
                  <input list="ramure-places" value={d.placeText} onChange={(e) => update(d.key, { placeText: e.target.value })} />
                </label>
              </div>
              {(d.type === 'death' || d.type === 'burial') && <input value={d.cause} placeholder={t(lang, 'cause')} onChange={(e) => update(d.key, { cause: e.target.value })} />}
              <textarea rows={1} value={d.note} placeholder={t(lang, 'notes')} onChange={(e) => update(d.key, { note: e.target.value })} />
            </div>
          );
        })}
      </div>
      <button type="button" className="btn" onClick={add}>{t(lang, 'addEvent')}</button>
      <datalist id="ramure-places">{places.map((p) => <option key={p} value={p} />)}</datalist>

      <h3>{t(lang, 'notes')}</h3>
      <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <label className="check"><input type="checkbox" checked={isPrivate} onChange={(e) => setPrivate(e.target.checked)} />{t(lang, 'privatePerson')}</label>

      <div className="row editor-actions">
        <button type="submit" className="btn primary">{t(lang, 'save')}</button>
        <button type="button" className="btn" onClick={onCancel}>{t(lang, 'cancel')}</button>
        <span className="spacer" />
        {confirmDelete ? (
          <span className="confirm">
            <span className="small">{t(lang, 'confirmDelete')}</span>
            <button type="button" className="btn danger" onClick={onDelete}>{t(lang, 'delete')}</button>
            <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>{t(lang, 'cancel')}</button>
          </span>
        ) : (
          <button type="button" className="btn subtle danger-text" onClick={() => setConfirmDelete(true)}>{t(lang, 'deletePerson')}</button>
        )}
      </div>
    </form>
  );
}

// ---------- Family (union) editor ----------

interface FamilyEditorProps {
  lang: Lang;
  unionType: 'married' | 'unmarried' | 'civil' | 'unknown';
  events: Event[];
  onSave(patch: { unionType: 'married' | 'unmarried' | 'civil' | 'unknown'; events: Event[] }): void;
  onCancel(): void;
}

export function FamilyEditor({ lang, unionType, events, onSave, onCancel }: FamilyEditorProps) {
  const [type, setType] = useState(unionType);
  const marr = events.find((e) => e.type === 'marriage'), div = events.find((e) => e.type === 'divorce');
  const [mDate, setMDate] = useState(marr?.date ? formatDate(marr.date, lang) : '');
  const [mPlace, setMPlace] = useState(placeText(marr?.place));
  const [dDate, setDDate] = useState(div?.date ? formatDate(div.date, lang) : '');
  const [dPlace, setDPlace] = useState(placeText(div?.place));

  const save = () => {
    const rest = events.filter((e) => e.type !== 'marriage' && e.type !== 'divorce');
    const out: Event[] = [];
    const build = (orig: Event | undefined, ty: EventType, dateText: string, place: string): Event | undefined => {
      if (!dateText.trim() && !place.trim() && !orig) return undefined;
      const e = orig ? { ...orig } : blankEvent(ty);
      e.date = interpretDate(dateText, orig, lang).date;
      const pt = place.trim();
      e.place = pt ? (orig?.place && placeText(orig.place) === pt ? orig.place : { text: pt, parts: pt.split(',').map((s) => s.trim()) }) : undefined;
      return e;
    };
    const m = (type === 'married' || marr) ? build(marr, 'marriage', mDate, mPlace) : undefined;
    if (m && (type === 'married' || m.date || m.place)) out.push(m);
    const d = build(div, 'divorce', dDate, dPlace);
    if (d && (dDate.trim() || dPlace.trim())) out.push(d);
    onSave({ unionType: type, events: [...out, ...rest] });
  };

  return (
    <form className="editor union-editor" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <label>{t(lang, 'unionType')}
        <select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="married">{t(lang, 'married')}</option>
          <option value="civil">{t(lang, 'civil')}</option>
          <option value="unmarried">{t(lang, 'unmarried')}</option>
          <option value="unknown">{t(lang, 'unknownUnion')}</option>
        </select>
      </label>
      {type !== 'unmarried' && (
        <div className="grid2">
          <label className="stack">{eventLabel(lang, 'marriage')} · {t(lang, 'date')}<input value={mDate} placeholder={t(lang, 'dateHint')} onChange={(e) => setMDate(e.target.value)} /></label>
          <label className="stack">{t(lang, 'place')}<input list="ramure-places" value={mPlace} onChange={(e) => setMPlace(e.target.value)} /></label>
        </div>
      )}
      <div className="grid2">
        <label className="stack">{eventLabel(lang, 'divorce')} · {t(lang, 'date')}<input value={dDate} placeholder={t(lang, 'dateHint')} onChange={(e) => setDDate(e.target.value)} /></label>
        <label className="stack">{t(lang, 'place')}<input list="ramure-places" value={dPlace} onChange={(e) => setDPlace(e.target.value)} /></label>
      </div>
      <div className="row">
        <button type="submit" className="btn primary">{t(lang, 'save')}</button>
        <button type="button" className="btn" onClick={onCancel}>{t(lang, 'cancel')}</button>
      </div>
    </form>
  );
}
