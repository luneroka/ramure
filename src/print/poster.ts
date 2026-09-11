/**
 * The whole tree on paper: every person in the file, not one person's ancestry.
 *
 * The fan and the pedigree chart are built from a Sosa table, so nobody but a
 * direct ancestor can appear on them — a family of 124 prints as 21. This one
 * takes the layout the canvas already uses for « Vue d'ensemble »
 * (`layoutEverything`) and puts it on sheets, so a cousin, a second husband and
 * a childless great-aunt are all on the wall.
 *
 * Two things follow from being a poster rather than a page:
 *
 * - **It tiles.** A drawing that would be a smudge on one A4 is cut into a grid
 *   of sheets at a size you can read, and each sheet says where it belongs. The
 *   count is shown before anything is printed, because "readable" on a large
 *   family means a lot of paper.
 * - **Each sheet carries only what crosses it.** The nodes and lines are culled
 *   per sheet rather than every sheet holding the whole drawing behind a clip,
 *   which for a four-thousand-person tree is the difference between a few
 *   hundred kilobytes and tens of megabytes.
 */

import type { Individual, Tree } from '@/gedcom/model';
import { DEFAULT_LAYOUT, type Layout, type LayoutLink, type LayoutNode } from '@/tree/layout';
import { layoutEverything } from '@/tree/layoutAll';
import { PAGES, type PageSize } from './charts';
import { lifeYears, nameParts } from './person';
import { truncate } from './text';

/** Sized to one sheet, or sized to be read and spread over as many as that takes. */
export type PosterFit = 'one' | 'readable';

export interface PosterOptions {
  page: PageSize;
  orientation: 'portrait' | 'landscape';
  dates: boolean;
  title: string;
  fit: PosterFit;
}

export interface Poster {
  /** One SVG per sheet, in reading order: left to right, then down. */
  sheets: string[];
  cols: number;
  rows: number;
  width: number;
  height: number;
  people: number;
  /** Printed pixels per world unit. A name is set at 14 world units. */
  scale: number;
  /** True when the drawing was shrunk further than asked to stay under the sheet limit. */
  capped: boolean;
  /**
   * The same drawing as one undivided image, for saving a PNG to send to a
   * relative. Built on demand: on a large tree it is a megabyte of SVG, and the
   * screen re-renders the sheets on every change of an option.
   */
  whole(): { svg: string; width: number; height: number };
}

/** Beyond this a poster is not a poster, it is a ream. The drawing shrinks instead. */
export const MAX_SHEETS = 60;
/**
 * The scale « lisible » aims for: the name on a card is 14 world units, and 8.4
 * printed pixels is 6.3 pt — small, but the size a wall chart is read at from a
 * foot away. Below that it stops being worth the paper.
 */
const READABLE = 0.6;
const MAX_SCALE = 1.4;

const MARGIN = 24; // 6 mm: a poster is trimmed and butted against its neighbour, not bound
const FOOTER = 16;
const INK = '#1f2328';
const INK_2 = '#4b5158';
const INK_3 = '#6b7178';
const LINE = '#c9cec8';
const CONNECTOR = '#a6aba5';
const SURFACE = '#ffffff';
const SEX = { M: '#4c7fa8', F: '#b5606f', U: '#8a8f94' };
/** Room at the left of the drawing for the generation labels the canvas shows on its ruler. */
const GUTTER = 150;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const overlaps = (a: Box, b: Box) => a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;

