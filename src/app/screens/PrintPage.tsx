/**
 * Paper charts of one person's ancestry: previewed here, printed (or saved as
 * PDF) by the browser, or saved as PNG.
 *
 * The options are grouped by what they change — the chart, the sheet, the
 * writing — and the line under them says what the drawing actually holds, so
 * that "why is my great-grandmother missing" is answered on the page rather
 * than by counting rings. The subject is chosen here too: it starts from
 * whoever is selected on the canvas, but going back to the tree to change it
 * was the first thing that made this screen tiresome.
 */

import { useMemo, useState } from 'react';
import { displayName } from '@/gedcom/model';
import { t, tf, tn } from '@/i18n';
import {
  MAX_GENERATIONS,
  MIN_GENERATIONS,
  renderChart,
  SWEEPS,
  type ChartKind,
  type ChartOptions,
  type PageSize,
  type Sweep,
} from '@/print/charts';
import { ahnentafel, depthOf } from '@/tree/ancestry';
import { localeOf } from '@/app/lib/format';
import { SearchBox } from '@/app/stage/SearchBox';
import type { Route } from '@/app/state/router';
import { useWorkspace } from '@/app/state/Workspace';
import { useUi } from '@/app/ui/UiContext';

const GENERATIONS = Array.from({ length: MAX_GENERATIONS - MIN_GENERATIONS + 1 }, (_, i) => MIN_GENERATIONS + i);
const PAGE_SIZES: Array<[PageSize, 'paperA4' | 'paperA3' | 'paperLetter']> = [
  ['a4', 'paperA4'],
  ['a3', 'paperA3'],
  ['letter', 'paperLetter'],
];
const SHAPE_LABEL = { 180: 'shapeHalf', 270: 'shapeThreeQuarters', 360: 'shapeFull' } as const;
/** The names CSS knows these sheets by, which are not the keys the chart uses. */
const PAGE_CSS: Record<PageSize, string> = { a4: 'A4', a3: 'A3', letter: 'letter' };

