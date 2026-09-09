/** The small status line under the canvas: zoom, how many people are shown, the detail band, warnings. */

import type { DetailBand } from '@/canvas/renderer';
import { t, tf, tn } from '@/i18n';
import { useWorkspace } from '@/app/state/Workspace';
import { useUi } from '@/app/ui/UiContext';

export function Hud({ band, zoom }: { band: DetailBand; zoom: number }) {
  const { lang } = useUi();
  const w = useWorkspace();
  const { count, hiddenCount, layout, readOnly } = w;
  return (
    <div className="hud">
      {Math.round(zoom * 100)}% ·{' '}
      {hiddenCount > 0 ? (
        <>
          {tf(lang, 'shownOf', { n: count - hiddenCount, total: count })} ·{' '}
          <button className="link" onClick={() => w.dispatch({ type: 'setView', view: 'all' })}>
            {t(lang, 'showAll')}
          </button>
        </>
      ) : (
        <>{tn(lang, 'peopleCount', count)}</>
      )}{' '}
      · {t(lang, band === 'cards' ? 'fullCards' : band === 'names' ? 'namesOnly' : 'dots')}
      {readOnly && <span className="hud-warn"> · {t(lang, 'readOnlyHint')}</span>}
      {layout?.truncatedUp && <span className="hud-warn"> · ↑ {t(lang, 'moreAbove')}</span>}
      {layout?.truncatedDown && <span className="hud-warn"> · ↓ {t(lang, 'moreBelow')}</span>}
    </div>
  );
}
