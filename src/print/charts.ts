/**
 * Paper charts of a person's ancestry, as SVG sized to one sheet: the
 * « Éventail » (the subject at the centre, one ring per generation, running
 * half way, three quarters or all the way round) and the pedigree chart (one
 * column per generation). Pure functions of the tree, so they are tested and
 * printed alike.
 *
 * Two rules run through the whole file, both learnt from the first version:
 *
 * - **The drawing fills the sheet.** A half fan is twice as wide as it is tall,
 *   a full one is square. The radius is fitted to the sheet for the chosen
 *   sweep and the result is centred, rather than a radius fixed to half the
 *   page width, which left a portrait sheet nearly two thirds blank.
 * - **Nothing is drawn that cannot be read.** A ring is only drawn when its
 *   sectors can hold a name at the smallest size that survives printing, and a
 *   label drops its dates, then its given name, rather than overrunning its
 *   neighbour. What the sheet could not take is reported back in `generations`
 *   so the screen can say so instead of leaving the reader to count rings.
 */

import { approximateYear } from '@/gedcom/dates';
import { displayName, findEvent, type Individual, type Tree } from '@/gedcom/model';
import { ahnentafel, depthOf, generationOf, type Ahnentafel } from '@/tree/ancestry';
import { textWidth, truncate } from './text';

export type ChartKind = 'fan' | 'pedigree';
/** How far round the sheet the fan runs, in degrees. */
export type Sweep = 180 | 270 | 360;
export type PageSize = 'a4' | 'a3' | 'letter';

export interface ChartOptions {
  kind: ChartKind;
  generations: number;
  dates: boolean;
  orientation: 'portrait' | 'landscape';
  page: PageSize;
  sweep: Sweep;
  /** Draw a dashed placeholder where an ancestor is unknown, so the gaps show. */
  empties: boolean;
  title: string;
}

export const MIN_GENERATIONS = 3;
export const MAX_GENERATIONS = 8;
export const SWEEPS: Sweep[] = [180, 270, 360];

/** Paper at 96 px per inch, short edge first. One SVG pixel is 0.26 mm, so a font size in pixels is three quarters of a point. */
export const PAGES: Record<PageSize, { short: number; long: number }> = {
  a4: { short: 794, long: 1123 },
  a3: { short: 1123, long: 1587 },
  letter: { short: 816, long: 1056 },
};

export interface Chart {
  svg: string;
  width: number;
  height: number;
  /** People actually drawn, the subject included. */
  people: number;
  /** Generations actually drawn: the fewest of asked for, known, and what the sheet holds. */
  generations: number;
}

