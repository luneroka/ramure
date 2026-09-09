/**
 * Paper charts of a person's ancestry, as SVG sized to one A4 sheet: the
 * « Éventail » (a half fan, the person at the bottom centre, one ring per
 * generation) and the pedigree chart (one column per generation). Pure
 * functions of the tree, so they are tested and printed alike.
 */

import { approximateYear } from '@/gedcom/dates';
import { displayName, findEvent, type Individual, type Tree } from '@/gedcom/model';
import { ahnentafel, generationOf } from '@/tree/ancestry';

export type ChartKind = 'fan' | 'pedigree';

export interface ChartOptions {
  kind: ChartKind;
  /** 3 to 6 generations, the person included. */
  generations: number;
  dates: boolean;
  orientation: 'portrait' | 'landscape';
  title: string;
}

/** A4 at 96 px per inch. */
export const A4 = { short: 794, long: 1123 };
const MARGIN = 38; // 10 mm
const TITLE_H = 30;

export interface Chart {
  svg: string;
  width: number;
  height: number;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function years(ind: Individual): string {
  const b = approximateYear(findEvent(ind.events, 'birth')?.date ?? findEvent(ind.events, 'baptism')?.date);
  const d = approximateYear(findEvent(ind.events, 'death')?.date ?? findEvent(ind.events, 'burial')?.date);
  if (b === undefined && d === undefined) return '';
  return `${b ?? '…'} – ${d ?? (findEvent(ind.events, 'death') ? '…' : '')}`.replace(/ – $/, '');
}

function nameLines(ind: Individual): [string, string] {
  const n = ind.names[0];
  if (!n) return [displayName(ind), ''];
  return [n.given || '', n.surname.toUpperCase()];
}

export function renderChart(tree: Tree, rootId: string, opts: ChartOptions): Chart {
  const width = opts.orientation === 'portrait' ? A4.short : A4.long;
  const height = opts.orientation === 'portrait' ? A4.long : A4.short;
  const gens = Math.max(3, Math.min(6, opts.generations));
  const table = ahnentafel(tree, rootId, gens);
  const body = opts.kind === 'fan' ? fan(table, gens, width, height, opts.dates) : pedigree(table, gens, width, height, opts.dates);
  const title = opts.title
    ? `<text x="${width / 2}" y="${MARGIN + 14}" text-anchor="middle" font-family="Georgia, 'Iowan Old Style', serif" font-size="16" fill="#1f2328">${esc(opts.title)}</text>`
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="'Public Sans', 'Helvetica Neue', Arial, sans-serif"><rect width="${width}" height="${height}" fill="#ffffff"/>${title}${body}</svg>`;
  return { svg, width, height };
}

const PATERNAL = '#e9f0ec';
const MATERNAL = '#f3ecec';
const LINE = '#8a9088';
const INK = '#1f2328';
const INK_2 = '#4b5158';

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
}

function fan(table: Map<number, Individual>, gens: number, width: number, height: number, dates: boolean): string {
  const cx = width / 2;
  const top = MARGIN + TITLE_H;
  const rMax = Math.min(width / 2 - MARGIN, height - MARGIN - top);
  const cy = top + rMax;
  const r0 = Math.max(46, rMax * 0.14);
  const ringW = (rMax - r0) / (gens - 1);
  const parts: string[] = [];
  // The person: a half disc at the bottom.
  const root = table.get(1);
  parts.push(`<path d="M ${cx - r0} ${cy} A ${r0} ${r0} 0 0 1 ${cx + r0} ${cy} Z" fill="#dcebe6" stroke="${LINE}" stroke-width="0.8"/>`);
  if (root) {
    const [given, surname] = nameLines(root);
    parts.push(text(cx, cy - r0 * 0.55, given, 11, INK, 'middle', 600));
    parts.push(text(cx, cy - r0 * 0.55 + 13, surname, 11, INK, 'middle', 600));
    if (dates) parts.push(text(cx, cy - r0 * 0.55 + 26, years(root), 9, INK_2, 'middle'));
  }
  for (let g = 1; g < gens; g++) {
    const count = 2 ** g;
    const step = 180 / count;
    const rIn = r0 + (g - 1) * ringW,
      rOut = r0 + g * ringW;
    const fontSize = g <= 2 ? 10 : g === 3 ? 9 : g === 4 ? 7.5 : 6.5;
    for (let i = 0; i < count; i++) {
      const sosa = count + i;
      const ind = table.get(sosa);
      const a0 = 180 - i * step,
        a1 = a0 - step;
      const [x0, y0] = polar(cx, cy, rIn, a0),
        [x1, y1] = polar(cx, cy, rOut, a0),
        [x2, y2] = polar(cx, cy, rOut, a1),
        [x3, y3] = polar(cx, cy, rIn, a1);
      const large = step > 180 ? 1 : 0;
      const d = `M ${x0} ${y0} L ${x1} ${y1} A ${rOut} ${rOut} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${rIn} ${rIn} 0 ${large} 0 ${x0} ${y0} Z`;
      const paternal = i < count / 2;
      parts.push(
        `<path d="${d}" fill="${ind ? (paternal ? PATERNAL : MATERNAL) : '#ffffff'}" stroke="${LINE}" stroke-width="0.6"${ind ? '' : ' stroke-dasharray="2 2"'}/>`,
      );
      if (!ind) continue;
      const mid = a0 - step / 2;
      const [given, surname] = nameLines(ind);
      const lines = dates && years(ind) ? [given, surname, years(ind)] : [given, surname];
      if (g <= 2) {
        // Wide sectors: horizontal lines stacked at mid radius.
        const [tx, ty] = polar(cx, cy, (rIn + rOut) / 2, mid);
        const lh = fontSize + 3;
        lines.forEach((l, k) =>
          parts.push(
            text(
              tx,
              ty - ((lines.length - 1) * lh) / 2 + k * lh + fontSize / 2.8,
              l,
              k === 2 ? fontSize - 1.5 : fontSize,
              k === 2 ? INK_2 : INK,
              'middle',
              k === 1 ? 600 : 400,
            ),
          ),
        );
      } else {
        // Narrow sectors: text runs along the radius, reading outward on the right, inward on the left so it is never upside down.
        const rightSide = mid < 90;
        const lh = fontSize + 1.5;
        const rText = rightSide ? rIn + 5 : rOut - 5;
        lines.forEach((l, k) => {
          const offset = (k - (lines.length - 1) / 2) * lh;
          const [tx, ty] = polar(cx, cy, rText, mid + (offset / rText) * (180 / Math.PI) * (rightSide ? -1 : 1));
          const rot = rightSide ? -mid : 180 - mid;
          parts.push(
            `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" transform="rotate(${rot.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)})" text-anchor="start" dominant-baseline="middle" font-size="${k === 2 ? fontSize - 1 : fontSize}" font-weight="${k === 1 ? 600 : 400}" fill="${k === 2 ? INK_2 : INK}">${esc(l)}</text>`,
          );
        });
      }
    }
  }
  return parts.join('');
}

