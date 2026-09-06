/**
 * Canvas 2D renderer for a Layout. Knows nothing about React or gestures:
 * it owns a camera, draws cards, connectors and the generation ruler, and
 * answers hit tests. Three detail bands keep large trees readable:
 * full cards, names only, dots.
 */

import { approximateYear, formatDate } from '../gedcom/dates';
import { displayName, findEvent, type Individual, type Tree } from '../gedcom/model';
import { generationLabel, type Layout, type LayoutNode } from '../tree/layout';
import type { Lang } from '../i18n';

export interface Camera { x: number; y: number; k: number }

export interface Theme {
  ground: string; surface: string; surface2: string; ink: string; ink2: string; ink3: string;
  line: string; line2: string; accent: string; focus: string; focusSoft: string; connector: string;
  male: string; female: string; unknown: string; bodyFont: string; monoFont: string;
}

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 3;

export type DetailBand = 'cards' | 'names' | 'dots';

export function detailBand(k: number): DetailBand {
  return k >= 0.6 ? 'cards' : k >= 0.26 ? 'names' : 'dots';
}

export type HandleKind = 'father' | 'mother' | 'partner' | 'child' | 'sibling';

export interface Handle {
  kind: HandleKind;
  personId: string;
  x: number; y: number; w: number; h: number;
  label: string;
}

/** Add-relative pills around the selected card, in world coordinates. */
export function computeHandles(layout: Layout, tree: Tree, selectedId: string | undefined, lang: Lang): Handle[] {
  if (!selectedId) return [];
  const n = layout.nodes.find((x) => x.id === selectedId);
  const ind = tree.individuals[selectedId];
  if (!n || !ind) return [];
  const fr = lang === 'fr';
  const labels: Record<HandleKind, string> = fr
    ? { father: '+ Père', mother: '+ Mère', partner: '+ Conjoint·e', child: '+ Enfant', sibling: '+ Frère / sœur' }
    : { father: '+ Father', mother: '+ Mother', partner: '+ Partner', child: '+ Child', sibling: '+ Sibling' };
  const birth = ind.childOf.find((l) => l.pedigree === 'birth') ?? ind.childOf[0];
  const fam = birth ? tree.families[birth.familyId] : undefined;
  const out: Handle[] = [];
  const H = 24;
  const widthFor = (label: string) => 18 + label.length * 7.2;
  const pill = (kind: HandleKind, cx: number, cy: number) => {
    const w = widthFor(labels[kind]);
    out.push({ kind, personId: selectedId, x: cx - w / 2, y: cy - H / 2, w, h: H, label: labels[kind] });
  };
  const topY = n.y - 18;
  const needFather = !fam?.husbandId, needMother = !fam?.wifeId;
  if (needFather && needMother) { pill('father', n.x + n.w * 0.28, topY); pill('mother', n.x + n.w * 0.72, topY); }
  else if (needFather) pill('father', n.x + n.w / 2, topY);
  else if (needMother) pill('mother', n.x + n.w / 2, topY);
  const bottomY = n.y + n.h + 18;
  const row: HandleKind[] = ['child', 'partner', 'sibling'];
  const widths = row.map((k) => widthFor(labels[k]));
  const total = widths.reduce((a, b) => a + b, 0) + 8 * (row.length - 1);
  let x = n.x + n.w / 2 - total / 2;
  row.forEach((k, i) => { pill(k, x + widths[i]! / 2, bottomY); x += widths[i]! + 8; });
  return out;
}

export interface RenderState {
  layout: Layout;
  handles?: Handle[];
  tree: Tree;
  camera: Camera;
  selectedId?: string;
  hoverId?: string;
  lang: Lang;
  theme: Theme;
  /** Only draw nodes intersecting the viewport (plus margin). */
  rowH: number;
}

export function readTheme(el: HTMLElement): Theme {
  const cs = getComputedStyle(el);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  return {
    ground: v('--ground'), surface: v('--surface'), surface2: v('--surface-2'), ink: v('--ink'), ink2: v('--ink-2'), ink3: v('--ink-3'),
    line: v('--line'), line2: v('--line-2'), accent: v('--accent'), focus: v('--focus'), focusSoft: v('--focus-soft'),
    connector: v('--connector'), male: v('--male'), female: v('--female'), unknown: v('--unknown'),
    bodyFont: v('--body') || 'system-ui, sans-serif', monoFont: v('--mono') || 'ui-monospace, monospace',
  };
}

