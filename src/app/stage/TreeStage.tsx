/** The stage of an open tree: canvas, timeline or map, with the tools, hud, menus and banners over it. */

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { TreeCanvas, type TreeCanvasHandle } from '../../canvas/TreeCanvas';
import type { DetailBand, HandleKind } from '../../canvas/renderer';
import { tn } from '../../i18n';
import { ops } from '../../tree/ops';
import { Timeline } from '../Timeline';
import { useWorkspace } from '../session/Workspace';
import { useUi } from '../ui/UiContext';
import { AddRelativeMenu } from './AddRelativeMenu';
import { CanvasTools } from './CanvasTools';
import { Hud } from './Hud';
import { KinshipBanner } from './KinshipBanner';
import { ReportPanel } from './ReportPanel';

// Leaflet and its stylesheet only load the first time the map is shown.
const MapView = lazy(() => import('../MapView').then((m) => ({ default: m.MapView })));

export function TreeStage({ onHandle }: { onHandle(kind: HandleKind, id: string, at: { x: number; y: number }): void }) {
  const ui = useUi();
  const { lang } = ui;
  const w = useWorkspace();
  const { editor, displayTree, layout } = w;
  // Zoom and detail band change on every wheel tick: they stay here so the shell does not re-render with them.
  const [band, setBand] = useState<{ band: DetailBand; zoom: number }>({ band: 'cards', zoom: 1 });
  const onBandChange = useCallback((b: DetailBand, zoom: number) => {
    setBand((prev) => (prev.band === b && Math.abs(prev.zoom - zoom) < 0.005 ? prev : { band: b, zoom }));
  }, []);
  const [pxPerYear, setPxPerYear] = useState(6);
  // The canvas handle reaches the workspace (camera moves, zoom buttons) through a plain ref registered after mount.
  const canvasRef = useRef<TreeCanvasHandle>(null);
  const { setCanvas } = w;
  useEffect(() => {
    setCanvas(canvasRef.current);
    return () => setCanvas(null);
  }, [setCanvas, editor.mode, w.source.id]);
  if (!layout) return null;
  return (
    <>
      {editor.mode === 'map' && (
        <Suspense fallback={<div className="map-loading muted">…</div>}>
          <MapView
            tree={displayTree}
            lang={lang}
            selectedId={editor.selectedId}
            readOnly={w.readOnly}
            dark={ui.effectiveTheme === 'dark'}
            onSelect={(id) => w.dispatch({ type: 'select', id })}
            onGeocoded={(fixes) => {
              if (w.commit(ops.geocodePlaces(fixes))) ui.toast(tn(lang, 'placesLocatedCount', fixes.length));
            }}
            onNotice={ui.toast}
          />
        </Suspense>
      )}
      {editor.mode === 'timeline' && (
        <Timeline
          tree={displayTree}
          lang={lang}
          selectedId={editor.selectedId}
          focusId={w.effectiveFocus}
          onSelect={(id) => w.dispatch({ type: 'select', id })}
          pxPerYear={pxPerYear}
          onPxPerYear={setPxPerYear}
        />
      )}
      {editor.mode === 'tree' && (
        <TreeCanvas
          key={w.source.id}
          ref={canvasRef}
          tree={displayTree}
          layout={layout}
          selectedId={editor.selectedId}
          lang={lang}
          editable={!editor.editing && !editor.draft && !w.readOnly}
          onSelect={w.select}
          onFocus={w.focusOn}
          onHandle={onHandle}
          draftId={editor.draft?.preview.focusId}
          lit={w.lit}
          onBandChange={onBandChange}
        />
      )}
      <CanvasTools pxPerYear={pxPerYear} onPxPerYear={setPxPerYear} />
      {editor.mode === 'tree' && <Hud band={band.band} zoom={band.zoom} />}
      <AddRelativeMenu />
      <KinshipBanner />
      {editor.showReport && <ReportPanel />}
    </>
  );
}
