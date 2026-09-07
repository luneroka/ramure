/**
 * React wrapper around the canvas renderer: owns the camera, handles pointer
 * gestures (pan, pinch, tap, hover), wheel zoom, resizing and theme changes,
 * and exposes an imperative handle for fit / re-centre / zoom.
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import type { Tree } from '../gedcom/model';
import type { Lang } from '../i18n';
import { DEFAULT_LAYOUT, type Layout } from '../tree/layout';
import {
  clampZoom,
  computeHandles,
  detailBand,
  hitHandle,
  hitTest,
  readTheme,
  render,
  type Camera,
  type DetailBand,
  type HandleKind,
  type Theme,
} from './renderer';
import { PortraitCache } from '../media/portraits';

export interface TreeCanvasHandle {
  fit(animate?: boolean): void;
  /** Opening view: the whole tree when it stays readable, otherwise the focus person at card size. */
  initialView(): void;
  centerOn(id: string, animate?: boolean): void;
  /** Frame these people, at a zoom where their cards stay readable. */
  fitTo(ids: string[], animate?: boolean): void;
  zoomBy(factor: number): void;
}

export interface TreeCanvasProps {
  tree: Tree;
  layout: Layout;
  selectedId?: string;
  lang: Lang;
  /** Tap on a card. */
  onSelect(id: string): void;
  /** Double tap on a card, or tap on the already selected card. */
  onFocus(id: string): void;
  onBandChange?(band: DetailBand, zoom: number): void;
  /** Tap on an add-relative handle of the selected card. */
  onHandle?(kind: HandleKind, personId: string, at: { x: number; y: number }): void;
  /** Show the add-relative handle on the selected card (the kinship handle is always there). */
  editable?: boolean;
  /** Card drawn as a dashed preview: a relative being added, not yet saved. */
  draftId?: string;
  /** Relationship mode: bright people and the path between them. */
  lit?: { ids: ReadonlySet<string>; path: string[] };
}

const ROW_H = DEFAULT_LAYOUT.cardH + DEFAULT_LAYOUT.rowGap;

