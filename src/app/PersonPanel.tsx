import { formatDate } from '../gedcom/dates';
import { displayName, findEvent, placeText, type Event, type Individual, type Tree } from '../gedcom/model';
import { eventLabel, t, type Lang } from '../i18n';
import { isLiving } from '../canvas/renderer';

interface Props {
  tree: Tree;
  person: Individual;
  lang: Lang;
  onFocus(id: string): void;
  onSelect(id: string): void;
  onClose(): void;
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

export function PersonPanel({ tree, person, lang, onFocus, onSelect, onClose }: Props) {
  const name = displayName(person);
  const sexGlyph = person.sex === 'M' ? '♂' : person.sex === 'F' ? '♀' : '';
  const living = isLiving(person);

  const parentFamilies = person.childOf.map((l) => ({ link: l, fam: tree.families[l.familyId] })).filter((x) => x.fam);
  const parents = parentFamilies.flatMap(({ link, fam }) =>
    [fam!.husbandId, fam!.wifeId].filter((id): id is string => !!id && !!tree.individuals[id]).map((id) => ({ id, pedigree: link.pedigree })),
  );
  const siblings = parentFamilies.flatMap(({ fam }) => fam!.childIds.filter((c) => c !== person.id && tree.individuals[c]));
  const unions = person.partnerIn.map((fid) => tree.families[fid]).filter((f): f is NonNullable<typeof f> => !!f);

  const Person = ({ id, tag }: { id: string; tag?: string }) => {
    const p = tree.individuals[id]!;
    const b = findEvent(p.events, 'birth'), d = findEvent(p.events, 'death');
    const years = [b?.date?.date?.year, d?.date?.date?.year].filter((y) => y !== undefined).join('–');
    return (
      <li>
        <button className="link-person" onClick={() => onSelect(id)} onDoubleClick={() => onFocus(id)}>
          <span className={`sex-dot ${p.sex}`} aria-hidden="true" />
          <span className="link-name">{displayName(p)}</span>
          {years && <span className="link-years">{years}</span>}
          {tag && <span className="tag">{tag}</span>}
        </button>
      </li>
    );
  };

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
            {living && <span className="tag living">{t(lang, 'living')}</span>}
            {person.restriction && <span className="tag">{t(lang, 'private')}</span>}
          </div>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label={t(lang, 'close')}>×</button>
      </header>

      <button className="btn primary wide" onClick={() => onFocus(person.id)}>{t(lang, 'focusOn')}</button>

      {lifeEvents.length > 0 && <ul className="events">{lifeEvents.map((e, i) => <EventRow key={i} e={e} lang={lang} tree={tree} />)}</ul>}

      {parents.length > 0 && (
        <section>
          <h3>{t(lang, 'parents')}</h3>
          <ul className="people">{parents.map((p) => <Person key={p.id} id={p.id} tag={p.pedigree === 'adopted' ? t(lang, 'adopted') : undefined} />)}</ul>
        </section>
      )}
      {siblings.length > 0 && (
        <section>
          <h3>{t(lang, 'siblings')}</h3>
          <ul className="people">{siblings.map((id) => <Person key={id} id={id} />)}</ul>
        </section>
      )}
      {unions.length > 0 && (
        <section>
          <h3>{t(lang, 'partners')}</h3>
          {unions.map((f) => {
            const partnerId = f.husbandId === person.id ? f.wifeId : f.husbandId;
            const marr = findEvent(f.events, 'marriage'), div = findEvent(f.events, 'divorce');
            const line = [marr && `${eventLabel(lang, 'marriage')} ${marr.date ? formatDate(marr.date, lang) : ''}${marr.place ? ', ' + placeText(marr.place) : ''}`, div && `${eventLabel(lang, 'divorce')} ${div.date ? formatDate(div.date, lang) : ''}`, f.unionType === 'unmarried' && t(lang, 'unmarried')].filter(Boolean).join(' · ');
            return (
              <div key={f.id} className="union">
                <ul className="people">{partnerId && tree.individuals[partnerId] ? <Person id={partnerId} /> : <li className="muted">{t(lang, 'unknownPerson')}</li>}</ul>
                {line && <div className="union-line">{line}</div>}
                {f.childIds.length > 0 && (
                  <>
                    <h4>{t(lang, 'children')}</h4>
                    <ul className="people">{f.childIds.filter((c) => tree.individuals[c]).map((c) => <Person key={c} id={c} tag={tree.individuals[c]!.childOf.find((l) => l.familyId === f.id)?.pedigree === 'adopted' ? t(lang, 'adopted') : undefined} />)}</ul>
                  </>
                )}
              </div>
            );
          })}
        </section>
      )}
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
    </aside>
  );
}
