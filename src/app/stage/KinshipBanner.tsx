/** Above the canvas: the relationship being looked up, or the one found. */

import { displayName } from '../../gedcom/model';
import { t } from '../../i18n';
import { useWorkspace } from '../session/Workspace';
import { useUi } from '../ui/UiContext';

export function KinshipBanner() {
  const { lang } = useUi();
  const w = useWorkspace();
  const { kinshipFrom, kinshipIds } = w.editor;
  const from = kinshipFrom ? w.tree.individuals[kinshipFrom] : undefined;
  if (from && !w.kinship)
    return (
      <div className="kinship-banner armed" role="status">
        <span className="kinship-text">
          {t(lang, 'kinshipArmed')} {displayName(from)}
        </span>
        <button className="icon-btn" onClick={() => w.dispatch({ type: 'armKinship', id: null })} aria-label={t(lang, 'cancel')}>
          ×
        </button>
      </div>
    );
  if (!w.kinship) return null;
  return (
    <div className="kinship-banner" role="status">
      <span className="kinship-text">{w.kinship.sentence}</span>
      {kinshipIds && w.kinship.kind !== 'same' && (
        <button className="btn small subtle" onClick={() => w.dispatch({ type: 'setKinship', ids: { a: kinshipIds.b, b: kinshipIds.a } })}>
          {t(lang, 'kinshipSwap')}
        </button>
      )}
      <button className="icon-btn" onClick={() => w.dispatch({ type: 'setKinship', ids: null })} aria-label={t(lang, 'close')}>
        ×
      </button>
    </div>
  );
}