function lifespan(ind: Individual, lang: Lang): string {
  const b = findEvent(ind.events, 'birth') ?? findEvent(ind.events, 'baptism');
  const d = findEvent(ind.events, 'death') ?? findEvent(ind.events, 'burial');
  const by = approximateYear(b?.date), dy = approximateYear(d?.date);
  const bs = by !== undefined ? String(by) : b?.date ? formatDate(b.date, lang) : '';
  const ds = dy !== undefined ? String(dy) : d?.date ? formatDate(d.date, lang) : '';
  if (d) return `${bs || '?'} – ${ds || '?'}`;
  if (bs) return (lang === 'fr' ? 'né·e ' : 'b. ') + bs;
  return '';
}

export function isLiving(ind: Individual): boolean {
  if (findEvent(ind.events, 'death') || findEvent(ind.events, 'burial') || findEvent(ind.events, 'cremation')) return false;
  const by = approximateYear((findEvent(ind.events, 'birth') ?? findEvent(ind.events, 'baptism'))?.date);
  if (by === undefined) return false;
  return new Date().getFullYear() - by < 110;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const ellipsisCache = new Map<string, string>();
function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  const key = ctx.font + '|' + maxW + '|' + text;
  const cached = ellipsisCache.get(key);
  if (cached !== undefined) return cached;
  let s = text;
  if (ctx.measureText(s).width > maxW) {
    while (s.length > 2 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    s = s.trimEnd() + '…';
  }
  if (ellipsisCache.size > 5000) ellipsisCache.clear();
  ellipsisCache.set(key, s);
  return s;
}

export function render(ctx: CanvasRenderingContext2D, width: number, height: number, dpr: number, s: RenderState): void {
  const { camera: cam, theme: T, layout, tree, lang } = s;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = T.ground;
  ctx.fillRect(0, 0, width, height);

  // Generation bands, alternating, in screen space.
  for (const g of layout.rows) {
    if (g % 2 !== 0) continue;
    const y = cam.y + (-g * s.rowH - s.rowH / 2) * cam.k;
    if (y > height || y + s.rowH * cam.k < 0) continue;
    ctx.fillStyle = T.surface2;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(0, y, width, s.rowH * cam.k);
    ctx.globalAlpha = 1;
  }

  ctx.setTransform(dpr * cam.k, 0, 0, dpr * cam.k, dpr * cam.x, dpr * cam.y);
  const k = cam.k;
  const band = detailBand(k);
  const vis = {
    minX: (-cam.x) / k - 200, maxX: (width - cam.x) / k + 200,
    minY: (-cam.y) / k - 200, maxY: (height - cam.y) / k + 200,
  };
  const visible = (n: LayoutNode) => n.x + n.w >= vis.minX && n.x <= vis.maxX && n.y + n.h >= vis.minY && n.y <= vis.maxY;

  // Connectors
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const l of layout.links) {
    const p0 = l.points[0]!, p1 = l.points[l.points.length - 1]!;
    if (Math.max(p0[0], p1[0]) < vis.minX || Math.min(p0[0], p1[0]) > vis.maxX || Math.max(p0[1], p1[1]) < vis.minY || Math.min(p0[1], p1[1]) > vis.maxY) continue;
    ctx.strokeStyle = l.kind === 'partner' ? T.line2 : T.connector;
    ctx.lineWidth = (l.kind === 'partner' ? 1.5 : 1.5) / Math.max(k, 0.4);
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    for (let i = 1; i < l.points.length; i++) ctx.lineTo(l.points[i]![0], l.points[i]![1]);
    ctx.stroke();
  }

  // Cards
  for (const n of layout.nodes) {
    if (!visible(n)) continue;
    const ind = tree.individuals[n.id];
    if (!ind) continue;
    const isFocus = n.id === layout.focusId;
    const isSel = n.id === s.selectedId;
    const isHover = n.id === s.hoverId;
    const sexColor = ind.sex === 'M' ? T.male : ind.sex === 'F' ? T.female : T.unknown;
    const cx = n.x + n.w / 2, cy = n.y + n.h / 2;

    if (band === 'dots') {
      ctx.fillStyle = sexColor;
      ctx.beginPath();
      ctx.arc(cx, cy, isFocus ? 16 : 11, 0, Math.PI * 2);
      ctx.fill();
      if (isFocus || isSel) { ctx.strokeStyle = isFocus ? T.focus : T.accent; ctx.lineWidth = 5 / k; ctx.stroke(); }
      continue;
    }

    const r = 7;
    roundRect(ctx, n.x, n.y, n.w, n.h, r);
    ctx.fillStyle = isFocus ? T.focusSoft : T.surface;
    ctx.fill();
    ctx.lineWidth = (isFocus || isSel ? 2 : 1) / Math.max(k, 0.5);
    ctx.strokeStyle = isFocus ? T.focus : isSel ? T.accent : isHover ? T.line2 : T.line;
    ctx.stroke();
    // Sex stripe on the left edge.
    ctx.save();
    roundRect(ctx, n.x, n.y, n.w, n.h, r);
    ctx.clip();
    ctx.fillStyle = sexColor;
    ctx.fillRect(n.x, n.y, 5, n.h);
    ctx.restore();

    ctx.fillStyle = T.ink;
    ctx.textBaseline = 'middle';
    const name = displayName(ind);
    if (band === 'names') {
      ctx.font = `600 17px ${T.bodyFont}`;
      ctx.textAlign = 'center';
      ctx.fillText(fitText(ctx, name, n.w - 22), cx + 2, cy);
    } else {
      ctx.font = `600 14px ${T.bodyFont}`;
      ctx.textAlign = 'left';
      ctx.fillText(fitText(ctx, name, n.w - 26), n.x + 15, n.y + 21);
      ctx.font = `400 12.5px ${T.monoFont}`;
      ctx.fillStyle = T.ink2;
      ctx.fillText(fitText(ctx, lifespan(ind, lang), n.w - 40), n.x + 15, n.y + 42);
      if (isLiving(ind)) {
        ctx.fillStyle = T.accent;
        ctx.beginPath();
        ctx.arc(n.x + n.w - 15, n.y + 42, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      if (n.dup > 0) {
        ctx.font = `500 10px ${T.monoFont}`;
        ctx.fillStyle = T.ink3;
        ctx.textAlign = 'right';
        ctx.fillText('×' + (n.dup + 1), n.x + n.w - 10, n.y + 14);
      }
    }
  }

  // Add-relative handles on the selected card.
  if (band === 'cards' && s.handles?.length) {
    for (const hd of s.handles) {
      roundRect(ctx, hd.x, hd.y, hd.w, hd.h, hd.h / 2);
      ctx.fillStyle = T.accent;
      ctx.fill();
      ctx.fillStyle = T.ground;
      ctx.font = `600 11.5px ${T.bodyFont}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(hd.label, hd.x + hd.w / 2, hd.y + hd.h / 2 + 0.5);
    }
  }

  // Generation ruler, fixed on the left, tracking rows vertically.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = `500 11px ${T.monoFont}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const g of layout.rows) {
    const y = cam.y + (-g * s.rowH) * cam.k;
    if (y < -12 || y > height + 12) continue;
    const label = generationLabel(g, lang).toUpperCase();
    const w = ctx.measureText(label).width + 12;
    ctx.fillStyle = T.ground;
    ctx.globalAlpha = 0.88;
    ctx.fillRect(8, y - 10, w, 20);
    ctx.globalAlpha = 1;
    ctx.fillStyle = g === 0 ? T.focus : T.ink3;
    ctx.fillText(label, 14, y);
  }
}

export function hitHandle(handles: Handle[] | undefined, cam: Camera, sx: number, sy: number): Handle | undefined {
  if (!handles?.length || detailBand(cam.k) !== 'cards') return undefined;
  const wx = (sx - cam.x) / cam.k, wy = (sy - cam.y) / cam.k;
  const slack = 4 / cam.k;
  return handles.find((h) => wx >= h.x - slack && wx <= h.x + h.w + slack && wy >= h.y - slack && wy <= h.y + h.h + slack);
}

export function hitTest(layout: Layout, cam: Camera, sx: number, sy: number): LayoutNode | undefined {
  const wx = (sx - cam.x) / cam.k, wy = (sy - cam.y) / cam.k;
  const band = detailBand(cam.k);
  for (let i = layout.nodes.length - 1; i >= 0; i--) {
    const n = layout.nodes[i]!;
    if (band === 'dots') {
      const dx = wx - (n.x + n.w / 2), dy = wy - (n.y + n.h / 2);
      // Generous target when zoomed far out: at least 22 screen px radius.
      if (dx * dx + dy * dy <= Math.pow(Math.max(16, 22 / cam.k), 2)) return n;
    } else if (wx >= n.x && wx <= n.x + n.w && wy >= n.y && wy <= n.y + n.h) return n;
  }
  return undefined;
}

export function clampZoom(k: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));
}