export const TreeCanvas = forwardRef<TreeCanvasHandle, TreeCanvasProps>(function TreeCanvas(props, ref) {
  const { tree, layout, selectedId, lang, onSelect, onFocus, onBandChange, onHandle, editable, draftId, lit } = props;
  const handles = useMemo(() => computeHandles(layout, tree, selectedId, { plus: !!editable }), [editable, layout, tree, selectedId]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cam = useRef<Camera>({ x: 0, y: 0, k: 1 });
  const size = useRef({ w: 0, h: 0, dpr: 1 });
  const theme = useRef<Theme | null>(null);
  const hoverId = useRef<string | undefined>(undefined);
  const raf = useRef(0);
  const anim = useRef<number | null>(null);
  // A freshly mounted canvas fits its whole layout as soon as it knows its size.
  const pendingFit = useRef(true);
  /** People to frame as soon as the canvas has a size (a hidden pane reports none). */
  const pendingFitIds = useRef<string[] | null>(null);
  const portraits = useRef<PortraitCache | null>(null);
  if (!portraits.current) portraits.current = new PortraitCache(() => drawRef.current());
  const RULER_GUTTER = 170; // screen px reserved on the left for generation labels
  const reduced = useMemo(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches, []);

  const draw = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      if (!theme.current) theme.current = readTheme(document.documentElement);
      render(ctx, size.current.w, size.current.h, size.current.dpr, {
        layout,
        tree,
        camera: cam.current,
        selectedId,
        hoverId: hoverId.current,
        lang,
        theme: theme.current,
        rowH: ROW_H,
        handles,
        draftId,
        lit,
        portrait: (id) => portraits.current!.get(id),
      });
      onBandChange?.(detailBand(cam.current.k), cam.current.k);
    });
  }, [layout, tree, selectedId, lang, onBandChange, handles, draftId, lit]);
  // Effects that must not re-run when draw changes read it through this ref.
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const fitRef = useRef<(animate: boolean, readableOnly?: boolean) => void>(() => {});

  // Resize with the container; keep the world point at the centre fixed.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const parent = canvas.parentElement!;
    const ro = new ResizeObserver(() => {
      const w = parent.clientWidth,
        h = parent.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const prev = size.current;
      if (prev.w && prev.h) {
        cam.current.x += (w - prev.w) / 2;
        cam.current.y += (h - prev.h) / 2;
      }
      size.current = { w, h, dpr };
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      if (pendingFit.current) {
        pendingFit.current = false;
        fitRef.current(false);
      }
      if (pendingFitIds.current) {
        const ids = pendingFitIds.current;
        pendingFitIds.current = null;
        fitToRef.current(ids, false);
      }
      drawRef.current();
    });
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  // Theme changes: re-read tokens.
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      theme.current = null;
      drawRef.current();
    };
    mq.addEventListener('change', onChange);
    const mo = new MutationObserver(onChange);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    if (document.fonts?.ready) document.fonts.ready.then(onChange);
    return () => {
      mq.removeEventListener('change', onChange);
      mo.disconnect();
    };
  }, []);

  useEffect(() => {
    draw();
  }, [draw]);
  useEffect(() => () => portraits.current?.dispose(), []);

  const animateTo = useCallback(
    (target: Camera, animate: boolean) => {
      if (anim.current) cancelAnimationFrame(anim.current);
      if (!animate || reduced) {
        cam.current = target;
        draw();
        return;
      }
      const from = { ...cam.current };
      const t0 = performance.now();
      const D = 380;
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / D);
        const e = 1 - Math.pow(1 - t, 3);
        cam.current = { x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, k: from.k + (target.k - from.k) * e };
        draw();
        if (t < 1) anim.current = requestAnimationFrame(step);
        else anim.current = null;
      };
      anim.current = requestAnimationFrame(step);
    },
    [draw, reduced],
  );

  const centerWorld = useCallback(
    (wx: number, wy: number, k: number, animate: boolean) => {
      const { w, h } = size.current;
      animateTo({ x: w / 2 - wx * k, y: h / 2 - wy * k, k: clampZoom(k) }, animate);
    },
    [animateTo],
  );

  const fitNow = useCallback(
    (animate: boolean, readableOnly = false) => {
      const { w, h } = size.current;
      const b = layout.bounds;
      if (!isFinite(b.minX)) return;
      if (!w || !h) {
        pendingFit.current = true;
        return;
      }
      const gutter = Math.min(RULER_GUTTER, w * 0.28);
      const pad = 32;
      const availW = w - gutter - pad,
        availH = h - pad * 2;
      const k = clampZoom(Math.min(availW / (b.maxX - b.minX), availH / (b.maxY - b.minY), 1.2));
      if (readableOnly && k < 0.6) {
        // Too small to read: open on the focus card instead, at a size where names are legible.
        const n = layout.nodes.find((x) => x.id === layout.focusId);
        if (n) {
          const k2 = w < 600 ? 0.8 : 0.9;
          animateTo({ x: gutter + availW / 2 - (n.x + n.w / 2) * k2, y: h / 2 - (n.y + n.h / 2) * k2, k: k2 }, animate);
          return;
        }
      }
      // Centre in the area to the right of the ruler gutter.
      const cx = (b.minX + b.maxX) / 2,
        cy = (b.minY + b.maxY) / 2;
      animateTo({ x: gutter + availW / 2 - cx * k, y: h / 2 - cy * k, k }, animate);
    },
    [layout, animateTo],
  );
  fitRef.current = fitNow;

  const fitToIds = useCallback(
    (ids: string[], animate: boolean) => {
      const nodes = layout.nodes.filter((n) => ids.includes(n.id));
      const { w, h } = size.current;
      if (!nodes.length) return;
      if (!w || !h) {
        pendingFitIds.current = ids;
        return;
      }
      const b = nodes.reduce(
        (acc, n) => ({
          minX: Math.min(acc.minX, n.x),
          minY: Math.min(acc.minY, n.y),
          maxX: Math.max(acc.maxX, n.x + n.w),
          maxY: Math.max(acc.maxY, n.y + n.h),
        }),
        { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
      );
      const gutter = Math.min(RULER_GUTTER, w * 0.28);
      const pad = 48;
      const availW = w - gutter - pad,
        availH = h - pad * 2;
      const k = clampZoom(Math.min(availW / (b.maxX - b.minX), availH / (b.maxY - b.minY), 1));
      const cx = (b.minX + b.maxX) / 2,
        cy = (b.minY + b.maxY) / 2;
      animateTo({ x: gutter + availW / 2 - cx * k, y: h / 2 - cy * k, k }, animate);
    },
    [layout, animateTo],
  );
  const fitToRef = useRef(fitToIds);
  fitToRef.current = fitToIds;

  const zoomAt = useCallback(
    (sx: number, sy: number, factor: number) => {
      const c = cam.current;
      const k2 = clampZoom(c.k * factor);
      cam.current = { x: sx - (sx - c.x) * (k2 / c.k), y: sy - (sy - c.y) * (k2 / c.k), k: k2 };
      draw();
    },
    [draw],
  );

  useImperativeHandle(
    ref,
    () => ({
      fit(animate = true) {
        fitNow(animate);
      },
      initialView() {
        fitNow(false, true);
      },
      centerOn(id, animate = true) {
        const n = layout.nodes.find((x) => x.id === id);
        if (!n) return;
        centerWorld(n.x + n.w / 2, n.y + n.h / 2, Math.max(cam.current.k, 0.75), animate);
      },
      fitTo(ids, animate = true) {
        fitToIds(ids, animate);
      },
      zoomBy(factor) {
        const { w, h } = size.current;
        zoomAt(w / 2, h / 2, factor);
      },
    }),
    [layout, centerWorld, fitNow, zoomAt, fitToIds],
  );

  // ---------- Gestures ----------
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: number; pinch0?: { d: number; k: number }; downAt?: number; lastTap?: { t: number; id: string } }>({
    moved: 0,
  });

  const pos = (e: React.PointerEvent | React.WheelEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (anim.current) {
      cancelAnimationFrame(anim.current);
      anim.current = null;
    }
    try {
      canvasRef.current!.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events have no capturable pointer */
    }
    ptrs.current.set(e.pointerId, pos(e));
    if (ptrs.current.size === 1) {
      gesture.current.moved = 0;
      gesture.current.downAt = performance.now();
    }
    if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      gesture.current.pinch0 = { d: Math.hypot(a!.x - b!.x, a!.y - b!.y), k: cam.current.k };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = pos(e);
    if (!ptrs.current.has(e.pointerId)) {
      if (e.pointerType === 'mouse') {
        const hd = hitHandle(handles, cam.current, p.x, p.y);
        const h = hd ? undefined : hitTest(layout, cam.current, p.x, p.y);
        const id = h?.id;
        if (id !== hoverId.current) {
          hoverId.current = id;
          draw();
        }
        canvasRef.current!.style.cursor = id || hd ? 'pointer' : 'grab';
      }
      return;
    }
    const prev = ptrs.current.get(e.pointerId)!;
    ptrs.current.set(e.pointerId, p);
    if (ptrs.current.size === 1) {
      cam.current = { ...cam.current, x: cam.current.x + p.x - prev.x, y: cam.current.y + p.y - prev.y };
      gesture.current.moved += Math.hypot(p.x - prev.x, p.y - prev.y);
      canvasRef.current!.style.cursor = 'grabbing';
      draw();
    } else if (ptrs.current.size === 2 && gesture.current.pinch0) {
      const [a, b] = [...ptrs.current.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const mid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
      const prevMid = { x: mid.x - (p.x - prev.x) / 2, y: mid.y - (p.y - prev.y) / 2 };
      const k2 = clampZoom((gesture.current.pinch0.k * d) / gesture.current.pinch0.d);
      const c = cam.current;
      cam.current = { x: mid.x - (prevMid.x - c.x) * (k2 / c.k), y: mid.y - (prevMid.y - c.y) * (k2 / c.k), k: k2 };
      gesture.current.moved = 99;
      draw();
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!ptrs.current.has(e.pointerId)) return;
    const p = ptrs.current.get(e.pointerId)!;
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size < 2) gesture.current.pinch0 = undefined;
    if (ptrs.current.size === 0) {
      canvasRef.current!.style.cursor = 'grab';
      const quick = gesture.current.moved < 6 && performance.now() - (gesture.current.downAt ?? 0) < 600;
      if (quick) {
        const hd = hitHandle(handles, cam.current, p.x, p.y);
        if (hd) {
          onHandle?.(hd.kind, hd.personId, {
            x: (hd.x + hd.w) * cam.current.k + cam.current.x,
            y: (hd.y + hd.h / 2) * cam.current.k + cam.current.y,
          });
          return;
        }
        const h = hitTest(layout, cam.current, p.x, p.y);
        if (h) {
          const now = performance.now();
          const last = gesture.current.lastTap;
          if ((last && last.id === h.id && now - last.t < 350) || h.id === selectedId) {
            gesture.current.lastTap = undefined;
            onFocus(h.id);
          } else {
            gesture.current.lastTap = { t: now, id: h.id };
            onSelect(h.id);
          }
        }
      }
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    const p = pos(e);
    // Trackpad pinch arrives as ctrlKey+wheel; plain wheel zooms too, gently.
    const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022));
    zoomAt(p.x, p.y, factor);
  };

  // React's onWheel is passive; we need preventDefault to stop page scroll.
  useEffect(() => {
    const el = canvasRef.current!;
    const stop = (e: WheelEvent) => e.preventDefault();
    el.addEventListener('wheel', stop, { passive: false });
    return () => el.removeEventListener('wheel', stop);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="tree-canvas"
      role="img"
      aria-label="Arbre généalogique"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    />
  );
});
