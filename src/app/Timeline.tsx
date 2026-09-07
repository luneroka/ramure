/**
 * The « Frise » view: everyone as a bar across the years, one row per person,
 * grouped by generation. Scrolls natively in both directions; the year axis
 * and the generation labels stay put. Selection and panel are the tree's.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Tree } from '../gedcom/model';
import { t, type Lang } from '../i18n';
import { buildTimeline, type TimelineBar } from '../tree/timeline';

export interface TimelineHandle {
  zoomBy(factor: number): void;
  fit(): void;
}

interface Props {
  tree: Tree;
  lang: Lang;
  selectedId?: string;
  focusId?: string;
  onSelect(id: string): void;
  /** Pixels per year, controlled by the toolbar. */
  pxPerYear: number;
  onPxPerYear(v: number): void;
}

const ROW = 26;
const GROUP_HEAD = 30;
const LABEL_W = 150;
const AXIS_H = 34;
const BAR_H = 14;
export const MIN_PPY = 1.5;
export const MAX_PPY = 40;

export function Timeline({ tree, lang, selectedId, focusId, onSelect, pxPerYear, onPxPerYear }: Props) {
  const tl = useMemo(() => buildTimeline(tree, lang), [tree, lang]);
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<string | undefined>();
  const years = tl.to - tl.from;
  const width = Math.max(years * pxPerYear, 200);
  const x = (year: number) => (year - tl.from) * pxPerYear;
  const today = new Date().getFullYear();

  // Rows: a group heading, then one row per person.
  const rows = useMemo(() => {
    const out: Array<{ kind: 'head'; label: string; y: number } | { kind: 'bar'; bar: TimelineBar; y: number }> = [];
    let y = 0;
    for (const g of tl.groups) {
      out.push({ kind: 'head', label: g.label, y });
      y += GROUP_HEAD;
      for (const bar of g.bars) {
        out.push({ kind: 'bar', bar, y });
        y += ROW;
      }
      y += 8;
    }
    return { rows: out, height: y };
  }, [tl]);

  // Ctrl/⌘ + wheel or pinch zooms around the pointer; plain wheel scrolls.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - LABEL_W + el.scrollLeft;
      const yearAt = tl.from + mouseX / pxPerYear;
      const next = Math.min(MAX_PPY, Math.max(MIN_PPY, pxPerYear * Math.exp(-e.deltaY * 0.01)));
      onPxPerYear(next);
      requestAnimationFrame(() => {
        el.scrollLeft = (yearAt - tl.from) * next - (e.clientX - rect.left - LABEL_W);
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [pxPerYear, onPxPerYear, tl.from]);

  // The selected person scrolls into view.
  useEffect(() => {
    if (!selectedId || !box.current) return;
    const row = rows.rows.find((r) => r.kind === 'bar' && r.bar.id === selectedId);
    if (!row || row.kind !== 'bar') return;
    const el = box.current;
    const top = AXIS_H + row.y;
    if (top < el.scrollTop + AXIS_H || top + ROW > el.scrollTop + el.clientHeight)
      el.scrollTo({ top: top - el.clientHeight / 2, behavior: 'smooth' });
    const left = x(row.bar.start) + LABEL_W;
    if (left < el.scrollLeft + LABEL_W || left > el.scrollLeft + el.clientWidth)
      el.scrollTo({ left: left - LABEL_W - 40, behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Axis ticks: every decade, labelled every 50 years when tight, every 10 when roomy.
  const ticks: number[] = [];
  const first = Math.ceil(tl.from / 10) * 10;
  for (let y = first; y <= tl.to; y += 10) ticks.push(y);
  const labelEvery = pxPerYear >= 6 ? 10 : pxPerYear >= 2.5 ? 20 : 50;

  const sexColor = (s: TimelineBar['sex']) => (s === 'M' ? 'var(--male)' : s === 'F' ? 'var(--female)' : 'var(--unknown)');
  const title = (b: TimelineBar) => {
    const span = b.living ? `${b.start} – ${t(lang, 'living')}` : `${b.start} – ${b.openEnd ? '?' : b.end}`;
    const m = b.marriages.map((m) => `${t(lang, 'marriageShort')} ${m.year}${m.spouseName ? ` · ${m.spouseName}` : ''}`);
    return [b.name, span, ...m].join('\n');
  };

  return (
    <div ref={box} className="timeline" role="region" aria-label={t(lang, 'modeTimeline')} data-years={years}>
      <div className="tl-corner" />
      <svg className="tl-axis" width={width + LABEL_W} height={AXIS_H} style={{ left: 0 }}>
        {ticks.map((y) => (
          <g key={y} transform={`translate(${LABEL_W + x(y)},0)`}>
            <line y1={AXIS_H - (y % labelEvery === 0 ? 12 : 6)} y2={AXIS_H} className={y % 50 === 0 ? 'tl-tick strong' : 'tl-tick'} />
            {y % labelEvery === 0 && (
              <text y={AXIS_H - 16} className="tl-year" textAnchor="middle">
                {y}
              </text>
            )}
          </g>
        ))}
      </svg>
      <div className="tl-body" style={{ width: width + LABEL_W, height: rows.height }}>
        <svg className="tl-grid" width={width} height={rows.height} style={{ left: LABEL_W }}>
          {ticks.map((y) => (
            <line key={y} x1={x(y)} x2={x(y)} y1={0} y2={rows.height} className={y % 50 === 0 ? 'tl-grid-line strong' : 'tl-grid-line'} />
          ))}
          {today >= tl.from && today <= tl.to && <line x1={x(today)} x2={x(today)} y1={0} y2={rows.height} className="tl-today" />}
        </svg>
        {rows.rows.map((r) =>
          r.kind === 'head' ? (
            <div key={`h${r.label}${r.y}`} className="tl-head" style={{ top: r.y, width: LABEL_W }}>
              {r.label}
            </div>
          ) : (
            <button
              key={r.bar.id}
              type="button"
              className={`tl-row ${r.bar.id === selectedId ? 'selected' : ''} ${r.bar.id === focusId ? 'focus' : ''} ${hover === r.bar.id ? 'hover' : ''}`}
              style={{ top: r.y, height: ROW }}
              onClick={() => onSelect(r.bar.id)}
              onMouseEnter={() => setHover(r.bar.id)}
              onMouseLeave={() => setHover(undefined)}
              title={title(r.bar)}
              aria-label={r.bar.name}
            >
              <span className="tl-name" style={{ width: LABEL_W }}>
                {r.bar.name}
              </span>
              <span
                className={`tl-bar ${r.bar.approx ? 'approx' : ''} ${r.bar.openEnd ? 'open' : ''} ${r.bar.living ? 'living' : ''} ${r.bar.unsure ? 'unsure' : ''}`}
                style={{
                  left: LABEL_W + x(r.bar.start),
                  width: Math.max(3, x(r.bar.end) - x(r.bar.start)),
                  height: BAR_H,
                  top: (ROW - BAR_H) / 2,
                  ['--bar' as string]: sexColor(r.bar.sex),
                }}
              >
                {r.bar.marriages.map((m, i) => (
                  <span key={i} className="tl-marriage" style={{ left: x(m.year) - x(r.bar.start) }} aria-hidden="true" />
                ))}
              </span>
              <span className="tl-years" style={{ left: LABEL_W + x(r.bar.end) + 8 }}>
                {r.bar.start}
                {r.bar.living ? '' : ` – ${r.bar.openEnd ? '?' : r.bar.end}`}
              </span>
            </button>
          ),
        )}
        {tl.undated.length > 0 && (
          <div className="tl-undated" style={{ top: rows.height - 4 }}>
            <span className="tl-undated-label">{t(lang, 'undated')} :</span>
            {tl.undated.map((u) => (
              <button key={u.id} type="button" className={`link ${u.id === selectedId ? 'on' : ''}`} onClick={() => onSelect(u.id)}>
                {u.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
