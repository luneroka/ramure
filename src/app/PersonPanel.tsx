import { useEffect, useRef, useState } from 'react';
import { approximateYear, formatDate } from '../gedcom/dates';
import { computeAge } from '../gedcom/age';
import {
  displayName,
  findEvent,
  placeText,
  type Event,
  type Family,
  type Individual,
  type Lead,
  type MediaObject,
  type Tree,
} from '../gedcom/model';
import { eventLabel, formatAge, t, tg, type Lang } from '../i18n';
import { isLiving } from '../canvas/renderer';
import { nextId, portraitId, RAMURE_MEDIA_SCHEME, type FamilyPatch, type PersonPatch } from '../tree/edit';
import { mediaStore } from '../store';
import { prepareImage } from '../media/portraits';
import { FamilyEditor, PersonEditor } from './PersonEditor';
import { PersonPicker } from './PersonPicker';
import { SplitPanes } from './SplitPanes';
import { DocumentsTab } from './Documents';
import { LeadsTab } from './Leads';
import { Medallion } from './fields/Portrait';

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
  /** Quick portrait change from the panel header. */
  onSetPortrait(id: string, media: MediaObject | null): void;
  /** Documents: a stored media record to attach or update, one to remove, one to promote. */
  onSaveDocument(id: string, media: MediaObject): void;
  onDeleteDocument(id: string, mediaId: string): void;
  onSaveLeads(id: string, leads: Lead[]): void;
  /** A short message for the user (toast). */
  onNotice(message: string): void;
}

interface Props extends PanelActions {
  tree: Tree;
  person: Individual;
  lang: Lang;
  /** Open directly in edit mode (after "add relative"). */
  editing: boolean;
  /** The person is a draft relative: not yet in the tree. */
  isDraft?: boolean;
  /** Viewer role: no editing controls. */
  readOnly?: boolean;
  setEditing(v: boolean): void;
}

type Picking = { kind: 'merge' } | { kind: 'partner' } | { kind: 'child'; familyId: string } | null;

/** One row of the life timeline: a person event, or a union event seen from this person. */
interface Row {
  key: string;
  label: string;
  date?: string;
  year?: number;
  lines: string[];
  cause?: string;
  age?: string;
}

function eventRows(tree: Tree, person: Individual, lang: Lang): Row[] {
  const birth = findEvent(person.events, 'birth') ?? findEvent(person.events, 'baptism');
  // An undated, unplaced occupation is the subtitle of the hero, not a timeline row.
  const rows: Row[] = person.events
    .filter((e) => !(e.type === 'occupation' && !e.date && !e.place))
    .map((e, i) => {
      const lines: string[] = [];
      if (e.value) lines.push(e.value);
      if (e.place) lines.push(placeText(e.place));
      if (e.address) lines.push(e.address);
      lines.push(...e.notes);
      const age =
        e.type === 'death'
          ? e.age
            ? e.age.replace(/y$/, ' ' + (lang === 'fr' ? 'ans' : 'y'))
            : (() => {
                const a = computeAge(birth?.date, e.date);
                return a ? formatAge(lang, a) : undefined;
              })()
          : undefined;
      return {
        key: `e${i}`,
        label: eventLabel(lang, e.type, e.customType),
        date: e.date ? formatDate(e.date, lang) : undefined,
        year: approximateYear(e.date),
        lines,
        cause: e.cause,
        age,
      };
    });
  for (const fid of person.partnerIn) {
    const f = tree.families[fid];
    if (!f) continue;
    const partnerId = f.husbandId === person.id ? f.wifeId : f.husbandId;
    const partner = partnerId ? tree.individuals[partnerId] : undefined;
    for (const e of f.events) {
      if (e.type !== 'marriage' && e.type !== 'divorce' && e.type !== 'engagement' && e.type !== 'separation' && e.type !== 'annulment')
        continue;
      const lines: string[] = [];
      if (partner) lines.push(`${t(lang, 'with')} ${displayName(partner)}`);
      if (e.place) lines.push(placeText(e.place));
      lines.push(...e.notes);
      rows.push({
        key: `f${fid}${e.type}`,
        label: eventLabel(lang, e.type, e.customType),
        date: e.date ? formatDate(e.date, lang) : undefined,
        year: approximateYear(e.date),
        lines,
      });
    }
  }
  const order = (r: Row) => (r.label === eventLabel(lang, 'birth') ? -Infinity : (r.year ?? Infinity));
  return rows.sort((a, b) => order(a) - order(b));
}