const MARGIN = 38; // 10 mm
const TITLE_H = 30;
/** Below this a printed name is a grey smudge, whatever the printer. 6 px is 4.5 pt. */
const MIN_SIZE = 6;
const SIZES = [12, 11, 10, 9, 8.5, 8, 7.5, 7, 6.5, 6];
const PAD = 3;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rad = (deg: number) => (deg * Math.PI) / 180;

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
  const page = PAGES[opts.page];
  const width = opts.orientation === 'portrait' ? page.short : page.long;
  const height = opts.orientation === 'portrait' ? page.long : page.short;
  const asked = Math.max(MIN_GENERATIONS, Math.min(MAX_GENERATIONS, Math.round(opts.generations)));
  const table = ahnentafel(tree, rootId, asked);
  const top = MARGIN + (opts.title ? TITLE_H : 0);
  const area = { x: MARGIN, y: top, w: width - 2 * MARGIN, h: height - top - MARGIN };
  // Never draw a ring nobody is in: a line that stops at the grandparents should not print three empty rings.
  const gens = Math.min(asked, depthOf(table));
  const drawn = opts.kind === 'fan' ? fan(table, gens, area, opts) : pedigree(table, gens, area, opts);
  const title = opts.title
    ? `<text x="${width / 2}" y="${MARGIN + 14}" text-anchor="middle" font-family="Georgia, 'Iowan Old Style', serif" font-size="16" fill="${INK}">${esc(opts.title)}</text>`
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="'Public Sans', 'Helvetica Neue', Arial, sans-serif"><rect width="${width}" height="${height}" fill="#ffffff"/>${title}${drawn.body}</svg>`;
  let people = 0;
  for (const sosa of table.keys()) if (generationOf(sosa) < drawn.generations) people++;
  return { svg, width, height, people, generations: drawn.generations };
}

const PATERNAL = '#e9f0ec';
const MATERNAL = '#f3ecec';
const SUBJECT = '#dcebe6';
const LINE = '#8a9088';
const INK = '#1f2328';
const INK_2 = '#4b5158';

interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Drawn {
  body: string;
  generations: number;
}

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = rad(deg);
  return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
}

/** The box a unit disc limited to `sweep` occupies, in screen coordinates (y downward), so the radius can be fitted to the sheet. */
function sweepBox(sweep: number): { x0: number; x1: number; y0: number; y1: number } {
  const a0 = 90 - sweep / 2;
  const a1 = 90 + sweep / 2;
  const xs = [0];
  const ys = [0];
  const add = (a: number) => {
    xs.push(Math.cos(rad(a)));
    ys.push(-Math.sin(rad(a)));
  };
  add(a0);
  add(a1);
  for (const a of [-270, -180, -90, 0, 90, 180, 270]) if (a > a0 && a < a1) add(a);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

/**
 * Where each ring begins and ends. `edges[g]` is the outer radius of ring `g`,
 * and `edges[0]` the subject's own disc.
 *
 * The rings are not of one width: an inner ring holds a handful of names in
 * full and an outer one holds sixty-four, so the radius tapers outward. With
 * even rings the parents' band came out as narrow as the great-great-
 * grandparents' and their names had to shrink for no reason.
 */
function radii(rMax: number, gens: number): number[] {
  if (gens <= 1) return [rMax];
  const rings = gens - 1;
  const r0 = Math.min(120, Math.max(38, (1.3 * rMax) / (rings + 1.3)));
  const weights = Array.from({ length: rings }, (_, i) => 1 + (rings === 1 ? 0 : 0.45 * (1 - i / (rings - 1))));
  const total = weights.reduce((a, b) => a + b, 0);
  const edges = [r0];
  for (const weight of weights) edges.push(edges[edges.length - 1]! + ((rMax - r0) * weight) / total);
  return edges;
}

/** How many generations of fan this radius can carry: the outermost ring must still hold one name at `MIN_SIZE`. */
function fanGenerations(rMax: number, sweep: number, wanted: number): number {
  for (let gens = wanted; gens > 1; gens--) {
    const edges = radii(rMax, gens);
    const rIn = edges[gens - 2]!;
    const rOut = edges[gens - 1]!;
    const step = sweep / 2 ** (gens - 1);
    if (rOut - rIn - 2 * PAD >= textWidth('Mmmmmm', MIN_SIZE) && rad(step) * (rIn + PAD) >= MIN_SIZE * 1.2) return gens;
  }
  return 1;
}

type Role = 'given' | 'surname' | 'life';
interface Line {
  s: string;
  role: Role;
}
/** How a whole ring is written. One decision per ring: a band where one name lies flat and the next stands on end reads as a mistake. */
interface RingPlan {
  kind: 'flat' | 'tangential' | 'radial';
  size: number;
  /** Which of `labelChoices` the ring settled for. */
  level: number;
}

/** What a person's label can say, fullest first. */
function labelChoices(ind: Individual, dates: boolean): Line[][] {
  const [given, surname] = nameLines(ind);
  const life = dates ? years(ind) : '';
  const initial = given ? `${[...given][0]}. ${surname}`.trim() : surname;
  const choices: Line[][] = [
    [
      { s: given, role: 'given' },
      { s: surname, role: 'surname' },
      { s: life, role: 'life' },
    ],
    [
      { s: given, role: 'given' },
      { s: surname, role: 'surname' },
    ],
    [{ s: initial, role: 'surname' }],
    [{ s: surname || given, role: 'surname' }],
  ];
  return choices.map((lines) => lines.filter((l) => l.s)).filter((lines) => lines.length > 0);
}

/**
 * How a ring should be written: the fullest label at the largest size that
 * every one of its people can take, and flat text wherever the sectors are
 * wide enough for it, since a name that has to be read sideways is the last
 * resort rather than the house style.
 */
function planRing(
  people: Array<{ ind: Individual; mid: number }>,
  dates: boolean,
  step: number,
  rIn: number,
  rOut: number,
): RingPlan | null {
  if (!people.length) return null;
  const choices = people.map((p) => labelChoices(p.ind, dates));
  const levels = Math.min(...choices.map((c) => c.length));
  for (let level = 0; level < levels; level++) {
    const lines = choices.map((c) => c[Math.min(level, c.length - 1)]!);
    // Three lines at six pixels is a smudge; the fewer the lines, the smaller they may go.
    const count = Math.max(...lines.map((l) => l.length));
    const floor = count >= 3 ? 7 : count === 2 ? 6.5 : MIN_SIZE;
    for (const size of SIZES) {
      if (size < floor) break;
      for (const kind of ['flat', 'tangential', 'radial'] as const) {
        if (lines.every((l, i) => fits(kind, l, size, people[i]!.mid, step, rIn, rOut))) return { kind, size, level };
      }
    }
  }
  return null;
}

const widest = (lines: Line[], size: number) => Math.max(...lines.map((l) => textWidth(l.s, size)));

function fits(kind: RingPlan['kind'], lines: Line[], size: number, mid: number, step: number, rIn: number, rOut: number): boolean {
  const block = lines.length * size * 1.2;
  const w = widest(lines, size);
  if (kind === 'flat') return flatBoxFits(w, block, mid, step, rIn, rOut);
  // Along the arc the lines stack across the ring; along the radius they sit side by side, and the inner end is the narrow point.
  if (kind === 'tangential') return block <= rOut - rIn - 2 * PAD && w <= tangentialRoom(step, rIn);
  return w <= rOut - rIn - 2 * PAD && block <= rad(step) * (rIn + PAD) * 0.9;
}

const tangentialRoom = (step: number, rIn: number) => 2 * (rIn + PAD) * Math.tan((rad(step) / 2) * 0.9);

/** An upright block of text centred in the sector: every corner of it has to stay inside the sector's own walls. */
function flatBoxFits(w: number, h: number, mid: number, step: number, rIn: number, rOut: number): boolean {
  const [cxp, cyp] = polar(0, 0, (rIn + rOut) / 2, mid);
  for (const dx of [-w / 2, w / 2]) {
    for (const dy of [-h / 2, h / 2]) {
      const x = cxp + dx;
      const y = cyp + dy;
      const r = Math.hypot(x, y);
      if (r < rIn + PAD || r > rOut - PAD) return false;
      let off = (Math.atan2(-y, x) * 180) / Math.PI - mid;
      while (off > 180) off -= 360;
      while (off < -180) off += 360;
      if (Math.abs(off) > (step / 2) * 0.95) return false;
    }
  }
  return true;
}

function fan(table: Ahnentafel, wanted: number, area: Area, opts: ChartOptions): Drawn {
  const box = sweepBox(opts.sweep);
  const unitW = box.x1 - box.x0;
  const unitH = box.y1 - box.y0;
  const rMax = Math.min(area.w / unitW, area.h / unitH);
  const cx = area.x + (area.w - rMax * unitW) / 2 - rMax * box.x0;
  const cy = area.y + (area.h - rMax * unitH) / 2 - rMax * box.y0;
  const gens = fanGenerations(rMax, opts.sweep, wanted);
  const edges = radii(rMax, gens);
  const r0 = edges[0]!;
  const parts: string[] = [];

  // The subject's own disc, at the centre of whatever sweep was chosen.
  const aStart = 90 + opts.sweep / 2;
  const aEnd = 90 - opts.sweep / 2;
  if (opts.sweep >= 360) {
    parts.push(
      `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r0.toFixed(1)}" fill="${SUBJECT}" stroke="${LINE}" stroke-width="0.8"/>`,
    );
  } else {
    const [sx, sy] = polar(cx, cy, r0, aStart);
    const [ex, ey] = polar(cx, cy, r0, aEnd);
    const large = opts.sweep > 180 ? 1 : 0;
    parts.push(
      `<path d="M ${cx.toFixed(1)} ${cy.toFixed(1)} L ${sx.toFixed(1)} ${sy.toFixed(1)} A ${r0.toFixed(1)} ${r0.toFixed(1)} 0 ${large} 1 ${ex.toFixed(1)} ${ey.toFixed(1)} Z" fill="${SUBJECT}" stroke="${LINE}" stroke-width="0.8"/>`,
    );
  }
  const root = table.get(1);
  const rootLines = root ? labelChoices(root, opts.dates)[0] : undefined;
  if (rootLines) {
    const size = Math.min(14, Math.max(8, r0 * 0.16));
    const lh = size * 1.25;
    const [tx, ty] = polar(cx, cy, opts.sweep >= 360 ? 0 : r0 * 0.38, 90);
    rootLines.forEach((l, k) =>
      parts.push(
        text(
          tx,
          ty - ((rootLines.length - 1) * lh) / 2 + k * lh + size / 3,
          truncate(l.s, sizeOf(l, size), r0 * 1.5),
          sizeOf(l, size),
          l.role === 'life' ? INK_2 : INK,
          'middle',
          l.role === 'surname' ? 600 : 400,
        ),
      ),
    );
  }

  for (let g = 1; g < gens; g++) {
    const count = 2 ** g;
    const step = opts.sweep / count;
    const rIn = edges[g - 1]!;
    const rOut = edges[g]!;
    const present: Array<{ ind: Individual; mid: number }> = [];
    for (let i = 0; i < count; i++) {
      const ind = table.get(count + i);
      if (ind) present.push({ ind, mid: aStart - (i + 0.5) * step });
    }
    const plan = planRing(present, opts.dates, step, rIn, rOut);
    for (let i = 0; i < count; i++) {
      const ind = table.get(count + i);
      if (!ind && !opts.empties) continue;
      const a0 = aStart - i * step;
      const a1 = a0 - step;
      const [x0, y0] = polar(cx, cy, rIn, a0);
      const [x1, y1] = polar(cx, cy, rOut, a0);
      const [x2, y2] = polar(cx, cy, rOut, a1);
      const [x3, y3] = polar(cx, cy, rIn, a1);
      const large = step > 180 ? 1 : 0;
      const d = `M ${x0.toFixed(1)} ${y0.toFixed(1)} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${rOut.toFixed(1)} ${rOut.toFixed(1)} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} L ${x3.toFixed(1)} ${y3.toFixed(1)} A ${rIn.toFixed(1)} ${rIn.toFixed(1)} 0 ${large} 0 ${x0.toFixed(1)} ${y0.toFixed(1)} Z`;
      const paternal = i < count / 2;
      parts.push(
        `<path d="${d}" fill="${ind ? (paternal ? PATERNAL : MATERNAL) : '#ffffff'}" stroke="${LINE}" stroke-width="0.6"${ind ? '' : ' stroke-dasharray="2 2"'}/>`,
      );
      if (!ind || !plan) continue;
      const choices = labelChoices(ind, opts.dates);
      const lines = choices[Math.min(plan.level, choices.length - 1)];
      if (lines) parts.push(sectorText(lines, plan, cx, cy, a0 - step / 2, step, rIn, rOut));
    }
  }
  return { body: parts.join(''), generations: gens };
}

