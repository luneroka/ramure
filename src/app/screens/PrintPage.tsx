/**
 * What Ramure puts on paper: one person's ancestry as a fan or a pedigree
 * chart, the whole tree as a poster over as many sheets as it takes, or one
 * person's own sheet — who they were, their family, their life — to hand to a
 * relative who is building their own tree.
 *
 * The options are grouped by what they change — the document, the sheet, the
 * writing — and the line under them says what the drawing actually holds, so
 * that "why is my great-grandmother missing" is answered on the page rather
 * than by counting rings. The subject is chosen here too: it starts from
 * whoever is selected on the canvas, or whoever's panel the page was opened
 * from, but going back to the tree to change it was the first thing that made
 * this screen tiresome.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
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
import { personSheet } from '@/print/sheet';
import { ahnentafel, depthOf } from '@/tree/ancestry';
import { localeOf } from '@/app/lib/format';
import { usePortraitUrl } from '@/app/person/fields/Portrait';
import { PersonSheetView, SHEET_PAPER, type SheetLayout, type SheetPaper } from '@/app/screens/PersonSheet';
import { sheetPdf } from '@/app/screens/sheetPdf';
import { SearchBox } from '@/app/stage/SearchBox';
import type { Route } from '@/app/state/router';
import { useWorkspace } from '@/app/state/Workspace';
import { useUi } from '@/app/ui/UiContext';

/** The fan and the pedigree draw one person's ancestors; the poster draws everybody; the sheet is one person's own. */
type Drawing = ChartKind | 'poster' | 'sheet';
type Orientation = ChartOptions['orientation'];

const KINDS: Array<[Drawing, 'chartFan' | 'chartPedigree' | 'chartPoster' | 'chartSheet']> = [
  ['fan', 'chartFan'],
  ['pedigree', 'chartPedigree'],
  ['poster', 'chartPoster'],
  ['sheet', 'chartSheet'],
];
const GENERATIONS = Array.from({ length: MAX_GENERATIONS - MIN_GENERATIONS + 1 }, (_, i) => MIN_GENERATIONS + i);
const PAGE_SIZES: Array<[PageSize, 'paperA4' | 'paperA3' | 'paperLetter']> = [
  ['a4', 'paperA4'],
  ['a3', 'paperA3'],
  ['letter', 'paperLetter'],
];
/** A sheet of text set on A3 is A4 with wide margins: it is offered on the two papers a home printer takes. */
const SHEET_SIZES = PAGE_SIZES.filter(([size]) => size !== 'a3');
const FITS: Array<[PosterFit, 'posterFitOne' | 'posterFitReadable']> = [
  ['one', 'posterFitOne'],
  ['readable', 'posterFitReadable'],
];
const SHAPE_LABEL = { 180: 'shapeHalf', 270: 'shapeThreeQuarters', 360: 'shapeFull' } as const;
/** The names CSS knows these sheets by, which are not the keys the drawing uses. */
const PAGE_CSS: Record<PageSize, string> = { a4: 'A4', a3: 'A3', letter: 'letter' };

