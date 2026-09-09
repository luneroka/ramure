/** The corner tools of the stage: view mode, then what the current mode needs (views and zoom, or the timeline scale). */

import { useState } from 'react';
import { t } from '@/i18n';
import { Dropdown } from '@/app/ui/Menus';
import { MAX_PPY, MIN_PPY } from '@/app/screens/Timeline';
import type { ViewMode } from '@/app/state/editorState';
import { useWorkspace } from '@/app/state/Workspace';
import { ModeIcon, type StageMode } from '@/app/ui/icons';
import { useUi } from '@/app/ui/UiContext';

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
  const [modeOpen, setModeOpen] = useState(false);
  return (
    <div className="canvas-tools">
      <div className="mode-menu">
        <button
          className="btn mode-btn"
          aria-haspopup="menu"
          aria-expanded={modeOpen}
          aria-label={t(lang, 'stageMode')}
          title={t(lang, 'stageMode')}
          onClick={() => setModeOpen((v) => !v)}
        >
          <ModeIcon mode={mode} />
          {t(lang, MODE_KEY[mode])}
        </button>
        <Dropdown open={modeOpen} onClose={() => setModeOpen(false)} placement="up">
          {MODES.map((m) => (
            <button
              key={m}
              role="menuitem"
              className={`dd-item ${m === mode ? 'current' : ''}`}
              onClick={() => {
                setModeOpen(false);
                w.dispatch({ type: 'setMode', mode: m });
              }}
            >
              <span className="dd-lead">
                <ModeIcon mode={m} />
                {t(lang, MODE_KEY[m])}
              </span>
              {m === mode && <span className="dd-meta">✓</span>}
            </button>
          ))}
        </Dropdown>
      </div>
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