function sourceRows(tree: Tree, person: Individual, lang: Lang): Array<{ label: string; text: string }> {
  const out: Array<{ label: string; text: string }> = [];
  const push = (label: string, cites: Event['citations']) => {
    for (const c of cites) {
      const src = c.sourceId ? tree.sources[c.sourceId] : undefined;
      const text = src ? [src.title, c.page, c.text].filter(Boolean).join(' · ') : [c.flat, c.text].filter(Boolean).join(' · ');
      if (text) out.push({ label, text });
    }
  };
  push(t(lang, 'identity'), person.citations);
  for (const e of person.events) push(eventLabel(lang, e.type, e.customType), e.citations);
  for (const fid of person.partnerIn) {
    const f = tree.families[fid];
    if (f) for (const e of f.events) push(eventLabel(lang, e.type, e.customType), e.citations);
  }
  return out;
}

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 640px)').matches);
  useEffect(() => {
    const mq = matchMedia('(max-width: 640px)');
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

export function PersonPanel(props: Props) {
  const { tree, person, lang, editing, isDraft, readOnly, setEditing, onFocus, onSelect, onClose } = props;
  const [picking, setPicking] = useState<Picking>(null);
  const [editingFamily, setEditingFamily] = useState<string | null>(null);
  const [topTab, setTopTab] = useState('fiche');
  const [bottomTab, setBottomTab] = useState('documents');
  const narrow = useNarrow();
  // Tabs start over for every person opened.
  const [seenId, setSeenId] = useState(person.id);
  if (seenId !== person.id) {
    setSeenId(person.id);
    setTopTab('fiche');
    setBottomTab('documents');
    setPicking(null);
    setEditingFamily(null);
  }

  const photoInput = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const quickPhoto = async (file: File) => {
    setPhotoBusy(true);
    try {
      const blob = await prepareImage(file);
      const id = `${nextId(tree, 'M')}-${Date.now().toString(36)}`;
      await mediaStore.put(id, blob);
      props.onSetPortrait(person.id, {
        id,
        file: RAMURE_MEDIA_SCHEME + id,
        format: 'jpg',
        title: file.name.replace(/\.[^.]+$/, ''),
        notes: [],
        extra: [],
      });
    } finally {
      setPhotoBusy(false);
    }
  };

  const name = displayName(person) === '?' ? t(lang, 'newPersonName') : displayName(person);
  const heroPortrait = portraitId(person, tree);
  const sexGlyph = person.sex === 'M' ? '♂' : person.sex === 'F' ? '♀' : '';
  const living = isLiving(person);
  const birthEvent = findEvent(person.events, 'birth') ?? findEvent(person.events, 'baptism');
  const ageToday = living ? computeAge(birthEvent?.date, 'today') : undefined;
  const occupation = person.events.find((e) => e.type === 'occupation' && e.value)?.value;

  const parentFamilies = person.childOf
    .map((l) => ({ link: l, fam: tree.families[l.familyId] }))
    .filter((x): x is { link: typeof x.link; fam: Family } => !!x.fam);
  const parents = parentFamilies.flatMap(({ link, fam }) =>
    [fam.husbandId, fam.wifeId].filter((id): id is string => !!id && !!tree.individuals[id]).map((id) => ({ id, pedigree: link.pedigree })),
  );
  const siblings = parentFamilies.flatMap(({ fam }) => fam.childIds.filter((c) => c !== person.id && tree.individuals[c]));
  const unions = person.partnerIn.map((fid) => tree.families[fid]).filter((f): f is Family => !!f);
  const familyCount = parents.length + siblings.length + unions.reduce((n, f) => n + 1 + f.childIds.length, 0);

  const Person = ({ id, tag, onRemove }: { id: string; tag?: string; onRemove?: () => void }) => {
    const p = tree.individuals[id]!;
    const b = findEvent(p.events, 'birth'),
      d = findEvent(p.events, 'death');
    const by = approximateYear(b?.date),
      dy = approximateYear(d?.date);
    const years = d ? `${by ?? '?'} – ${dy ?? '?'}` : by ? `${tg(lang, 'born', p.sex)} ${by}` : '';
    const place = placeText(b?.place) || placeText(d?.place);
    return (
      <li className="person-row">
        <button className="link-person" onClick={() => onSelect(id)} onDoubleClick={() => onFocus(id)}>
          <Medallion mediaId={portraitId(p, tree)} size={40} className={`row-medallion ${p.sex}`} />
          <span className="link-body">
            <span className="link-name">
              {displayName(p)}
              {tag && <span className="tag">{tag}</span>}
            </span>
            {(years || place) && (
              <span className="link-years">
                {years}
                {place ? ` · ${place}` : ''}
              </span>
            )}
          </span>
        </button>
        {onRemove && (
          <button className="icon-btn small" onClick={onRemove} title={t(lang, 'unlink')} aria-label={t(lang, 'unlink')}>
            ⨯
          </button>
        )}
      </li>
    );
  };

  const rows = eventRows(tree, person, lang);
  const sources = sourceRows(tree, person, lang);

  const renderFiche = () => (
    <>
      {rows.length > 0 ? (
        <ul className="timeline">
          {rows.map((r) => (
            <li key={r.key} className="ev">
              <div className="ev-head">
                <span className="ev-label">{r.label}</span>
                <span className="ev-date">{r.date ?? '—'}</span>
              </div>
              {r.lines.map((l, i) => (
                <div key={i} className="ev-line">
                  {l}
                </div>
              ))}
              {r.cause && (
                <div className="ev-line muted">
                  {t(lang, 'cause')} : {r.cause}
                </div>
              )}
              {r.age && (
                <div className="ev-line muted">
                  {t(lang, 'age')} : {r.age}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">—</p>
      )}
      {person.notes.length > 0 && (
        <section>
          <h3 className="band">{t(lang, 'notes')}</h3>
          {person.notes.map((n, i) => (
            <p key={i} className="note">
              {n}
            </p>
          ))}
        </section>
      )}
      {!readOnly && (
        <section className="panel-footer">
          {picking?.kind === 'merge' ? (
            <PersonPicker
              tree={tree}
              lang={lang}
              exclude={[person.id]}
              hint={t(lang, 'mergeHint')}
              onCancel={() => setPicking(null)}
              onPick={(id) => {
                props.onMerge(person.id, id);
                setPicking(null);
              }}
            />
          ) : (
            <button className="btn subtle" onClick={() => setPicking({ kind: 'merge' })}>
              {t(lang, 'merge')}
            </button>
          )}
        </section>
      )}
    </>
  );

  const renderFamille = () => (
    <>
      {picking?.kind === 'partner' && (
        <PersonPicker
          tree={tree}
          lang={lang}
          exclude={[person.id]}
          onCancel={() => setPicking(null)}
          onPick={(id) => {
            props.onLinkPartner(person.id, id);
            setPicking(null);
          }}
        />
      )}
      {picking?.kind === 'child' && (
        <PersonPicker
          tree={tree}
          lang={lang}
          exclude={[person.id, ...(tree.families[picking.familyId]?.childIds ?? [])]}
          onCancel={() => setPicking(null)}
          onPick={(id) => {
            props.onLinkChild(picking.familyId, id);
            setPicking(null);
          }}
        />
      )}
      {parents.length > 0 && (
        <section>
          <h3 className="band">{t(lang, 'parents')}</h3>
          <ul className="people">
            {parents.map((p) => (
              <Person key={p.id} id={p.id} tag={p.pedigree === 'adopted' ? tg(lang, 'adopted', person.sex) : undefined} />
            ))}
          </ul>
        </section>
      )}
      {siblings.length > 0 && (
        <section>
          <h3 className="band">{t(lang, 'siblings')}</h3>
          <ul className="people">
            {siblings.map((id) => (
              <Person key={id} id={id} />
            ))}
          </ul>
        </section>
      )}
      <section>
        <h3 className="band">{t(lang, 'partners')}</h3>
        {unions.length === 0 && <p className="muted small">—</p>}
        {unions.map((f) => {
          const partnerId = f.husbandId === person.id ? f.wifeId : f.husbandId;
          const marr = findEvent(f.events, 'marriage'),
            div = findEvent(f.events, 'divorce');
          const line = [
            marr &&
              `${eventLabel(lang, 'marriage')} ${marr.date ? formatDate(marr.date, lang) : ''}${marr.place ? ', ' + placeText(marr.place) : ''}`,
            div && `${eventLabel(lang, 'divorce')} ${div.date ? formatDate(div.date, lang) : ''}`,
            f.unionType === 'unmarried' && t(lang, 'unmarried'),
            f.unionType === 'civil' && t(lang, 'civil'),
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <div key={f.id} className="union">
              <ul className="people">
                {partnerId && tree.individuals[partnerId] ? (
                  <Person id={partnerId} />
                ) : (
                  <li className="muted">{tg(lang, 'unknownPerson', person.sex === 'M' ? 'F' : person.sex === 'F' ? 'M' : 'U')}</li>
                )}
              </ul>
              {editingFamily === f.id ? (
                <FamilyEditor
                  tree={tree}
                  lang={lang}
                  unionType={f.unionType}
                  events={f.events}
                  onCancel={() => setEditingFamily(null)}
                  onSave={(patch) => {
                    props.onSaveFamily(f.id, patch);
                    setEditingFamily(null);
                  }}
                />
              ) : (
                <div className="union-line">
                  {line || <span className="muted">—</span>}
                  {!readOnly && (
                    <button className="link small" onClick={() => setEditingFamily(f.id)}>
                      {t(lang, 'editUnion')}
                    </button>
                  )}
                </div>
              )}
              <h4 className="sub-band">{t(lang, 'children')}</h4>
              <ul className="people">
                {f.childIds
                  .filter((c) => tree.individuals[c])
                  .map((c) => (
                    <Person
                      key={c}
                      id={c}
                      tag={
                        tree.individuals[c]!.childOf.find((l) => l.familyId === f.id)?.pedigree === 'adopted'
                          ? tg(lang, 'adopted', tree.individuals[c]!.sex)
                          : undefined
                      }
                      onRemove={readOnly ? undefined : () => props.onUnlinkChild(f.id, c)}
                    />
                  ))}
                {f.childIds.filter((c) => tree.individuals[c]).length === 0 && <li className="muted small">—</li>}
              </ul>
              {!readOnly && (
                <div className="row small-actions">
                  <button className="btn small" onClick={() => props.onAddChild(person.id, f.id)}>
                    {t(lang, 'addChild')}
                  </button>
                  <button className="btn small" onClick={() => setPicking({ kind: 'child', familyId: f.id })}>
                    {t(lang, 'linkChild')}
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {!readOnly && (
          <div className="row small-actions">
            <button className="btn small" onClick={() => setPicking({ kind: 'partner' })}>
              {t(lang, 'linkPartner')}
            </button>
          </div>
        )}
      </section>
    </>
  );

  const renderDocuments = () => (
    <DocumentsTab
      tree={tree}
      person={person}
      lang={lang}
      readOnly={readOnly}
      isDraft={isDraft}
      sources={sources}
      onSaveDocument={(m) => props.onSaveDocument(person.id, m)}
      onDeleteDocument={(mid) => props.onDeleteDocument(person.id, mid)}
      onError={props.onNotice}
    />
  );

  const renderRecherches = () => (
    <LeadsTab
      person={person}
      lang={lang}
      readOnly={readOnly || isDraft}
      onSaveLeads={(l) => props.onSaveLeads(person.id, l)}
      onNotice={props.onNotice}
    />
  );
  // The badge counts documents only; citations are listed below them but are not files.
  const docCount = person.mediaIds.filter((id) => tree.media[id] && id !== heroPortrait).length;
  const openLeads = (person.leads ?? []).filter((l) => !l.done).length;

  return (
    <aside className="panel" aria-label={name}>
      <header className="panel-hero">
        <button
          type="button"
          className={`medallion-btn ${heroPortrait ? 'has-photo' : ''} ${readOnly ? 'static' : ''}`}
          onClick={() => !readOnly && photoInput.current?.click()}
          disabled={photoBusy || readOnly}
          aria-label={heroPortrait ? t(lang, 'changePhoto') : t(lang, 'choosePhoto')}
          title={heroPortrait ? t(lang, 'changePhoto') : t(lang, 'choosePhoto')}
        >
          <Medallion mediaId={heroPortrait} size={88} className="panel-medallion" />
          {!readOnly && (
            <span className="medallion-badge" aria-hidden="true">
              {heroPortrait ? '✎' : '+'}
            </span>
          )}
        </button>
        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void quickPhoto(f);
            e.target.value = '';
          }}
        />
        <div className="hero-text">
          <h2 className="panel-name">
            {name}{' '}
            <span className="panel-sex" aria-hidden="true">
              {sexGlyph}
            </span>
          </h2>
          {occupation && <p className="hero-sub">{occupation}</p>}
          <div className="panel-tags">
            {person.names[0]?.nick && <span className="tag">« {person.names[0].nick} »</span>}
            {person.names.slice(1).map((n, i) => (
              <span key={i} className="tag">
                {[n.given, n.surname].filter(Boolean).join(' ')}
                {n.type ? ` (${n.type})` : ''}
              </span>
            ))}
            {living && (
              <span className="tag living">
                {tg(lang, 'living', person.sex)}
                {ageToday ? ` · ${formatAge(lang, ageToday)}` : ''}
              </span>
            )}
            {person.unsure && <span className="tag unsure">? {t(lang, 'unsure')}</span>}
            {person.restriction && <span className="tag">{t(lang, 'private')}</span>}
          </div>
          <div className="row panel-actions">
            <button className="btn small primary" onClick={() => onFocus(person.id)}>
              {t(lang, 'focusOn')}
            </button>
            {!readOnly && (
              <button className="btn small" onClick={() => setEditing(true)}>
                {t(lang, 'edit')}
              </button>
            )}
          </div>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label={t(lang, 'close')}>
          ×
        </button>
      </header>

      <SplitPanes
        key={person.id}
        lang={lang}
        narrow={narrow}
        top={{
          tabs: [
            { id: 'fiche', label: t(lang, 'tabFiche'), count: rows.length },
            { id: 'famille', label: t(lang, 'tabFamille'), count: familyCount },
          ],
          active: topTab,
          onSelect: setTopTab,
          render: (id) => (id === 'famille' ? renderFamille() : renderFiche()),
        }}
        bottom={{
          tabs: [
            { id: 'documents', label: t(lang, 'tabDocuments'), count: docCount },
            { id: 'recherches', label: t(lang, 'tabRecherches'), count: openLeads },
          ],
          active: bottomTab,
          onSelect: setBottomTab,
          render: (id) => (id === 'recherches' ? renderRecherches() : renderDocuments()),
        }}
      />
      {editing && (
        <PersonEditor
          tree={tree}
          person={person}
          lang={lang}
          canDelete={!isDraft}
          isDraft={isDraft}
          onSave={(patch) => {
            props.onSavePerson(person.id, patch);
            if (!isDraft) setEditing(false);
          }}
          onCancel={() => setEditing(false)}
          onDelete={() => {
            props.onDeletePerson(person.id);
            setEditing(false);
          }}
        />
      )}
    </aside>
  );
}