export function PrintPage({ navigate, route }: { navigate(r: Route): void; route?: Extract<Route, { name: 'print' }> }) {
  const { lang, toast } = useUi();
  const w = useWorkspace();
  // Opened from a person's panel, the page starts on that person's sheet.
  const [chosenSubject, setSubject] = useState<string | null>(route?.person ?? null);
  const fromCanvas = w.editor.selectedId && w.tree.individuals[w.editor.selectedId] ? w.editor.selectedId : w.effectiveFocus;
  const rootId = chosenSubject && w.tree.individuals[chosenSubject] ? chosenSubject : fromCanvas;
  const root = rootId ? w.tree.individuals[rootId] : undefined;
  const [kind, setKind] = useState<Drawing>(route?.sheet ? 'sheet' : 'fan');
  const chartKind: ChartKind | null = kind === 'fan' || kind === 'pedigree' ? kind : null;
  const isSheet = kind === 'sheet';
  const [sweep, setSweep] = useState<Sweep>(180);
  const [generations, setGenerations] = useState(5);
  const [fit, setFit] = useState<PosterFit>('readable');
  const [dates, setDates] = useState(true);
  const [empties, setEmpties] = useState(true);
  const [page, setPage] = useState<PageSize>('a4');
  const sheetPaper: SheetPaper = page === 'letter' ? 'letter' : 'a4';
  // What the person sheet carries besides the person and their family. Discretion is off unless asked for.
  const [withPhoto, setPhoto] = useState(true);
  const [withNotes, setNotes] = useState(true);
  const [withSources, setSources] = useState(true);
  const [discreet, setDiscreet] = useState(false);
  const [sheetLayout, setSheetLayout] = useState<SheetLayout>({ pages: 1, fit: 1 });
  const onSheetLayout = useCallback(
    (l: SheetLayout) => setSheetLayout((prev) => (prev.pages === l.pages && prev.fit === l.fit ? prev : l)),
    [],
  );
  // A half fan is wide, a pedigree is tall, a whole tree is wider than anything: each has its
  // natural sheet unless the person chooses. A person's sheet is read like a letter, upright.
  const [chosenOrientation, setOrientation] = useState<Orientation | null>(null);
  const orientation: Orientation = isSheet
    ? 'portrait'
    : (chosenOrientation ?? (kind === 'pedigree' || (kind === 'fan' && sweep !== 180) ? 'portrait' : 'landscape'));
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
      chartKind && root
        ? renderChart(w.tree, root.id, { kind: chartKind, generations, dates, orientation, page, sweep, empties, title: shownTitle })
        : null,
    [chartKind, w.tree, root, generations, dates, orientation, page, sweep, empties, shownTitle],
  );
  const poster = useMemo(
    () => (kind === 'poster' ? renderPoster(w.tree, { page, orientation, dates, title: shownTitle, fit }) : null),
    [kind, w.tree, page, orientation, dates, shownTitle, fit],
  );
  const sheet = useMemo(
    () => (isSheet && root ? personSheet(w.tree, root.id, { lang, discreet, notes: withNotes, sources: withSources }) : null),
    [isSheet, w.tree, root, lang, discreet, withNotes, withSources],
  );
  // The photo is offered only when there is one to show: an imported file often names pictures it does not carry.
  const portrait = usePortraitUrl(sheet?.subject.portrait);
  const sheets = chart ? [chart.svg] : (poster?.sheets ?? []);
  const size = chart ?? poster;

  // The person sheet is a file to keep or send, not a print job: it downloads as a PDF, and printing it is the reader's business.
  const sheetPages = useRef<HTMLDivElement>(null);
  const [making, setMaking] = useState(false);
  const downloadSheet = async () => {
    const pages = Array.from(sheetPages.current?.querySelectorAll<HTMLElement>('.person-page') ?? []);
    if (!root || !pages.length) return;
    setMaking(true);
    try {
      const name = displayName(root);
      const blob = await sheetPdf(pages, SHEET_PAPER[sheetPaper], { title: `${t(lang, 'chartSheet')} · ${name}`, lang });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${name.replace(/[^\p{L}\p{N}]+/gu, '-')}-fiche.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch {
      toast(t(lang, 'sheetPdfFailed'));
    } finally {
      setMaking(false);
    }
  };

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

  const sheetSummary = sheet
    ? [
        tn(lang, 'peopleCount', sheet.counts.people),
        tn(lang, 'sheetEventsCount', sheet.counts.events),
        sheet.counts.sources ? tn(lang, 'sheetSourcesCount', sheet.counts.sources) : '',
        sheet.counts.living ? tn(lang, discreet ? 'sheetLivingReduced' : 'sheetLivingCount', sheet.counts.living) : '',
        sheet.counts.private ? tn(lang, 'sheetPrivateReduced', sheet.counts.private) : '',
        tn(lang, 'sheetPages', sheetLayout.pages),
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <div className="settings print-page">
      <style>{`@page { size: ${PAGE_CSS[isSheet ? sheetPaper : page]} ${orientation}; margin: 0; }`}</style>
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
          {kind === 'poster' && (
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
          )}
          {chartKind && (
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
              {t(lang, isSheet ? 'sheetSubject' : 'chartSubject')} : <strong>{root ? displayName(root) : '—'}</strong>
            </span>
            <SearchBox tree={w.tree} lang={lang} open onOpenChange={() => undefined} onPick={setSubject} />
          </div>
        )}
        <fieldset className="print-group">
          <legend>{t(lang, 'chartGroupPaper')}</legend>
          <label className="field">
            {t(lang, 'paperSize')}
            <select value={isSheet ? sheetPaper : page} onChange={(e) => setPage(e.target.value as PageSize)}>
              {(isSheet ? SHEET_SIZES : PAGE_SIZES).map(([value, label]) => (
                <option key={value} value={value}>
                  {t(lang, label)}
                </option>
              ))}
            </select>
          </label>
          {!isSheet && (
            <label className="field">
              {t(lang, 'orientation')}
              <select value={orientation} onChange={(e) => setOrientation(e.target.value as Orientation)}>
                <option value="portrait">{t(lang, 'pagePortrait')}</option>
                <option value="landscape">{t(lang, 'landscape')}</option>
              </select>
            </label>
          )}
        </fieldset>
        {isSheet ? (
          <fieldset className="print-group grow">
            <legend>{t(lang, 'sheetGroupShown')}</legend>
            {portrait && (
              <label className="check">
                <input type="checkbox" checked={withPhoto} onChange={(e) => setPhoto(e.target.checked)} /> {t(lang, 'sheetPhoto')}
              </label>
            )}
            <label className="check">
              <input type="checkbox" checked={withNotes} onChange={(e) => setNotes(e.target.checked)} /> {t(lang, 'notes')}
            </label>
            <label className="check">
              <input type="checkbox" checked={withSources} onChange={(e) => setSources(e.target.checked)} /> {t(lang, 'sources')}
            </label>
            <label className="check">
              <input type="checkbox" checked={discreet} onChange={(e) => setDiscreet(e.target.checked)} /> {t(lang, 'sheetDiscreet')}
            </label>
            <p className="muted small">{t(lang, 'sheetDiscreetHint')}</p>
          </fieldset>
        ) : (
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
        )}
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
        {sheet && (
          <p className="print-summary">
            {sheetSummary}
            {sheetLayout.fit < 1 && (
              <span className="print-limit"> · {tf(lang, 'sheetFitted', { pct: Math.round(sheetLayout.fit * 100) })}</span>
            )}
          </p>
        )}
        {!chart && !poster && !sheet && <p className="print-summary">{t(lang, 'noPrintPerson')}</p>}
        {isSheet ? (
          <div className="row print-actions">
            <button className="btn primary" onClick={() => void downloadSheet()} disabled={!sheet || making}>
              {t(lang, making ? 'sheetPreparing' : 'sheetDownload')}
            </button>
          </div>
        ) : (
          <>
            <div className="row print-actions">
              <button className="btn primary" onClick={() => window.print()} disabled={!sheets.length}>
                {t(lang, 'printPdf')}
              </button>
              <button className="btn" onClick={() => void savePng()} disabled={!sheets.length}>
                {t(lang, 'exportPng')}
              </button>
            </div>
            <p className="muted small">{t(lang, 'printHint')}</p>
          </>
        )}
      </section>
      {sheet && (
        <div className={`print-sheets ${sheetLayout.pages === 1 ? 'alone' : ''}`}>
          <PersonSheetView
            sheet={sheet}
            lang={lang}
            paper={sheetPaper}
            treeName={w.source.name}
            photo={withPhoto ? portrait : undefined}
            date={new Date().toLocaleDateString(localeOf(lang), { day: 'numeric', month: 'short', year: 'numeric' })}
            discreet={discreet}
            onLayout={onSheetLayout}
            pagesRef={sheetPages}
          />
        </div>
      )}
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
