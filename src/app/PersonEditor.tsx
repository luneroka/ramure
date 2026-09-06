import { useMemo, useState } from 'react';
import { approximateYear, type GDate } from '../gedcom/dates';
import {
  placeText,
  type Event,
  type EventType,
  type Individual,
  type MediaObject,
  type Name,
  type Place,
  type Sex,
  type Tree,
} from '../gedcom/model';
import { eventLabel, t, type Lang } from '../i18n';
import { blankEvent, nextId, type PersonPatch } from '../tree/edit';
import { PortraitPicker } from './fields/Portrait';
import { mediaStore } from '../store';
import { DateField } from './fields/DateField';
import { PlaceField } from './fields/PlaceField';

interface Props {
  tree: Tree;
  person: Individual;
  lang: Lang;
  onSave(patch: PersonPatch): void;
  onCancel(): void;
  onDelete(): void;
  canDelete?: boolean;
}

const EVENT_TYPES: EventType[] = [
  'birth',
  'baptism',
  'death',
  'burial',
  'cremation',
  'occupation',
  'residence',
  'census',
  'education',
  'religion',
  'emigration',
  'immigration',
  'naturalization',
  'retirement',
  'will',
  'probate',
  'graduation',
  'confirmation',
  'first-communion',
  'title',
  'description',
  'custom',
];
const WITH_DESCRIPTION = new Set<EventType>(['occupation', 'residence', 'education', 'religion', 'title', 'description', 'custom']);

/** Someone born this long ago gets a death row offered by default. */
const DEATH_AFTER_YEARS = 100;

interface EventDraft {
  key: number;
  type: EventType;
  customType: string;
  value: string;
  date?: GDate;
  place?: Place;
  cause: string;
  note: string;
  original?: Event;
  /** Offered by default; dropped on save if left empty. */
  suggested?: boolean;
}

let draftKey = 1;

function toDraft(e: Event): EventDraft {
  return {
    key: draftKey++,
    type: e.type,
    customType: e.customType ?? '',
    value: e.value ?? '',
    date: e.date,
    place: e.place,
    cause: e.cause ?? '',
    note: e.notes.join('\n\n'),
    original: e,
  };
}

function emptyDraft(type: EventType, suggested = false): EventDraft {
  return { key: draftKey++, type, customType: '', value: '', cause: '', note: '', suggested };
}

function isBlank(d: EventDraft): boolean {
  return !d.date && !d.place && !d.value.trim() && !d.cause.trim() && !d.note.trim() && !(d.type === 'custom' && d.customType.trim());
}

