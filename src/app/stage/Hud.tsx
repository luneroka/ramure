/**
 * The small status line under the canvas: zoom, how many people are shown, the detail band. It
 * stays one short line of labels, never sentences or warnings, and only shows on a wide stage.
 */

import type { DetailBand } from '@/canvas/renderer';
import { t, tf, tn } from '@/i18n';
import { useWorkspace } from '@/app/state/Workspace';
import { useUi } from '@/app/ui/UiContext';

export function Hud({ band, zoom }: { band: DetailBand; zoom: number }) {
  const { lang } = useUi();
  const w = useWorkspace();
  const { count, hiddenCount } = w;
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
    </div>
  );
}
