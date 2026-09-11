/**
 * What Ramure puts on paper: one person's ancestry as a fan or a pedigree
 * chart, or the whole tree as a poster over as many sheets as it takes.
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
import { MAX_SHEETS, renderPoster, type PosterFit } from '@/print/poster';
import { ahnentafel, depthOf } from '@/tree/ancestry';
import { localeOf } from '@/app/lib/format';
import { SearchBox } from '@/app/stage/SearchBox';
import type { Route } from '@/app/state/router';
import { useWorkspace } from '@/app/state/Workspace';
import { useUi } from '@/app/ui/UiContext';

/** The fan and the pedigree draw one person's ancestors; the poster draws everybody. */
type Drawing = ChartKind | 'poster';
type Orientation = ChartOptions['orientation'];

const KINDS: Array<[Drawing, 'chartFan' | 'chartPedigree' | 'chartPoster']> = [
  ['fan', 'chartFan'],
  ['pedigree', 'chartPedigree'],
  ['poster', 'chartPoster'],
];
const GENERATIONS = Array.from({ length: MAX_GENERATIONS - MIN_GENERATIONS + 1 }, (_, i) => MIN_GENERATIONS + i);
const PAGE_SIZES: Array<[PageSize, 'paperA4' | 'paperA3' | 'paperLetter']> = [
  ['a4', 'paperA4'],
  ['a3', 'paperA3'],
  ['letter', 'paperLetter'],
];
const FITS: Array<[PosterFit, 'posterFitOne' | 'posterFitReadable']> = [
  ['one', 'posterFitOne'],
  ['readable', 'posterFitReadable'],
];
const SHAPE_LABEL = { 180: 'shapeHalf', 270: 'shapeThreeQuarters', 360: 'shapeFull' } as const;
/** The names CSS knows these sheets by, which are not the keys the drawing uses. */
const PAGE_CSS: Record<PageSize, string> = { a4: 'A4', a3: 'A3', letter: 'letter' };