function linkBox(l: LayoutLink): Box {
  const xs = l.points.map((p) => p[0]);
  const ys = l.points.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

export interface SheetPlan {
  scale: number;
  cols: number;
  rows: number;
  /** True when the drawing was shrunk past what was asked for, to stay under `MAX_SHEETS`. */
  capped: boolean;
}

/**
 * How big to draw, and over how many sheets. Pure arithmetic, so the limit can
 * be tested on a wall-sized tree without building one.
 *
 * « Sur une feuille » is whatever fits; « lisible » holds a fixed scale and
 * spends paper, but never past the cap — a family that would take two hundred
 * sheets gets a smaller poster rather than a surprise at the printer.
 */
export function sheetPlan(drawW: number, drawH: number, availW: number, availH: number, fit: PosterFit): SheetPlan {
  const onOneSheet = Math.min(availW / drawW, availH / drawH);
  let scale = fit === 'one' ? onOneSheet : Math.min(MAX_SCALE, Math.max(onOneSheet, READABLE));
  const grid = () => ({ cols: Math.max(1, Math.ceil((drawW * scale) / availW)), rows: Math.max(1, Math.ceil((drawH * scale) / availH)) });
  let { cols, rows } = grid();
  let capped = false;
  while (cols * rows > MAX_SHEETS && scale > onOneSheet) {
    scale = Math.max(onOneSheet, scale * 0.85);
    ({ cols, rows } = grid());
    capped = true;
  }
  return { scale, cols, rows, capped };
}

export function renderPoster(tree: Tree, opts: PosterOptions): Poster {
  const layout = layoutEverything(tree, DEFAULT_LAYOUT);
  const page = PAGES[opts.page];
  const width = opts.orientation === 'portrait' ? page.short : page.long;
  const height = opts.orientation === 'portrait' ? page.long : page.short;
  const availW = width - 2 * MARGIN;
  const availH = height - 2 * MARGIN - FOOTER;

  const world: Box = {
    x0: layout.bounds.minX - (layout.rowLabels ? GUTTER : 0),
    y0: layout.bounds.minY,
    x1: layout.bounds.maxX,
    y1: layout.bounds.maxY,
  };
  const drawW = Math.max(1, world.x1 - world.x0);
  const drawH = Math.max(1, world.y1 - world.y0);
  const { scale, cols, rows, capped } = sheetPlan(drawW, drawH, availW, availH, opts.fit);

  // Centre whatever room is left over, so a drawing that nearly fills its sheets is not shoved into a corner.
  const slackX = Math.max(0, (cols * availW - drawW * scale) / 2);
  const slackY = Math.max(0, (rows * availH - drawH * scale) / 2);

  const sheets: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // The slice of the world this sheet shows, in world units.
      const wx = world.x0 + (c * availW - slackX) / scale;
      const wy = world.y0 + (r * availH - slackY) / scale;
      const win: Box = { x0: wx, y0: wy, x1: wx + availW / scale, y1: wy + availH / scale };
      sheets.push(sheet(tree, layout, opts, { width, height, scale, win, col: c, row: r, cols, rows }));
    }
  }
  const whole = () => {
    const w = Math.round(drawW * scale) + 2 * MARGIN;
    const h = Math.round(drawH * scale) + 2 * MARGIN + FOOTER;
    return {
      svg: sheet(tree, layout, opts, { width: w, height: h, scale, win: world, col: 0, row: 0, cols: 1, rows: 1 }),
      width: w,
      height: h,
    };
  };
  return { sheets, cols, rows, width, height, people: layout.nodes.length, scale, capped, whole };
}

interface SheetSpec {
  width: number;
  height: number;
  scale: number;
  win: Box;
  col: number;
  row: number;
  cols: number;
  rows: number;
}

