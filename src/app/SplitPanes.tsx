/**
 * Two stacked, independently scrolling regions with a draggable divider,
 * the way an editor's side bar splits its sections. Each region carries a
 * tab strip; either can collapse to that strip. On narrow screens the two
 * strips merge into one and the split disappears.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { t, type Lang } from '../i18n';

export interface Tab {
  id: string;
  label: string;
  count?: number;
}

interface Props {
  lang: Lang;
  top: { tabs: Tab[]; active: string; onSelect(id: string): void; render(id: string): ReactNode };
  bottom: { tabs: Tab[]; active: string; onSelect(id: string): void; render(id: string): ReactNode };
  narrow: boolean;
}

const RATIO_KEY = 'ramure.panelSplit';
const DEFAULT_RATIO = 0.6;
const MIN_RATIO = 0.2;

function readRatio(): number {
  try {
    const v = Number(localStorage.getItem(RATIO_KEY));
    return v >= MIN_RATIO && v <= 1 - MIN_RATIO ? v : DEFAULT_RATIO;
  } catch {
    return DEFAULT_RATIO;
  }
}

function TabStrip({ tabs, active, onSelect, extra }: { tabs: Tab[]; active: string; onSelect(id: string): void; extra?: ReactNode }) {
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
    const i = tabs.findIndex((t) => t.id === active);
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? tabs.length - 1
          : e.key === 'ArrowRight'
            ? (i + 1) % tabs.length
            : (i - 1 + tabs.length) % tabs.length;
    const id = tabs[next]?.id;
    if (!id) return;
    e.preventDefault();
    onSelect(id);
    (e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')[next] ?? null)?.focus();
  };
  return (
    <div className="tabs" role="tablist" onKeyDown={onKey}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={active === tab.id}
          tabIndex={active === tab.id ? 0 : -1}
          className={`tab ${active === tab.id ? 'on' : ''}`}
          onClick={() => onSelect(tab.id)}
        >
          {tab.label}
          {tab.count !== undefined && tab.count > 0 && <span className="tab-count">{tab.count}</span>}
        </button>
      ))}
      {extra}
    </div>
  );
}

export function SplitPanes({ lang, top, bottom, narrow }: Props) {
  const [ratio, setRatio] = useState(readRatio);
  const [collapsed, setCollapsed] = useState<'top' | 'bottom' | null>(null);
  const [lastHalf, setLastHalf] = useState<'top' | 'bottom'>('top');
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    if (collapsed) return;
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const next = Math.min(1 - MIN_RATIO, Math.max(MIN_RATIO, (e.clientY - r.top) / r.height));
    setRatio(next);
  };
  const onPointerUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    try {
      localStorage.setItem(RATIO_KEY, String(ratio));
    } catch {
      /* ignore */
    }
  }, [ratio]);
  useEffect(() => {
    window.addEventListener('pointerup', onPointerUp);
    return () => window.removeEventListener('pointerup', onPointerUp);
  }, [onPointerUp]);

  if (narrow) {
    // One strip of four tabs; the half of the last tab touched renders.
    const all = [...top.tabs, ...bottom.tabs];
    const active = lastHalf === 'top' ? top.active : bottom.active;
    const select = (id: string) => {
      if (top.tabs.some((tb) => tb.id === id)) {
        setLastHalf('top');
        top.onSelect(id);
      } else {
        setLastHalf('bottom');
        bottom.onSelect(id);
      }
    };
    return (
      <div className="split narrow">
        <TabStrip tabs={all} active={active} onSelect={select} />
        <div className="half-body">{lastHalf === 'top' ? top.render(active) : bottom.render(active)}</div>
      </div>
    );
  }

  const toggle = (which: 'top' | 'bottom') => setCollapsed((c) => (c === which ? null : which));
  const collapseButton = (which: 'top' | 'bottom') => (
    <button
      className="tab-collapse"
      onClick={() => toggle(which)}
      title={collapsed === which ? t(lang, 'expandHalf') : t(lang, 'collapseHalf')}
      aria-label={collapsed === which ? t(lang, 'expandHalf') : t(lang, 'collapseHalf')}
    >
      {collapsed === which ? (which === 'top' ? '⌄' : '⌃') : which === 'top' ? '⌃' : '⌄'}
    </button>
  );
  const topStyle = collapsed === 'top' ? { flex: '0 0 auto' } : collapsed === 'bottom' ? { flex: '1 1 0' } : { flex: `${ratio} 1 0` };
  const bottomStyle =
    collapsed === 'bottom' ? { flex: '0 0 auto' } : collapsed === 'top' ? { flex: '1 1 0' } : { flex: `${1 - ratio} 1 0` };

  return (
    <div ref={box} className="split">
      <section className={`half ${collapsed === 'top' ? 'collapsed' : ''}`} style={topStyle}>
        <TabStrip tabs={top.tabs} active={top.active} onSelect={top.onSelect} extra={collapseButton('top')} />
        {collapsed !== 'top' && <div className="half-body">{top.render(top.active)}</div>}
      </section>
      <div
        className={`divider ${collapsed ? 'disabled' : ''}`}
        role="separator"
        aria-orientation="horizontal"
        title={t(lang, 'resizeHint')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onDoubleClick={() => {
          setRatio(DEFAULT_RATIO);
          setCollapsed(null);
          try {
            localStorage.setItem(RATIO_KEY, String(DEFAULT_RATIO));
          } catch {
            /* ignore */
          }
        }}
      >
        <span className="divider-pill" />
      </div>
      <section className={`half ${collapsed === 'bottom' ? 'collapsed' : ''}`} style={bottomStyle}>
        <TabStrip tabs={bottom.tabs} active={bottom.active} onSelect={bottom.onSelect} extra={collapseButton('bottom')} />
        {collapsed !== 'bottom' && <div className="half-body">{bottom.render(bottom.active)}</div>}
      </section>
    </div>
  );
}