function fromDraft(d: EventDraft): Event {
  const base = d.original ? { ...d.original } : blankEvent(d.type);
  if (base.type !== d.type) {
    const fresh = blankEvent(d.type);
    base.type = fresh.type;
    base.tag = fresh.tag;
  }
  base.customType = d.type === 'custom' ? d.customType.trim() || undefined : undefined;
  base.value = d.value.trim() || undefined;
  base.date = d.date;
  base.place = d.place;
  base.cause = d.cause.trim() || undefined;
  base.notes = d.note.trim()
    ? d.note
        .split(/\n{2,}/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  return base;
}

function bornLongAgo(drafts: EventDraft[]): boolean {
  const birth = drafts.find((d) => d.type === 'birth' || d.type === 'baptism');
  const y = approximateYear(birth?.date);
  return y !== undefined && new Date().getFullYear() - y > DEATH_AFTER_YEARS;
}

/** Initial rows: the person's events, plus an empty birth and, when warranted, an empty death. */
function initialDrafts(person: Individual): EventDraft[] {
  const drafts = person.events.map(toDraft);
  if (!drafts.some((d) => d.type === 'birth')) drafts.unshift(emptyDraft('birth', true));
  if (!drafts.some((d) => d.type === 'death' || d.type === 'burial') && bornLongAgo(drafts)) {
    const i = drafts.findIndex((d) => d.type === 'birth' || d.type === 'baptism');
    drafts.splice(i + 1, 0, emptyDraft('death', true));
  }
  return drafts;
}

export function knownPlaces(tree: Tree): Place[] {
  const seen = new Set<string>();
  const out: Place[] = [];
  const add = (p?: Place) => {
    if (!p) return;
    const k = placeText(p).toLowerCase();
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(p);
  };
  for (const i of Object.values(tree.individuals)) for (const e of i.events) add(e.place);
  for (const f of Object.values(tree.families)) for (const e of f.events) add(e.place);
  return out.sort((a, b) => placeText(a).localeCompare(placeText(b)));
}

export function PersonEditor({ tree, person, lang, onSave, onCancel, onDelete, canDelete = true }: Props) {
  const first = person.names[0] ?? { given: '', surname: '' };
  const [given, setGiven] = useState(first.given);
  const [surname, setSurname] = useState(first.surname);
  const [nick, setNick] = useState(first.nick ?? '');
  const [sex, setSex] = useState<Sex>(person.sex);
  const [notes, setNotes] = useState(person.notes.join('\n\n'));
  const [events, setEvents] = useState<EventDraft[]>(() => initialDrafts(person));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [portrait, setPortrait] = useState<MediaObject | null | undefined>(undefined);
  const places = useMemo(() => knownPlaces(tree), [tree]);
  const allocateMediaId = () => `${nextId(tree, 'M')}-${Date.now().toString(36)}`;
  const cancel = () => {
    if (portrait) void mediaStore.delete(portrait.id);
    onCancel();
  };

  const update = (key: number, patch: Partial<EventDraft>) =>
    setEvents((evs) => {
      const next = evs.map((e) => (e.key === key ? { ...e, ...patch, suggested: false } : e));
      // A birth more than a century ago earns an empty death row, once.
      if ('date' in patch && !next.some((d) => d.type === 'death' || d.type === 'burial') && bornLongAgo(next)) {
        const i = next.findIndex((d) => d.type === 'birth' || d.type === 'baptism');
        next.splice(i + 1, 0, emptyDraft('death', true));
      }
      return next;
    });
  const remove = (key: number) => setEvents((evs) => evs.filter((e) => e.key !== key));
  const add = () =>
    setEvents((evs) => [
      ...evs,
      emptyDraft(
        evs.some((e) => e.type === 'death') ? 'occupation' : evs.some((e) => e.type === 'birth' && !isBlank(e)) ? 'death' : 'birth',
      ),
    ]);

  const save = () => {
    const names: Name[] = [{ ...first, given: given.trim(), surname: surname.trim() }, ...person.names.slice(1)];
    if (nick.trim()) names[0]!.nick = nick.trim();
    else delete names[0]!.nick;
    onSave({
      names,
      sex,
      events: events.filter((d) => !isBlank(d) || (d.original && !d.suggested)).map(fromDraft),
      notes: notes.trim()
        ? notes
            .split(/\n{2,}/)
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      ...(portrait !== undefined ? { portrait } : {}),
    });
  };

  return (
    <form
      className="editor"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <h3>{t(lang, 'portrait')}</h3>
      <PortraitPicker lang={lang} current={person.mediaIds[0]} allocateId={allocateMediaId} onChange={setPortrait} />

      <div className="grid2">
        <label>
          {t(lang, 'givenName')}
          <input autoFocus value={given} onChange={(e) => setGiven(e.target.value)} />
        </label>
        <label>
          {t(lang, 'surname')}
          <input value={surname} onChange={(e) => setSurname(e.target.value)} />
        </label>
      </div>
      <div className="grid2">
        <label>
          {t(lang, 'nickname')}
          <input value={nick} onChange={(e) => setNick(e.target.value)} />
        </label>
        <fieldset className="sex">
          <legend>{t(lang, 'sex')}</legend>
          {(['M', 'F', 'U'] as Sex[]).map((s) => (
            <label key={s} className="radio">
              <input type="radio" name="sex" checked={sex === s} onChange={() => setSex(s)} />
              {t(lang, s === 'M' ? 'male' : s === 'F' ? 'female' : 'unknownSex')}
            </label>
          ))}
        </fieldset>
      </div>

      <h3>{t(lang, 'events')}</h3>
      <div className="event-drafts">
        {events.map((d) => (
          <div key={d.key} className={`event-draft ${d.suggested ? 'suggested' : ''}`}>
            <div className="row">
              <select
                value={d.type}
                onChange={(e) => update(d.key, { type: e.target.value as EventType })}
                aria-label={t(lang, 'eventType')}
              >
                {EVENT_TYPES.map((ty) => (
                  <option key={ty} value={ty}>
                    {eventLabel(lang, ty)}
                  </option>
                ))}
              </select>
              {d.type === 'custom' && (
                <input
                  value={d.customType}
                  placeholder={t(lang, 'other')}
                  onChange={(e) => update(d.key, { customType: e.target.value })}
                />
              )}
              <button type="button" className="icon-btn" onClick={() => remove(d.key)} aria-label={t(lang, 'delete')}>
                ×
              </button>
            </div>
            {WITH_DESCRIPTION.has(d.type) && (
              <input value={d.value} placeholder={t(lang, 'description')} onChange={(e) => update(d.key, { value: e.target.value })} />
            )}
            <DateField key={`d${d.key}`} lang={lang} value={d.date} onChange={(date) => update(d.key, { date })} />
            <PlaceField key={`p${d.key}`} lang={lang} value={d.place} known={places} onChange={(place) => update(d.key, { place })} />
            {(d.type === 'death' || d.type === 'burial') && (
              <input value={d.cause} placeholder={t(lang, 'cause')} onChange={(e) => update(d.key, { cause: e.target.value })} />
            )}
            <textarea rows={1} value={d.note} placeholder={t(lang, 'notes')} onChange={(e) => update(d.key, { note: e.target.value })} />
          </div>
        ))}
      </div>
      <button type="button" className="btn" onClick={add}>
        {t(lang, 'addEvent')}
      </button>

      <h3>{t(lang, 'notes')}</h3>
      <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />

      <div className="row editor-actions">
        <button type="submit" className="btn primary">
          {t(lang, 'save')}
        </button>
        <button type="button" className="btn" onClick={cancel}>
          {t(lang, 'cancel')}
        </button>
        <span className="spacer" />
        {!canDelete ? null : confirmDelete ? (
          <span className="confirm">
            <span className="small">{t(lang, 'confirmDelete')}</span>
            <button type="button" className="btn danger" onClick={onDelete}>
              {t(lang, 'delete')}
            </button>
            <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
              {t(lang, 'cancel')}
            </button>
          </span>
        ) : (
          <button type="button" className="btn subtle danger-text" onClick={() => setConfirmDelete(true)}>
            {t(lang, 'deletePerson')}
          </button>
        )}
      </div>
    </form>
  );
}

// ---------- Family (union) editor ----------

interface FamilyEditorProps {
  tree: Tree;
  lang: Lang;
  unionType: 'married' | 'unmarried' | 'civil' | 'unknown';
  events: Event[];
  onSave(patch: { unionType: 'married' | 'unmarried' | 'civil' | 'unknown'; events: Event[] }): void;
  onCancel(): void;
}

export function FamilyEditor({ tree, lang, unionType, events, onSave, onCancel }: FamilyEditorProps) {
  const [type, setType] = useState(unionType);
  const marr = events.find((e) => e.type === 'marriage'),
    div = events.find((e) => e.type === 'divorce');
  const [mDate, setMDate] = useState<GDate | undefined>(marr?.date);
  const [mPlace, setMPlace] = useState<Place | undefined>(marr?.place);
  const [dDate, setDDate] = useState<GDate | undefined>(div?.date);
  const [dPlace, setDPlace] = useState<Place | undefined>(div?.place);
  const places = useMemo(() => knownPlaces(tree), [tree]);

  const save = () => {
    const rest = events.filter((e) => e.type !== 'marriage' && e.type !== 'divorce');
    const out: Event[] = [];
    const build = (orig: Event | undefined, ty: EventType, date?: GDate, place?: Place): Event | undefined => {
      if (!date && !place && !orig) return undefined;
      const e = orig ? { ...orig } : blankEvent(ty);
      e.date = date;
      e.place = place;
      return e;
    };
    const m = type !== 'unmarried' ? build(marr, 'marriage', mDate, mPlace) : undefined;
    if (m && (type === 'married' || m.date || m.place)) out.push(m);
    const d = build(div, 'divorce', dDate, dPlace);
    if (d && (dDate || dPlace)) out.push(d);
    onSave({ unionType: type, events: [...out, ...rest] });
  };

  return (
    <form
      className="editor union-editor"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label>
        {t(lang, 'unionType')}
        <select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="married">{t(lang, 'married')}</option>
          <option value="civil">{t(lang, 'civil')}</option>
          <option value="unmarried">{t(lang, 'unmarried')}</option>
          <option value="unknown">{t(lang, 'unknownUnion')}</option>
        </select>
      </label>
      {type !== 'unmarried' && (
        <>
          <DateField lang={lang} value={mDate} onChange={setMDate} label={`${eventLabel(lang, 'marriage')} · ${t(lang, 'date')}`} />
          <PlaceField
            lang={lang}
            value={mPlace}
            known={places}
            onChange={setMPlace}
            label={`${eventLabel(lang, 'marriage')} · ${t(lang, 'place')}`}
          />
        </>
      )}
      <DateField lang={lang} value={dDate} onChange={setDDate} label={`${eventLabel(lang, 'divorce')} · ${t(lang, 'date')}`} />
      <PlaceField
        lang={lang}
        value={dPlace}
        known={places}
        onChange={setDPlace}
        label={`${eventLabel(lang, 'divorce')} · ${t(lang, 'place')}`}
      />
      <div className="row">
        <button type="submit" className="btn primary">
          {t(lang, 'save')}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          {t(lang, 'cancel')}
        </button>
      </div>
    </form>
  );
}
