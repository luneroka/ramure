import { useState } from 'react';
import { formatDate } from '../gedcom/dates';
import { displayName, findEvent, placeText, type Event, type Family, type Individual, type Tree } from '../gedcom/model';
import { eventLabel, t, tg, type Lang } from '../i18n';
import { isLiving } from '../canvas/renderer';
import type { FamilyPatch, PersonPatch } from '../tree/edit';
import { FamilyEditor, PersonEditor } from './PersonEditor';
import { PersonPicker } from './PersonPicker';

export interface PanelActions {
  onFocus(id: string): void;
  onSelect(id: string): void;
  onClose(): void;
  onSavePerson(id: string, patch: PersonPatch): void;
  onDeletePerson(id: string): void;
  onSaveFamily(id: string, patch: FamilyPatch): void;
  onAddChild(personId: string, familyId: string): void;
  onLinkPartner(personId: string, partnerId: string): void;
  onLinkChild(familyId: string, childId: string): void;
  onUnlinkChild(familyId: string, childId: string): void;
  onMerge(keepId: string, dropId: string): void;
}

interface Props extends PanelActions {
  tree: Tree;
  person: Individual;
  lang: Lang;
  /** Open directly in edit mode (after "add relative"). */
  editing: boolean;
  /** The person is a draft relative: not yet in the tree. */
  isDraft?: boolean;
  setEditing(v: boolean): void;
}

function EventRow({ e, lang, tree }: { e: Event; lang: Lang; tree: Tree }) {
  const bits: string[] = [];
  if (e.value) bits.push(e.value);
  if (e.date) bits.push(formatDate(e.date, lang));
  if (e.place) bits.push(placeText(e.place));
  return (
    <li className="event">
      <span className="event-label">{eventLabel(lang, e.type, e.customType)}</span>
      <span className="event-body">
        {bits.join(' · ') || '—'}
        {e.cause && <span className="event-extra">{t(lang, 'cause')} : {e.cause}</span>}
        {e.age && <span className="event-extra">{t(lang, 'age')} : {e.age}</span>}
        {e.address && <span className="event-extra">{t(lang, 'address')} : {e.address}</span>}
        {e.notes.map((n, i) => <span key={i} className="event-note">{n}</span>)}
        {e.citations.map((c, i) => {
          const src = c.sourceId ? tree.sources[c.sourceId] : undefined;
          const text = src ? [src.title, c.page].filter(Boolean).join(', ') : c.flat ?? '';
          return text ? <span key={i} className="event-cite">{text}</span> : null;
        })}
      </span>
    </li>
  );
}

type Picking = { kind: 'merge' } | { kind: 'partner' } | { kind: 'child'; familyId: string } | null;