function sheet(tree: Tree, layout: Layout, opts: PosterOptions, s: SheetSpec): string {
  const parts: string[] = [];
  for (const l of layout.links) {
    if (!overlaps(linkBox(l), s.win)) continue;
    const d = l.points.map((p, i) => `${i ? 'L' : 'M'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    parts.push(`<path d="${d}" fill="none" stroke="${CONNECTOR}" stroke-width="${(1.4 / s.scale).toFixed(2)}"/>`);
  }
  for (const n of layout.nodes) {
    if (!overlaps({ x0: n.x, y0: n.y, x1: n.x + n.w, y1: n.y + n.h }, s.win)) continue;
    const ind = tree.individuals[n.id];
    if (ind) parts.push(card(n, ind, opts.dates));
  }
  if (layout.rowLabels) {
    for (const [gen, label] of layout.rowLabels) {
      const row = layout.nodes.find((n) => n.gen === gen);
      if (!row) continue;
      const y = row.y + 20;
      const x = layout.bounds.minX - GUTTER + 10;
      if (!overlaps({ x0: x, y0: y - 20, x1: x + GUTTER, y1: y + 20 }, s.win)) continue;
      parts.push(
        `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="22" font-weight="600" fill="${INK_3}" letter-spacing="1">${esc(label)}</text>`,
      );
    }
  }

  const tx = -s.win.x0 * s.scale + MARGIN;
  const ty = -s.win.y0 * s.scale + MARGIN;
  const clip = `sheet${s.row}-${s.col}`;
  const footer = footerLine(opts, s);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s.width} ${s.height}" width="${s.width}" height="${s.height}"` +
    ` font-family="'Public Sans', 'Helvetica Neue', Arial, sans-serif">` +
    `<rect width="${s.width}" height="${s.height}" fill="${SURFACE}"/>` +
    `<clipPath id="${clip}"><rect x="${MARGIN}" y="${MARGIN}" width="${s.width - 2 * MARGIN}" height="${s.height - 2 * MARGIN - FOOTER}"/></clipPath>` +
    `<g clip-path="url(#${clip})"><g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.scale.toFixed(4)})">${parts.join('')}</g></g>` +
    footer +
    `</svg>`
  );
}

/** The same line on every sheet: what this is, and which piece of it you are holding. */
function footerLine(opts: PosterOptions, s: SheetSpec): string {
  const y = s.height - MARGIN + 2;
  const place = s.cols * s.rows > 1 ? `${s.row * s.cols + s.col + 1} / ${s.cols * s.rows}` : '';
  const left = opts.title ? `<text x="${MARGIN}" y="${y}" font-size="10" fill="${INK_2}">${esc(opts.title)}</text>` : '';
  const right = place ? `<text x="${s.width - MARGIN}" y="${y}" text-anchor="end" font-size="10" fill="${INK_3}">${esc(place)}</text>` : '';
  return left + right;
}

/** One person, drawn the way the canvas draws a card: a sex stripe, the name, the years. */
function card(n: LayoutNode, ind: Individual, dates: boolean): string {
  const [given, surname] = nameParts(ind);
  const life = dates ? lifeYears(ind) : '';
  const stripe = SEX[ind.sex] ?? SEX.U;
  const pad = 14;
  const textW = n.w - pad - 10;
  const name = truncate(`${given} ${surname}`.trim(), 15, textW);
  const out = [
    // The id travels with the card: it is what makes "everybody is on here somewhere" a thing a test can check.
    `<g data-id="${esc(n.id)}"><rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="7" fill="${SURFACE}" stroke="${ind.unsure ? '#b4611f' : LINE}" stroke-width="1.5"${ind.unsure ? ' stroke-dasharray="6 4"' : ''}/>`,
    `<rect x="${n.x + 1}" y="${n.y + 1}" width="5" height="${n.h - 2}" fill="${stripe}"/>`,
    `<text x="${n.x + pad}" y="${n.y + (life ? 28 : n.h / 2 + 5)}" font-size="15" font-weight="600" fill="${INK}">${esc(name)}</text>`,
  ];
  if (life) out.push(`<text x="${n.x + pad}" y="${n.y + 50}" font-size="13" fill="${INK_2}">${esc(truncate(life, 13, textW))}</text>`);
  if (n.dup > 0) {
    out.push(`<text x="${n.x + n.w - 8}" y="${n.y + 16}" text-anchor="end" font-size="11" fill="${INK_3}">×${n.dup + 1}</text>`);
  }
  out.push('</g>');
  return out.join('');
}