function text(x: number, y: number, s: string, size: number, fill: string, anchor: 'start' | 'middle' | 'end', weight = 400): string {
  if (!s) return '';
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(s)}</text>`;
}

function pedigree(table: Map<number, Individual>, gens: number, width: number, height: number, dates: boolean): string {
  const top = MARGIN + TITLE_H;
  const availH = height - top - MARGIN;
  const hGap = 18;
  const bw = (width - 2 * MARGIN - (gens - 1) * hGap) / gens;
  const parts: string[] = [];
  const slot = (g: number) => availH / 2 ** g;
  const boxH = (g: number) => Math.min(54, slot(g) - 4);
  const centreY = (sosa: number) => {
    const g = generationOf(sosa);
    const i = sosa - 2 ** g;
    return top + (i + 0.5) * slot(g);
  };
  const x = (g: number) => MARGIN + g * (bw + hGap);
  for (let sosa = 1; sosa < 2 ** gens; sosa++) {
    const g = generationOf(sosa);
    const ind = table.get(sosa);
    const bh = boxH(g);
    const cy = centreY(sosa);
    const bx = x(g);
    // Connector to the parents' column.
    if (g < gens - 1 && ind) {
      const fy = centreY(2 * sosa),
        my = centreY(2 * sosa + 1);
      const xr = bx + bw,
        xm = xr + hGap / 2;
      parts.push(
        `<path d="M ${xr} ${cy} H ${xm} M ${xm} ${fy} V ${my} M ${xm} ${fy} H ${xm + hGap / 2} M ${xm} ${my} H ${xm + hGap / 2}" fill="none" stroke="${LINE}" stroke-width="0.8"/>`,
      );
    }
    parts.push(
      `<rect x="${bx}" y="${(cy - bh / 2).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="${ind ? (sosa === 1 ? '#dcebe6' : sosa % 2 === 0 ? PATERNAL : MATERNAL) : '#ffffff'}" stroke="${LINE}" stroke-width="0.7"${ind ? '' : ' stroke-dasharray="2 2"'}/>`,
    );
    if (!ind) continue;
    const [given, surname] = nameLines(ind);
    const fontSize = bh >= 40 ? 10 : bh >= 28 ? 8.5 : 7;
    const lh = fontSize + 2;
    const lines =
      bh >= 3 * lh - 2
        ? [given, surname, dates ? years(ind) : ''].filter(Boolean)
        : [`${given} ${surname}`.trim(), bh >= 2 * lh && dates ? years(ind) : ''].filter(Boolean);
    lines.forEach((l, k) => {
      const isDates = dates && k === lines.length - 1 && l === years(ind);
      parts.push(
        text(
          bx + 6,
          cy - ((lines.length - 1) * lh) / 2 + k * lh + fontSize / 2.8,
          l,
          isDates ? fontSize - 1 : fontSize,
          isDates ? INK_2 : INK,
          'start',
          l === surname ? 600 : 400,
        ),
      );
    });
  }
  return parts.join('');
}
