/** Paper charts of the selected person's ancestry: previewed here, printed (or saved as PDF) by the browser, or saved as PNG. */

import { useMemo, useState } from 'react';
import { displayName } from '../gedcom/model';
import { t } from '../i18n';
import { renderChart, type ChartKind, type ChartOptions } from '../print/charts';
import { depthOf, ahnentafel } from '../tree/ancestry';
import { localeOf } from './format';
import type { Route } from './router';
import { useWorkspace } from './session/Workspace';
import { useUi } from './ui/UiContext';

const GENERATIONS = [3, 4, 5, 6];

export function PrintPage({ navigate }: { navigate(r: Route): void }) {
  const { lang, toast } = useUi();
  const w = useWorkspace();
  const rootId = w.editor.selectedId && w.tree.individuals[w.editor.selectedId] ? w.editor.selectedId : w.effectiveFocus;
  const root = rootId ? w.tree.individuals[rootId] : undefined;
  const [kind, setKind] = useState<ChartKind>('fan');
  const [generations, setGenerations] = useState(5);
  const [dates, setDates] = useState(true);
  // A half fan is wide, a pedigree is tall: each kind has its natural sheet unless the person chooses.
  const [chosenOrientation, setOrientation] = useState<ChartOptions['orientation'] | null>(null);
  const orientation: ChartOptions['orientation'] = chosenOrientation ?? (kind === 'fan' ? 'landscape' : 'portrait');
  const [title, setTitle] = useState<string | null>(null);
  const defaultTitle = root
    ? `${t(lang, 'chartOf')} ${displayName(root)} · ${w.source.name} · ${new Date().toLocaleDateString(localeOf(lang))}`
    : '';
  const shownTitle = title ?? defaultTitle;
  const depth = useMemo(() => (root ? depthOf(ahnentafel(w.tree, root.id, 6)) : 0), [w.tree, root]);
  const chart = useMemo(
    () => (root ? renderChart(w.tree, root.id, { kind, generations, dates, orientation, title: shownTitle }) : null),
    [w.tree, root, kind, generations, dates, orientation, shownTitle],
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
      <style>{`@page { size: A4 ${orientation}; margin: 0; }`}</style>
      <div className="settings-head">
        <button className="btn subtle" onClick={() => navigate({ name: 'tree', id: w.source.id })}>
          ← {t(lang, 'backToTree')}
        </button>
        <h1>{t(lang, 'printTitle')}</h1>
        <span className="muted resources-tree">{w.source.name}</span>
      </div>
      {!root ? (
        <p className="muted">{t(lang, 'noPrintPerson')}</p>
      ) : (
        <>
          <p className="muted resources-hint">{t(lang, 'printRootHint')}</p>
          <section className="home-card print-options">
            <div className="segmented" role="radiogroup" aria-label={t(lang, 'chartKind')}>
              {(['fan', 'pedigree'] as ChartKind[]).map((k) => (
                <button key={k} role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
                  {t(lang, k === 'fan' ? 'chartFan' : 'chartPedigree')}
                </button>
              ))}
            </div>
            <label className="field">
              {t(lang, 'generations')}
              <select value={generations} onChange={(e) => setGenerations(Number(e.target.value))}>
                {GENERATIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                    {g > depth ? ` (${t(lang, 'generationsKnown')} ${depth})` : ''}
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
            <label className="check">
              <input type="checkbox" checked={dates} onChange={(e) => setDates(e.target.checked)} /> {t(lang, 'showDates')}
            </label>
            <label className="field grow">
              {t(lang, 'chartTitle')}
              <input value={shownTitle} onChange={(e) => setTitle(e.target.value)} />
            </label>
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
          {chart && (
            <div
              className={`print-sheet ${orientation}`}
              style={{ aspectRatio: `${chart.width} / ${chart.height}` }}
              // The markup is built by renderChart from escaped names; nothing from the file reaches it unescaped.
              dangerouslySetInnerHTML={{ __html: chart.svg }}
            />
          )}
        </>
      )}
    </div>
  );
}