export function PersonPanel(props: Props) {
  const { tree, person, lang, editing, isDraft, setEditing, onFocus, onSelect, onClose } = props;
  const [picking, setPicking] = useState<Picking>(null);
  const [editingFamily, setEditingFamily] = useState<string | null>(null);
  const name = displayName(person) === '?' ? t(lang, 'newPersonName') : displayName(person);
  const sexGlyph = person.sex === 'M' ? '♂' : person.sex === 'F' ? '♀' : '';
  const living = isLiving(person);

  const parentFamilies = person.childOf.map((l) => ({ link: l, fam: tree.families[l.familyId] })).filter((x): x is { link: typeof x.link; fam: Family } => !!x.fam);
  const parents = parentFamilies.flatMap(({ link, fam }) =>
    [fam.husbandId, fam.wifeId].filter((id): id is string => !!id && !!tree.individuals[id]).map((id) => ({ id, pedigree: link.pedigree })),
  );
  const siblings = parentFamilies.flatMap(({ fam }) => fam.childIds.filter((c) => c !== person.id && tree.individuals[c]));
  const unions = person.partnerIn.map((fid) => tree.families[fid]).filter((f): f is Family => !!f);

  const Person = ({ id, tag, onRemove }: { id: string; tag?: string; onRemove?: () => void }) => {
    const p = tree.individuals[id]!;
    const b = findEvent(p.events, 'birth'), d = findEvent(p.events, 'death');
    const years = [b?.date?.date?.year, d?.date?.date?.year].filter((y) => y !== undefined).join('–');
    return (
      <li className="person-row">
        <button className="link-person" onClick={() => onSelect(id)} onDoubleClick={() => onFocus(id)}>
          <span className={`sex-dot ${p.sex}`} aria-hidden="true" />
          <span className="link-name">{displayName(p)}</span>
          {years && <span className="link-years">{years}</span>}
          {tag && <span className="tag">{tag}</span>}
        </button>
        {onRemove && <button className="icon-btn small" onClick={onRemove} title={t(lang, 'unlink')} aria-label={t(lang, 'unlink')}>⨯</button>}
      </li>
    );
  };

  if (editing) {
    return (
      <aside className="panel" aria-label={name}>
        <header className="panel-head">
          <h2 className="panel-name">{name}</h2>
          <button className="icon-btn" onClick={() => setEditing(false)} aria-label={t(lang, 'close')}>×</button>
        </header>
        {isDraft && <p className="muted small draft-hint">{t(lang, 'draftHint')}</p>}
        <PersonEditor
          tree={tree}
          person={person}
          lang={lang}
          canDelete={!isDraft}
          onSave={(patch) => { props.onSavePerson(person.id, patch); if (!isDraft) setEditing(false); }}
          onCancel={() => setEditing(false)}
          onDelete={() => { props.onDeletePerson(person.id); setEditing(false); }}
        />
      </aside>
    );
  }

  const lifeEvents = person.events.filter((e) => ['birth', 'baptism', 'death', 'burial', 'cremation'].includes(e.type));
  const otherEvents = person.events.filter((e) => !lifeEvents.includes(e));

  return (
    <aside className="panel" aria-label={name}>
      <header className="panel-head">
        <div>
          <h2 className="panel-name">{name} <span className="panel-sex" aria-hidden="true">{sexGlyph}</span></h2>
          <div className="panel-tags">
            {person.names[0]?.nick && <span className="tag">« {person.names[0].nick} »</span>}
            {person.names.slice(1).map((n, i) => <span key={i} className="tag">{[n.given, n.surname].filter(Boolean).join(' ')}{n.type ? ` (${n.type})` : ''}</span>)}
            {living && <span className="tag living">{tg(lang, 'living', person.sex)}</span>}
            {person.restriction && <span className="tag">{t(lang, 'private')}</span>}
          </div>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label={t(lang, 'close')}>×</button>
      </header>

      <div className="row panel-actions">
        <button className="btn primary" onClick={() => onFocus(person.id)}>{t(lang, 'focusOn')}</button>
        <button className="btn" onClick={() => setEditing(true)}>{t(lang, 'edit')}</button>
      </div>

      {picking?.kind === 'merge' && (
        <PersonPicker tree={tree} lang={lang} exclude={[person.id]} hint={t(lang, 'mergeHint')} onCancel={() => setPicking(null)} onPick={(id) => { props.onMerge(person.id, id); setPicking(null); }} />
      )}
      {picking?.kind === 'partner' && (
        <PersonPicker tree={tree} lang={lang} exclude={[person.id]} onCancel={() => setPicking(null)} onPick={(id) => { props.onLinkPartner(person.id, id); setPicking(null); }} />
      )}
      {picking?.kind === 'child' && (
        <PersonPicker tree={tree} lang={lang} exclude={[person.id, ...(tree.families[picking.familyId]?.childIds ?? [])]} onCancel={() => setPicking(null)} onPick={(id) => { props.onLinkChild(picking.familyId, id); setPicking(null); }} />
      )}

      {lifeEvents.length > 0 && <ul className="events">{lifeEvents.map((e, i) => <EventRow key={i} e={e} lang={lang} tree={tree} />)}</ul>}

      {parents.length > 0 && (
        <section>
          <h3>{t(lang, 'parents')}</h3>
          <ul className="people">{parents.map((p) => <Person key={p.id} id={p.id} tag={p.pedigree === 'adopted' ? tg(lang, 'adopted', person.sex) : undefined} />)}</ul>
        </section>
      )}
      {siblings.length > 0 && (
        <section>
          <h3>{t(lang, 'siblings')}</h3>
          <ul className="people">{siblings.map((id) => <Person key={id} id={id} />)}</ul>
        </section>
      )}
      <section>
        <h3>{t(lang, 'partners')}</h3>
        {unions.map((f) => {
          const partnerId = f.husbandId === person.id ? f.wifeId : f.husbandId;
          const marr = findEvent(f.events, 'marriage'), div = findEvent(f.events, 'divorce');
          const line = [
            marr && `${eventLabel(lang, 'marriage')} ${marr.date ? formatDate(marr.date, lang) : ''}${marr.place ? ', ' + placeText(marr.place) : ''}`,
            div && `${eventLabel(lang, 'divorce')} ${div.date ? formatDate(div.date, lang) : ''}`,
            f.unionType === 'unmarried' && t(lang, 'unmarried'),
            f.unionType === 'civil' && t(lang, 'civil'),
          ].filter(Boolean).join(' · ');
          return (
            <div key={f.id} className="union">
              <ul className="people">{partnerId && tree.individuals[partnerId] ? <Person id={partnerId} /> : <li className="muted">{tg(lang, 'unknownPerson', person.sex === 'M' ? 'F' : person.sex === 'F' ? 'M' : 'U')}</li>}</ul>
              {editingFamily === f.id ? (
                <FamilyEditor lang={lang} unionType={f.unionType} events={f.events} onCancel={() => setEditingFamily(null)} onSave={(patch) => { props.onSaveFamily(f.id, patch); setEditingFamily(null); }} />
              ) : (
                <div className="union-line">
                  {line || <span className="muted">—</span>}
                  <button className="link small" onClick={() => setEditingFamily(f.id)}>{t(lang, 'editUnion')}</button>
                </div>
              )}
              <h4>{t(lang, 'children')}</h4>
              <ul className="people">
                {f.childIds.filter((c) => tree.individuals[c]).map((c) => (
                  <Person key={c} id={c} tag={tree.individuals[c]!.childOf.find((l) => l.familyId === f.id)?.pedigree === 'adopted' ? tg(lang, 'adopted', tree.individuals[c]!.sex) : undefined} onRemove={() => props.onUnlinkChild(f.id, c)} />
                ))}
              </ul>
              <div className="row small-actions">
                <button className="btn small" onClick={() => props.onAddChild(person.id, f.id)}>{t(lang, 'addChild')}</button>
                <button className="btn small" onClick={() => setPicking({ kind: 'child', familyId: f.id })}>{t(lang, 'linkChild')}</button>
              </div>
            </div>
          );
        })}
        <div className="row small-actions">
          <button className="btn small" onClick={() => setPicking({ kind: 'partner' })}>{t(lang, 'linkPartner')}</button>
        </div>
      </section>
      {otherEvents.length > 0 && (
        <section>
          <h3>{t(lang, 'events')}</h3>
          <ul className="events">{otherEvents.map((e, i) => <EventRow key={i} e={e} lang={lang} tree={tree} />)}</ul>
        </section>
      )}
      {person.notes.length > 0 && (
        <section>
          <h3>{t(lang, 'notes')}</h3>
          {person.notes.map((n, i) => <p key={i} className="note">{n}</p>)}
        </section>
      )}
      <section className="panel-footer">
        <button className="btn subtle" onClick={() => setPicking({ kind: 'merge' })}>{t(lang, 'merge')}</button>
      </section>
    </aside>
  );
}