/** Dates are set a size down from the name they belong to. */
const sizeOf = (l: Line, size: number) => (l.role === 'life' ? size - 1 : size);

/** One sector's lines, set the way its ring was planned and never upside down. */
function sectorText(lines: Line[], plan: RingPlan, cx: number, cy: number, mid: number, step: number, rIn: number, rOut: number): string {
  const size = plan.size;
  const lh = size * 1.2;
  const out: string[] = [];
  if (plan.kind === 'flat') {
    const [tx, ty] = polar(cx, cy, (rIn + rOut) / 2, mid);
    lines.forEach((l, k) =>
      out.push(rotated(tx, ty - ((lines.length - 1) * lh) / 2 + k * lh, 0, l, size, tangentialRoom(step, rIn), 'middle')),
    );
  } else if (plan.kind === 'tangential') {
    const maxWidth = tangentialRoom(step, rIn);
    let rot = 90 - mid;
    while (rot > 180) rot -= 360;
    while (rot < -180) rot += 360;
    // Past a quarter turn the line would read upside down: turn it the other way and stack the lines inward instead.
    const flipped = rot > 90 || rot < -90;
    if (rot > 90) rot -= 180;
    if (rot < -90) rot += 180;
    const rMid = (rIn + rOut) / 2;
    lines.forEach((l, k) => {
      const offset = (lines.length * lh) / 2 - (k + 0.5) * lh;
      const [tx, ty] = polar(cx, cy, rMid + (flipped ? -offset : offset), mid);
      out.push(rotated(tx, ty, rot, l, size, maxWidth, 'middle'));
    });
  } else {
    // Reading outward on the right of the sheet, inward on the left, so no line is ever upside down.
    const outward = Math.cos(rad(mid)) >= 0;
    const rText = outward ? rIn + PAD : rOut - PAD;
    const rot = outward ? -mid : 180 - mid;
    lines.forEach((l, k) => {
      const offset = (k - (lines.length - 1) / 2) * lh;
      const [tx, ty] = polar(cx, cy, rText, mid + ((offset / rText) * 180) / Math.PI / (outward ? -1 : 1));
      out.push(rotated(tx, ty, rot, l, size, rOut - rIn - 2 * PAD, 'start'));
    });
  }
  return out.join('');
}