export function PrintPage({ navigate }: { navigate(r: Route): void }) {
  const { lang, toast } = useUi();
  const w = useWorkspace();
  const [chosenSubject, setSubject] = useState<string | null>(null);
  const fromCanvas = w.editor.selectedId && w.tree.individuals[w.editor.selectedId] ? w.editor.selectedId : w.effectiveFocus;
  const rootId = chosenSubject && w.tree.individuals[chosenSubject] ? chosenSubject : fromCanvas;
  const root = rootId ? w.tree.individuals[rootId] : undefined;
  const [kind, setKind] = useState<Drawing>('fan');
  const [sweep, setSweep] = useState<Sweep>(180);
  const [generations, setGenerations] = useState(5);
  const [fit, setFit] = useState<PosterFit>('readable');
  const [dates, setDates] = useState(true);
  const [empties, setEmpties] = useState(true);
  const [page, setPage] = useState<PageSize>('a4');
  // A half fan is wide, a pedigree is tall, a whole tree is wider than anything: each has its
  // natural sheet unless the person chooses.
  const [chosenOrientation, setOrientation] = useState<Orientation | null>(null);
  const orientation = chosenOrientation ?? (kind === 'pedigree' || (kind === 'fan' && sweep !== 180) ? 'portrait' : 'landscape');
  const [title, setTitle] = useState<string | null>(null);
  const today = new Date().toLocaleDateString(localeOf(lang));
  const defaultTitle =
    kind === 'poster'
      ? `${t(lang, 'posterOf')} ${w.source.name} · ${today}`
      : root
        ? `${t(lang, 'chartOf')} ${displayName(root)} · ${w.source.name} · ${today}`
        : '';
  const shownTitle = title ?? defaultTitle;

  const known = useMemo(() => (root ? depthOf(ahnentafel(w.tree, root.id, MAX_GENERATIONS)) : 0), [w.tree, root]);
  const chart = useMemo(
    () =>
      kind !== 'poster' && root
        ? renderChart(w.tree, root.id, { kind, generations, dates, orientation, page, sweep, empties, title: shownTitle })
        : null,
    [kind, w.tree, root, generations, dates, orientation, page, sweep, empties, shownTitle],
  );
  const poster = useMemo(
    () => (kind === 'poster' ? renderPoster(w.tree, { page, orientation, dates, title: shownTitle, fit }) : null),
    [kind, w.tree, page, orientation, dates, shownTitle, fit],
  );
  const sheets = chart ? [chart.svg] : (poster?.sheets ?? []);
  const size = chart ?? poster;

  const savePng = async () => {
    const image = poster ? poster.whole() : chart ? { svg: chart.svg, width: chart.width, height: chart.height } : null;
    if (!image) return;
    try {
      const img = new Image();
      const url = URL.createObjectURL(new Blob([image.svg], { type: 'image/svg+xml;charset=utf-8' }));
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('svg'));
        img.src = url;
      });
      // A poster is already large in printed pixels; a chart needs the extra resolution to stay sharp.
      const scale = poster ? 1.5 : 2.5;
      const canvas = document.createElement('canvas');
      canvas.width = image.width * scale;
      canvas.height = image.height * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('png');
      const subject = kind === 'poster' ? w.source.name : root ? displayName(root) : 'arbre';
      const what = kind === 'poster' ? 'arbre-entier' : kind === 'fan' ? 'eventail' : 'ascendance';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${subject.replace(/[^\p{L}\p{N}]+/gu, '-')}-${what}.png`;
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
      <section className="home-card print-options">
        <fieldset className="print-group">
          <legend>{t(lang, 'chartGroupChart')}</legend>
          <div className="segmented" role="radiogroup" aria-label={t(lang, 'chartKind')}>
            {KINDS.map(([k, label]) => (
              <button key={k} role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
                {t(lang, label)}
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
          {kind === 'poster' ? (
            <label className="field">
              {t(lang, 'posterSize')}
              <select value={fit} onChange={(e) => setFit(e.target.value as PosterFit)}>
                {FITS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {t(lang, label)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
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
          )}
        </fieldset>
        {kind === 'poster' ? (
          <p className="print-summary print-poster-hint">{t(lang, 'posterHint')}</p>
        ) : (
          <div className="print-subject">
            <span className="print-subject-name">
              {t(lang, 'chartSubject')} : <strong>{root ? displayName(root) : '—'}</strong>
            </span>
            <SearchBox tree={w.tree} lang={lang} open onOpenChange={() => undefined} onPick={setSubject} />
          </div>
        )}
        <fieldset className="print-group">
          <legend>{t(lang, 'chartGroupPaper')}</legend>
          <label className="field">
            {t(lang, 'paperSize')}
            <select value={page} onChange={(e) => setPage(e.target.value as PageSize)}>
              {PAGE_SIZES.map(([value, label]) => (
                <option key={value} value={value}>
                  {t(lang, label)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {t(lang, 'orientation')}
            <select value={orientation} onChange={(e) => setOrientation(e.target.value as Orientation)}>
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
          {kind !== 'poster' && (
            <label className="check">
              <input type="checkbox" checked={empties} onChange={(e) => setEmpties(e.target.checked)} /> {t(lang, 'showEmpty')}
            </label>
          )}
          <label className="field grow">
            {t(lang, 'chartTitle')}
            <input value={shownTitle} onChange={(e) => setTitle(e.target.value)} />
          </label>
        </fieldset>
        {poster && (
          <p className="print-summary">
            {tn(lang, 'chartShown', poster.people, { total: w.count })} · {tn(lang, 'posterSheets', poster.sheets.length)}
            {poster.sheets.length > 1 && ` (${tf(lang, 'posterGrid', { cols: poster.cols, rows: poster.rows })})`}
            {poster.capped && <span className="print-limit"> · {tf(lang, 'posterCapped', { n: MAX_SHEETS })}</span>}
          </p>
        )}
        {chart && (
          <p className="print-summary">
            {tn(lang, 'chartShown', chart.people, { total: w.count })} · {tn(lang, 'chartKnown', known)}
            {chart.generations < Math.min(generations, known) && (
              <span className="print-limit"> · {tf(lang, 'chartSheetLimit', { n: chart.generations })}</span>
            )}
          </p>
        )}
        {!chart && !poster && <p className="print-summary">{t(lang, 'noPrintPerson')}</p>}
        <div className="row print-actions">
          <button className="btn primary" onClick={() => window.print()} disabled={!sheets.length}>
            {t(lang, 'printPdf')}
          </button>
          <button className="btn" onClick={() => void savePng()} disabled={!sheets.length}>
            {t(lang, 'exportPng')}
          </button>
        </div>
        <p className="muted small">{t(lang, 'printHint')}</p>
      </section>
      {size && sheets.length > 0 && (
        <div className={`print-sheets ${sheets.length === 1 ? 'alone' : ''}`}>
          {sheets.map((svg, i) => (
            <div
              key={i}
              className={`print-sheet ${orientation}`}
              style={{ aspectRatio: `${size.width} / ${size.height}` }}
              // The markup is built from escaped names; nothing from the file reaches it unescaped.
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
