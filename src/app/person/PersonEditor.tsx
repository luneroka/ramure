/**
 * The person editor: a modal over everything, in sections that fold away
 * (identity, the life's events, the unions, notes, the « à vérifier » flag),
 * that returns one patch on save. The union editor below it is inline in the
 * panel's Famille tab instead.
 *
 * A marriage, a divorce and the like belong to the union, not to either
 * partner: GEDCOM keeps them on the family record. The editor still lists them
 * here, in their own section, because a person's record is where one looks for
 * them, and hands each changed union back beside the person's patch so both are
 * saved as one edit.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { approximateYear, type GDate } from '@/gedcom/dates';
import {
  displayName,
  placeText,
  type Event,
  type EventType,
  type Individual,
  type MediaObject,
  type Name,
  type Place,
  type Sex,
  type Tree,
} from '@/gedcom/model';
import { eventLabel, t, type Lang } from '@/i18n';
import { blankEvent, type FamilyPatch, type PersonPatch, portraitId } from '@/tree/edit';
import { newId } from '@/tree/ids';
import { PortraitPicker } from '@/app/person/fields/Portrait';
import { mediaStore } from '@/store';
import { DateField } from '@/app/person/fields/DateField';
import { PlaceField } from '@/app/person/fields/PlaceField';
import { useDialog } from '@/app/ui/useDialog';
import { UNION_EVENTS } from '@/app/lib/lifeEvents';

/** A union whose events changed in the editor: a marriage, a divorce… edited, added or removed. */
export interface UnionChange {
  familyId: string;
  patch: FamilyPatch;
}

interface Props {
  tree: Tree;
  person: Individual;
  lang: Lang;
  onSave(patch: PersonPatch, unions: UnionChange[]): void;
  onCancel(): void;
  onDelete(): void;
  canDelete?: boolean;
  /** A draft relative: title and hint change, no delete. */
  isDraft?: boolean;
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
/** What a union can record, in the order a couple would go through it. */
const UNION_TYPES: EventType[] = ['engagement', 'marriage', 'separation', 'divorce', 'annulment'];
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
  /** The union a row belongs to: saved on that family, not on the person. */
  familyId?: string;
  /**
   * The section the row is drawn in. Fixed when the row is made, so a row whose type changes between a
   * person's event and a union's stays under the eye rather than jumping to the other section.
   */
  section: 'life' | 'unions';
  /** Added in this sitting with « + Événement »: drawn apart from the rows the record already had. */
  fresh?: boolean;
  /** Offered by default; dropped on save if left empty. */
  suggested?: boolean;
}

let draftKey = 1;

