/** The corner tools of the stage: view mode, then what the current mode needs (views and zoom, or the timeline scale). */

import { t } from '../../i18n';
import { MAX_PPY, MIN_PPY } from '../Timeline';
import type { ViewMode } from '../editorState';
import { useWorkspace } from '../session/Workspace';
import { ModeIcon, type StageMode } from '../ui/icons';
import { useUi } from '../ui/UiContext';

const VIEWS: Array<{ id: ViewMode; key: 'viewAll' | 'viewHourglass' | 'viewAncestors' | 'viewDescendants' }> = [
  { id: 'all', key: 'viewAll' },
  { id: 'hourglass', key: 'viewHourglass' },
  { id: 'ancestors', key: 'viewAncestors' },
  { id: 'descendants', key: 'viewDescendants' },
];

const MODES: StageMode[] = ['tree', 'timeline', 'map'];
const MODE_KEY = { tree: 'modeTree', timeline: 'modeTimeline', map: 'modeMap' } as const;

export function CanvasTools({ pxPerYear, onPxPerYear }: { pxPerYear: number; onPxPerYear(v: number): void }) {
  const { lang } = useUi();
  const w = useWorkspace();
  const { mode, view } = w.editor;
  return (
    <div className="canvas-tools">
      <label className="btn mode-btn" title={t(lang, 'stageMode')}>
        <ModeIcon mode={mode} />
        <select
          className="mode-select"
          aria-label={t(lang, 'stageMode')}
          value={mode}
          onChange={(e) => w.dispatch({ type: 'setMode', mode: e.target.value as StageMode })}
        >
          {MODES.map((m) => (
            <option key={m} value={m}>
              {t(lang, MODE_KEY[m])}
            </option>
          ))}
        </select>
      </label>
      {mode === 'map' ? null : mode === 'timeline' ? (
        <>
          <button className="btn" onClick={() => onPxPerYear(Math.max(MIN_PPY, pxPerYear / 1.3))} aria-label={t(lang, 'zoomOut')}>
            −
          </button>
          <button className="btn" onClick={() => onPxPerYear(Math.min(MAX_PPY, pxPerYear * 1.3))} aria-label={t(lang, 'zoomIn')}>
            +
          </button>
          <button
            className="btn"
            onClick={() => {
              const el = document.querySelector('.frise');
              const years = Number(el?.getAttribute('data-years') ?? 0);
              if (el && years) onPxPerYear(Math.min(MAX_PPY, Math.max(MIN_PPY, (el.clientWidth - 170) / years)));
            }}
          >
            {t(lang, 'fitYears')}
          </button>
        </>
      ) : (
        <>
          <div className="segmented" role="radiogroup" aria-label={t(lang, 'view')}>
            {VIEWS.map((v) => (
              <button
                key={v.id}
                role="radio"
                aria-checked={view === v.id}
                className={view === v.id ? 'on' : ''}
                onClick={() => w.dispatch({ type: 'setView', view: v.id })}
              >
                {t(lang, v.key)}
              </button>
            ))}
          </div>
          <button className="btn" onClick={() => w.canvasRef.current?.zoomBy(1 / 1.3)} aria-label={t(lang, 'zoomOut')}>
            −
          </button>
          <button className="btn" onClick={() => w.canvasRef.current?.zoomBy(1.3)} aria-label={t(lang, 'zoomIn')}>
            +
          </button>
          <button className="btn" onClick={() => w.canvasRef.current?.fit(true)}>
            {t(lang, 'fit')}
          </button>
          <button className="btn" onClick={() => w.layout && w.canvasRef.current?.centerOn(w.layout.focusId, true)}>
            {t(lang, 'recentre')}
          </button>
        </>
      )}
    </div>
  );
}