export function PrintPage({ navigate }: { navigate(r: Route): void }) {
  const { lang, toast } = useUi();
  const w = useWorkspace();
  const [chosenSubject, setSubject] = useState<string | null>(null);
  const fromCanvas = w.editor.selectedId && w.tree.individuals[w.editor.selectedId] ? w.editor.selectedId : w.effectiveFocus;
  const rootId = chosenSubject && w.tree.individuals[chosenSubject] ? chosenSubject : fromCanvas;
  const root = rootId ? w.tree.individuals[rootId] : undefined;
  const [kind, setKind] = useState<ChartKind>('fan');
  const [sweep, setSweep] = useState<Sweep>(180);
  const [generations, setGenerations] = useState(5);
  const [dates, setDates] = useState(true);
  const [empties, setEmpties] = useState(true);
  const [page, setPage] = useState<PageSize>('a4');
  // A half fan is wide, everything else is tall: each shape has its natural sheet unless the person chooses.
  const [chosenOrientation, setOrientation] = useState<ChartOptions['orientation'] | null>(null);
  const orientation = chosenOrientation ?? (kind === 'fan' && sweep === 180 ? 'landscape' : 'portrait');
  const [title, setTitle] = useState<string | null>(null);
  const defaultTitle = root
    ? `${t(lang, 'chartOf')} ${displayName(root)} · ${w.source.name} · ${new Date().toLocaleDateString(localeOf(lang))}`
    : '';
  const shownTitle = title ?? defaultTitle;
  const known = useMemo(() => (root ? depthOf(ahnentafel(w.tree, root.id, MAX_GENERATIONS)) : 0), [w.tree, root]);
  const chart = useMemo(
    () => (root ? renderChart(w.tree, root.id, { kind, generations, dates, orientation, page, sweep, empties, title: shownTitle }) : null),
    [w.tree, root, kind, generations, dates, orientation, page, sweep, empties, shownTitle],
  );

  const savePng = async () => {
    if (!chart) return;
    try {
      const img = new Image();
      const url = URL.createObjectURL(new Blob([chart.svg], { type: 'image/svg+xml;charset=utf-8' }));
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('svg'));
        img.src = url;
      });
      const scale = 2.5;
      const canvas = document.createElement('canvas');
      canvas.width = chart.width * scale;
      canvas.height = chart.height * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('png');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${(root ? displayName(root) : 'arbre').replace(/[^\p{L}\p{N}]+/gu, '-')}-${kind === 'fan' ? 'eventail' : 'ascendance'}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch {
      toast(t(lang, 'syncError'));
    }
  };

  return (
    <div className="settings print-page">
      <style>{`@page { size: ${PAGE_CSS[page]} ${orientation}; margin: 0; }`}</style>
      <div className="settings-head">
        <button className="btn subtle" onClick={() => navigate({ name: 'tree', id: w.source.id })}>
          ← {t(lang, 'backToTree')}
        </button>
        <h1>{t(lang, 'printTitle')}</h1>
        <span className="muted resources-tree">{w.source.name}</span>
      </div>
      {!root || !chart ? (
        <p className="muted">{t(lang, 'noPrintPerson')}</p>
      ) : (
        <>
          <section className="home-card print-options">
            <div className="print-subject">
              <span className="print-subject-name">
                {t(lang, 'chartSubject')} : <strong>{displayName(root)}</strong>
              </span>
              <SearchBox tree={w.tree} lang={lang} open onOpenChange={() => undefined} onPick={setSubject} />
            </div>
            <fieldset className="print-group">
              <legend>{t(lang, 'chartGroupChart')}</legend>
              <div className="segmented" role="radiogroup" aria-label={t(lang, 'chartKind')}>
                {(['fan', 'pedigree'] as ChartKind[]).map((k) => (
                  <button key={k} role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
                    {t(lang, k === 'fan' ? 'chartFan' : 'chartPedigree')}
                  </button>
                ))}
              </div>
              {kind === 'fan' && (
                <label className="field">
                  {t(lang, 'chartShape')}
                  <select value={sweep} onChange={(e) => setSweep(Number(e.target.value) as Sweep)}>
                    {SWEEPS.map((s) => (
                      <option key={s} value={s}>
                        {t(lang, SHAPE_LABEL[s])}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="field">
                {t(lang, 'generations')}
                <select value={generations} onChange={(e) => setGenerations(Number(e.target.value))}>
                  {GENERATIONS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
            <fieldset className="print-group">
              <legend>{t(lang, 'chartGroupPaper')}</legend>
              <label className="field">
                {t(lang, 'paperSize')}
                <select value={page} onChange={(e) => setPage(e.target.value as PageSize)}>
                  {PAGE_SIZES.map(([value, key]) => (
                    <option key={value} value={value}>
                      {t(lang, key)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                {t(lang, 'orientation')}
                <select value={orientation} onChange={(e) => setOrientation(e.target.value as ChartOptions['orientation'])}>
                  <option value="portrait">{t(lang, 'pagePortrait')}</option>
                  <option value="landscape">{t(lang, 'landscape')}</option>
                </select>
              </label>
            </fieldset>
            <fieldset className="print-group grow">
              <legend>{t(lang, 'chartGroupText')}</legend>
              <label className="check">
                <input type="checkbox" checked={dates} onChange={(e) => setDates(e.target.checked)} /> {t(lang, 'showDates')}
              </label>
              <label className="check">
                <input type="checkbox" checked={empties} onChange={(e) => setEmpties(e.target.checked)} /> {t(lang, 'showEmpty')}
              </label>
              <label className="field grow">
                {t(lang, 'chartTitle')}
                <input value={shownTitle} onChange={(e) => setTitle(e.target.value)} />
              </label>
            </fieldset>
            <p className="print-summary">
              {tn(lang, 'chartShown', chart.people, { total: w.count })} · {tn(lang, 'chartKnown', known)}
              {chart.generations < Math.min(generations, known) && (
                <span className="print-limit"> · {tf(lang, 'chartSheetLimit', { n: chart.generations })}</span>
              )}
            </p>
            <div className="row print-actions">
              <button className="btn primary" onClick={() => window.print()}>
                {t(lang, 'printPdf')}
              </button>
              <button className="btn" onClick={() => void savePng()}>
                {t(lang, 'exportPng')}
              </button>
            </div>
            <p className="muted small">{t(lang, 'printHint')}</p>
          </section>
          <div
            className={`print-sheet ${orientation}`}
            style={{ aspectRatio: `${chart.width} / ${chart.height}` }}
            // The markup is built by renderChart from escaped names; nothing from the file reaches it unescaped.
            dangerouslySetInnerHTML={{ __html: chart.svg }}
          />
        </>
      )}
    </div>
  );
}