function toDraft(e: Event, familyId?: string): EventDraft {
  return {
    key: draftKey++,
    familyId,
    section: familyId ? 'unions' : 'life',
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
  return { key: draftKey++, type, customType: '', value: '', cause: '', note: '', section: 'life', suggested };
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

/** The person's unions that exist in the tree, with the partner's name for the row that says « avec … ». */
function unionsOf(tree: Tree, person: Individual, lang: Lang): Array<{ id: string; partner: string }> {
  return person.partnerIn.flatMap((fid) => {
    const f = tree.families[fid];
    if (!f) return [];
    const pid = f.husbandId === person.id ? f.wifeId : f.husbandId;
    const partner = pid ? tree.individuals[pid] : undefined;
    return [{ id: fid, partner: partner ? displayName(partner) : t(lang, 'unknownPerson') }];
  });
}

/**
 * Initial rows: the person's events and their unions' events, plus an empty birth and, when
 * warranted, an empty death.
 */
function initialDrafts(person: Individual, tree: Tree, withUnions: boolean): EventDraft[] {
  const drafts = person.events.map((e) => toDraft(e));
  if (withUnions)
    drafts.push(
      ...person.partnerIn.flatMap((fid) =>
        (tree.families[fid]?.events ?? []).filter((e) => UNION_EVENTS.has(e.type)).map((e) => toDraft(e, fid)),
      ),
    );
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

export function PersonEditor({ tree, person, lang, onSave, onCancel, onDelete, canDelete = true, isDraft = false }: Props) {
  const first = person.names[0] ?? { given: '', surname: '' };
  const [given, setGiven] = useState(first.given);
  const [surname, setSurname] = useState(first.surname);
  const [nick, setNick] = useState(first.nick ?? '');
  const [sex, setSex] = useState<Sex>(person.sex);
  const [notes, setNotes] = useState(person.notes.join('\n\n'));
  const [unsure, setUnsure] = useState(!!person.unsure);
  // A relative being added has no union of its own yet to carry a marriage or a divorce.
  const unions = useMemo(() => (isDraft ? [] : unionsOf(tree, person, lang)), [isDraft, tree, person, lang]);
  const [events, setEvents] = useState<EventDraft[]>(() => initialDrafts(person, tree, !isDraft));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [portrait, setPortrait] = useState<MediaObject | null | undefined>(undefined);
  const places = useMemo(() => knownPlaces(tree), [tree]);
  const allocateMediaId = () => newId('M');
  const cancel = () => {
    if (portrait) void mediaStore.delete(portrait.id);
    onCancel();
  };
  // Escape cancels through a ref, so a portrait picked after mount is still cleaned up.
  const cancelRef = useRef(cancel);
  useEffect(() => {
    cancelRef.current = cancel;
  });
  const dialog = useDialog<HTMLFormElement>(true, () => cancelRef.current());

  const update = (key: number, patch: Partial<EventDraft>) =>
    setEvents((evs) => {
      const next = evs.map((e) => {
        if (e.key !== key) return e;
        const merged = { ...e, ...patch, suggested: false };
        // A union's event is saved on a union: picking one gives the row the first, picking anything else takes it away.
        if (patch.type) merged.familyId = UNION_EVENTS.has(patch.type) ? (merged.familyId ?? unions[0]?.id) : undefined;
        return merged;
      });
      // A birth more than a century ago earns an empty death row, once.
      if ('date' in patch && !next.some((d) => d.type === 'death' || d.type === 'burial') && bornLongAgo(next)) {
        const i = next.findIndex((d) => d.type === 'birth' || d.type === 'baptism');
        next.splice(i + 1, 0, emptyDraft('death', true));
      }
      return next;
    });
  const remove = (key: number) => setEvents((evs) => evs.filter((e) => e.key !== key));
  /** The row just added: brought into view with its type ready to choose, once it is drawn. */
  const [justAdded, setJustAdded] = useState<number | null>(null);
  useEffect(() => {
    if (justAdded === null) return;
    const row = dialog.current?.querySelector<HTMLElement>(`[data-draft="${justAdded}"]`);
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    row?.querySelector('select')?.focus({ preventScroll: true });
  }, [justAdded, dialog]);
  const append = (d: EventDraft) => {
    setEvents((evs) => [...evs, { ...d, fresh: true }]);
    setJustAdded(d.key);
  };
  const add = () =>
    append(
      emptyDraft(
        events.some((e) => e.type === 'death') ? 'occupation' : events.some((e) => e.type === 'birth' && !isBlank(e)) ? 'death' : 'birth',
      ),
    );
  /** A new union row: on the first union, a marriage unless it has one already, then a divorce. */
  const addUnionEvent = () => {
    const familyId = unions[0]!.id;
    const married = events.some((e) => e.familyId === familyId && e.type === 'marriage');
    append({ ...emptyDraft(married ? 'divorce' : 'marriage'), familyId, section: 'unions' });
  };
  const lifeRows = events.filter((d) => d.section === 'life');
  const unionRows = events.filter((d) => d.section === 'unions');

  /** The unions whose events differ from what the tree holds, each with its new event list. */
  const unionChanges = (kept: EventDraft[]): UnionChange[] =>
    unions.flatMap(({ id }) => {
      const fam = tree.families[id]!;
      const before = fam.events.filter((e) => UNION_EVENTS.has(e.type));
      const after = kept.filter((d) => d.familyId === id).map(fromDraft);
      if (JSON.stringify(before) === JSON.stringify(after)) return [];
      const patch: FamilyPatch = { events: [...after, ...fam.events.filter((e) => !UNION_EVENTS.has(e.type))] };
      // Recording a marriage says the couple married, whatever the union was set to.
      const married = after.some((e) => e.type === 'marriage');
      if (married && (fam.unionType === 'unknown' || fam.unionType === 'unmarried')) patch.unionType = 'married';
      return [{ familyId: id, patch }];
    });

  const save = () => {
    const kept = events.filter((d) => !isBlank(d) || (d.original && !d.suggested));
    const names: Name[] = [{ ...first, given: given.trim(), surname: surname.trim() }, ...person.names.slice(1)];
    if (nick.trim()) names[0]!.nick = nick.trim();
    else delete names[0]!.nick;
    onSave(
      {
        names,
        sex,
        unsure: unsure || undefined,
        events: kept.filter((d) => !d.familyId).map(fromDraft),
        notes: notes.trim()
          ? notes
              .split(/\n{2,}/)
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
        ...(portrait !== undefined ? { portrait } : {}),
      },
      unionChanges(kept),
    );
  };

  /**
   * One event's row, the same in « Parcours » and « Unions ». Both offer every type: the person's own
   * and, when there is a union to carry them, the union's, under their own heading in the list.
   */
  const eventRow = (d: EventDraft) => (
    <div key={d.key} data-draft={d.key} className={`ev-draft ${d.suggested ? 'suggested' : ''} ${d.fresh ? 'fresh' : ''}`}>
      {d.fresh && <span className="ev-new">{t(lang, 'newEvent')}</span>}
      <div className="ev-top">
        <select value={d.type} onChange={(e) => update(d.key, { type: e.target.value as EventType })} aria-label={t(lang, 'eventType')}>
          {!EVENT_TYPES.includes(d.type) && !UNION_TYPES.includes(d.type) && <option value={d.type}>{eventLabel(lang, d.type)}</option>}
          <optgroup label={t(lang, 'lifeEvents')}>
            {EVENT_TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {eventLabel(lang, ty)}
              </option>
            ))}
          </optgroup>
          {(unions.length > 0 || UNION_TYPES.includes(d.type)) && (
            <optgroup label={t(lang, 'sectionUnions')}>
              {UNION_TYPES.map((ty) => (
                <option key={ty} value={ty}>
                  {eventLabel(lang, ty)}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {d.familyId &&
          (unions.length > 1 ? (
            <select
              value={d.familyId}
              onChange={(e) => update(d.key, { familyId: e.target.value })}
              aria-label={t(lang, 'marriagePartner')}
            >
              {unions.map((u) => (
                <option key={u.id} value={u.id}>
                  {t(lang, 'with')} {u.partner}
                </option>
              ))}
            </select>
          ) : (
            <span className="ev-with">
              {t(lang, 'with')} {unions.find((u) => u.id === d.familyId)?.partner}
            </span>
          ))}
        {d.type === 'custom' && (
          <input value={d.customType} placeholder={t(lang, 'other')} onChange={(e) => update(d.key, { customType: e.target.value })} />
        )}
        {WITH_DESCRIPTION.has(d.type) && (
          <input value={d.value} placeholder={t(lang, 'description')} onChange={(e) => update(d.key, { value: e.target.value })} />
        )}
        <button type="button" className="icon-btn" onClick={() => remove(d.key)} aria-label={t(lang, 'delete')}>
          ×
        </button>
      </div>
      <div className="ed-grid">
        <DateField key={`d${d.key}`} lang={lang} value={d.date} onChange={(date) => update(d.key, { date })} />
        <PlaceField key={`p${d.key}`} lang={lang} value={d.place} known={places} onChange={(place) => update(d.key, { place })} />
      </div>
      {(d.type === 'death' || d.type === 'burial') && (
        <input value={d.cause} placeholder={t(lang, 'cause')} onChange={(e) => update(d.key, { cause: e.target.value })} />
      )}
      <input value={d.note} placeholder={t(lang, 'notes')} onChange={(e) => update(d.key, { note: e.target.value })} />
    </div>
  );

  const title = isDraft ? t(lang, 'newPersonTitle') : t(lang, 'editPerson');
  const shownName = [given, surname].filter((s) => s.trim()).join(' ');

  // The dialog is drawn at the root of the page, not inside the panel that opens it. The panel clips
  // its content (`overflow: hidden`); the backdrop escapes that clip by being positioned against the
  // whole app, which every browser draws correctly except Safari once the form is long enough to
  // scroll: it gives the scrolling body a layer of its own and clips that layer to the panel, so the
  // form came up blank between its title and its buttons for anyone with three or more events.
  return createPortal(
    <div className="dialog-backdrop editor-backdrop" onClick={cancel}>
      <form
        ref={dialog}
        className="dialog editor-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <header className="editor-head">
          <h2>{title}</h2>
          {shownName && !isDraft && <span className="muted">{shownName}</span>}
          <span className="spacer" />
          <button type="button" className="icon-btn" onClick={cancel} aria-label={t(lang, 'close')}>
            ×
          </button>
        </header>

        <div className="editor-body editor">
          {isDraft && <p className="ed-hint">{t(lang, 'draftHint')}</p>}

          <section className="ed-section ed-fixed">
            <h3 className="band">{t(lang, 'sectionIdentity')}</h3>
            <div className="ed-identity">
              <PortraitPicker lang={lang} current={portraitId(person, tree)} allocateId={allocateMediaId} onChange={setPortrait} compact />
              <div className="ed-grid">
                <label className="ed-field">
                  <span>{t(lang, 'givenName')}</span>
                  <input autoFocus value={given} onChange={(e) => setGiven(e.target.value)} />
                </label>
                <label className="ed-field">
                  <span>{t(lang, 'surname')}</span>
                  <input value={surname} onChange={(e) => setSurname(e.target.value)} />
                </label>
                <label className="ed-field">
                  <span>{t(lang, 'nickname')}</span>
                  <input value={nick} onChange={(e) => setNick(e.target.value)} />
                </label>
                <div className="ed-field">
                  <span>{t(lang, 'sex')}</span>
                  <div className="seg-input" role="radiogroup" aria-label={t(lang, 'sex')}>
                    {(['M', 'F', 'U'] as Sex[]).map((s) => (
                      <button
                        key={s}
                        type="button"
                        role="radio"
                        aria-checked={sex === s}
                        aria-pressed={sex === s}
                        onClick={() => setSex(s)}
                      >
                        {t(lang, s === 'M' ? 'male' : s === 'F' ? 'female' : 'unknownSex')}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <EdSection title={t(lang, 'lifeEvents')} count={lifeRows.length} open>
            <div className="event-drafts">{lifeRows.map(eventRow)}</div>
            <div className="row small-actions">
              <button type="button" className="btn small" onClick={add}>
                + {t(lang, 'addEvent')}
              </button>
            </div>
          </EdSection>

          {unions.length > 0 && (
            <EdSection title={t(lang, 'sectionUnions')} count={unionRows.length}>
              <div className="event-drafts">{unionRows.map(eventRow)}</div>
              <div className="row small-actions">
                <button type="button" className="btn small" onClick={addUnionEvent}>
                  + {t(lang, 'addEvent')}
                </button>
              </div>
            </EdSection>
          )}

          <EdSection title={t(lang, 'notes')}>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} aria-label={t(lang, 'notes')} />
          </EdSection>

          <EdSection title={t(lang, 'sectionTracking')}>
            <label className="check">
              <input type="checkbox" checked={unsure} onChange={(e) => setUnsure(e.target.checked)} />
              {t(lang, 'unsureLabel')}
            </label>
            <p className="ed-hint">{t(lang, 'unsureHint')}</p>
          </EdSection>
        </div>

        <footer className="editor-foot">
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
        </footer>
      </form>
    </div>,
    document.body,
  );
}

/**
 * A section of the editor that folds away. A native `<details>`: the summary is a real button for the
 * keyboard and for screen readers, and nothing has to remember which ones are open. « Identité » is
 * not one of them: the name is what the editor is for, so it always shows. Of the rest only
 * « Parcours » starts open, so a long record opens on its events rather than on a page of fields.
 */
function EdSection({ title, count, open = false, children }: { title: string; count?: number; open?: boolean; children: React.ReactNode }) {
  return (
    <details className="ed-section" open={open}>
      <summary className="band">
        <span>{title}</span>
        {count !== undefined && count > 0 && <span className="ed-count">{count}</span>}
      </summary>
      <div className="ed-section-body">{children}</div>
    </details>
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
