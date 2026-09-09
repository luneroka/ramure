/** One person in a list of relatives: medallion, name, years and place. Tap selects, double tap focuses. */

import { memo } from 'react';
import { approximateYear } from '../gedcom/dates';
import { displayName, findEvent, placeText, type Tree } from '../gedcom/model';
import { t, tg, type Lang } from '../i18n';
import { portraitId } from '../tree/edit';
import { Medallion } from './fields/Portrait';

interface Props {
  tree: Tree;
  id: string;
  lang: Lang;
  tag?: string;
  onSelect(id: string): void;
  onFocus(id: string): void;
  onRemove?(): void;
}

export const PersonRow = memo(function PersonRow({ tree, id, lang, tag, onSelect, onFocus, onRemove }: Props) {
  const p = tree.individuals[id];
  if (!p) return null;
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
});