function rotated(x: number, y: number, rot: number, l: Line, size: number, maxWidth: number, anchor: 'start' | 'middle'): string {
  const s = truncate(l.s, sizeOf(l, size), maxWidth);
  if (!s) return '';
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" transform="rotate(${rot.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})" text-anchor="${anchor}" dominant-baseline="middle" font-size="${sizeOf(l, size)}" font-weight="${l.role === 'surname' ? 600 : 400}" fill="${l.role === 'life' ? INK_2 : INK}">${esc(s)}</text>`;
}

function text(x: number, y: number, s: string, size: number, fill: string, anchor: 'start' | 'middle' | 'end', weight = 400): string {
  if (!s) return '';
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(s)}</text>`;
}

/** How many generations of pedigree the sheet can carry: the last column's boxes must stay tall enough to write in. */
function pedigreeGenerations(availH: number, wanted: number): number {
  const MIN_SLOT = 16;
  for (let gens = wanted; gens > 1; gens--) if (availH / 2 ** (gens - 1) >= MIN_SLOT) return gens;
  return 1;
}

function pedigree(table: Ahnentafel, wanted: number, area: Area, opts: ChartOptions): Drawn {
  const gens = pedigreeGenerations(area.h, wanted);
  const hGap = 18;
  const bw = (area.w - (gens - 1) * hGap) / gens;
  const parts: string[] = [];
  const slot = (g: number) => area.h / 2 ** g;
  const boxH = (g: number) => Math.min(54, slot(g) - 4);
  const centreY = (sosa: number) => {
    const g = generationOf(sosa);
    const i = sosa - 2 ** g;
    return area.y + (i + 0.5) * slot(g);
  };
  const x = (g: number) => area.x + g * (bw + hGap);
  for (let sosa = 1; sosa < 2 ** gens; sosa++) {
    const g = generationOf(sosa);
    const ind = table.get(sosa);
    if (!ind && !opts.empties) continue;
    const bh = boxH(g);
    const cy = centreY(sosa);
    const bx = x(g);
    // Connector to the parents' column.
    if (g < gens - 1 && ind) {
      const fy = centreY(2 * sosa);
      const my = centreY(2 * sosa + 1);
      const xr = bx + bw;
      const xm = xr + hGap / 2;
      parts.push(
        `<path d="M ${xr} ${cy} H ${xm} M ${xm} ${fy} V ${my} M ${xm} ${fy} H ${xm + hGap / 2} M ${xm} ${my} H ${xm + hGap / 2}" fill="none" stroke="${LINE}" stroke-width="0.8"/>`,
      );
    }
    parts.push(
      `<rect x="${bx}" y="${(cy - bh / 2).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="${ind ? (sosa === 1 ? SUBJECT : sosa % 2 === 0 ? PATERNAL : MATERNAL) : '#ffffff'}" stroke="${LINE}" stroke-width="0.7"${ind ? '' : ' stroke-dasharray="2 2"'}/>`,
    );
    if (!ind) continue;
    const [given, surname] = nameLines(ind);
    const life = opts.dates ? years(ind) : '';
    const size = bh >= 40 ? 10 : bh >= 28 ? 8.5 : 7;
    const lh = size + 2;
    const room: Line[] =
      bh >= 3 * lh - 2
        ? [
            { s: given, role: 'given' },
            { s: surname, role: 'surname' },
            { s: life, role: 'life' },
          ]
        : [
            { s: `${given} ${surname}`.trim(), role: 'surname' },
            { s: bh >= 2 * lh ? life : '', role: 'life' },
          ];
    const lines = room.filter((l) => l.s);
    lines.forEach((l, k) =>
      parts.push(
        text(
          bx + 6,
          cy - ((lines.length - 1) * lh) / 2 + k * lh + size / 2.8,
          truncate(l.s, sizeOf(l, size), bw - 12),
          sizeOf(l, size),
          l.role === 'life' ? INK_2 : INK,
          'start',
          l.role === 'surname' ? 600 : 400,
        ),
      ),
    );
  }
  return { body: parts.join(''), generations: gens };
}
