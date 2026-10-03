/**
 * The person sheet as a PDF file, made in the browser and downloaded directly: no print dialog, and
 * nothing about the family leaves the device to make it.
 *
 * It paints from the laid-out pages, not from the sheet's data, so the file cannot differ from the
 * preview: every box's background and borders, every line of text where the browser put it, the
 * portrait, the links. The pages are first copied at the paper's real size, where they were measured
 * and packed, and drawn from there.
 *
 * That only holds because the screen and the PDF use the same font files — the static faces in
 * public/fonts/sheet, with kerning and ligatures off on the sheet — so a line the browser breaks at
 * one width is drawn at that width. Each line is placed where the browser placed it; the PDF never
 * wraps text of its own.
 */

import type { jsPDF as JsPdf } from 'jspdf';

/** One of the static faces the sheet is set in, in public/fonts/sheet. */
export interface SheetFace {
  family: 'sans' | 'serif' | 'mono';
  weight: number;
  italic: boolean;
  file: string;
}

export const SHEET_FACES: SheetFace[] = [
  { family: 'sans', weight: 400, italic: false, file: 'PublicSans-Regular.ttf' },
  { family: 'sans', weight: 400, italic: true, file: 'PublicSans-Italic.ttf' },
  { family: 'sans', weight: 500, italic: false, file: 'PublicSans-Medium.ttf' },
  { family: 'sans', weight: 600, italic: false, file: 'PublicSans-SemiBold.ttf' },
  { family: 'serif', weight: 400, italic: false, file: 'Newsreader-Regular.ttf' },
  { family: 'serif', weight: 400, italic: true, file: 'Newsreader-Italic.ttf' },
  { family: 'serif', weight: 500, italic: false, file: 'Newsreader-Medium.ttf' },
  { family: 'mono', weight: 500, italic: false, file: 'IBMPlexMono-Medium.ttf' },
];

/** Points in a millimetre. */
const PT_PER_MM = 72 / 25.4;

const faceId = (f: SheetFace) => `${f.family}-${f.weight}${f.italic ? '-italic' : ''}`;

/** The face that draws text the browser set in `fontFamily` at this weight and style: the sheet's own family, the nearest weight it ships. */
export function faceFor(fontFamily: string, weight: number, italic: boolean): SheetFace {
  const family = /Sheet Serif/.test(fontFamily) ? 'serif' : /Sheet Mono/.test(fontFamily) ? 'mono' : 'sans';
  const own = SHEET_FACES.filter((f) => f.family === family);
  const styled = own.filter((f) => f.italic === italic);
  const pool = styled.length ? styled : own;
  return pool.reduce((best, f) => (Math.abs(f.weight - weight) < Math.abs(best.weight - weight) ? f : best));
}

/** `rgb(31, 35, 40)` or `rgba(…)` as channels, or null when there is nothing to paint. */
export function parseColor(css: string): [number, number, number] | null {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/.exec(css);
  if (!m) return null;
  const alpha = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  if (alpha === 0) return null;
  return [Math.round(Number(m[1])), Math.round(Number(m[2])), Math.round(Number(m[3]))];
}

/** A character where the browser drew it. */
export interface CharBox {
  ch: string;
  left: number;
  top: number;
  bottom: number;
}

export interface TextLine {
  text: string;
  left: number;
  top: number;
  bottom: number;
}

/**
 * Characters back into the lines the browser broke them into. A new line starts when a character
 * sits lower than half the current line's height. Spaces at the start of a line are dropped and the
 * line starts at its first visible character; spaces at its end are dropped too.
 */
export function intoLines(chars: CharBox[]): TextLine[] {
  const lines: Array<{ chars: CharBox[] }> = [];
  for (const c of chars) {
    const line = lines[lines.length - 1];
    const ref = line?.chars[0];
    if (!line || !ref || c.top - ref.top > (ref.bottom - ref.top) / 2) lines.push({ chars: [c] });
    else line.chars.push(c);
  }
  return lines.flatMap(({ chars: cs }) => {
    const start = cs.findIndex((c) => c.ch.trim() !== '');
    if (start < 0) return [];
    const visible = cs.slice(start);
    const first = visible[0]!;
    return [
      {
        text: visible
          .map((c) => c.ch)
          .join('')
          .trimEnd(),
        left: first.left,
        top: first.top,
        bottom: first.bottom,
      },
    ];
  });
}

/** The font files, fetched once and kept as the base64 jsPDF wants. */
const fontData = new Map<string, Promise<string>>();

function loadFace(face: SheetFace): Promise<string> {
  let p = fontData.get(face.file);
  if (!p) {
    p = fetch(`/fonts/sheet/${face.file}`)
      .then((r) => {
        if (!r.ok) throw new Error(`font ${face.file}: ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buf) => {
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(bin);
      });
    p.catch(() => fontData.delete(face.file));
    fontData.set(face.file, p);
  }
  return p;
}

/**
 * The PDF of the sheet's pages, one page of `paper` each. `pages` are the page boxes on screen;
 * they are copied at the paper's real size before anything is measured.
 */
export async function sheetPdf(
  pages: HTMLElement[],
  paper: { w: number; h: number },
  meta: { title: string; lang: 'fr' | 'en' },
): Promise<Blob> {
  const [{ jsPDF }, fonts] = await Promise.all([import('jspdf'), Promise.all(SHEET_FACES.map(loadFace))]);
  const width = paper.w * PT_PER_MM;
  const height = paper.h * PT_PER_MM;
  const doc = new jsPDF({ unit: 'pt', format: [width, height], orientation: 'portrait', compress: true, putOnlyUsedFonts: true });
  SHEET_FACES.forEach((face, i) => {
    doc.addFileToVFS(face.file, fonts[i]!);
    doc.addFont(face.file, faceId(face), 'normal');
  });

  const host = document.createElement('div');
  host.className = 'ps-export';
  host.style.width = `${paper.w}mm`;
  document.body.appendChild(host);
  try {
    const copies = pages.map((p) => host.appendChild(p.cloneNode(true) as HTMLElement));
    await document.fonts?.ready;
    for (let i = 0; i < copies.length; i++) {
      if (i > 0) doc.addPage([width, height], 'portrait');
      const page = copies[i]!;
      await paintPage(doc, page, width / page.getBoundingClientRect().width, meta.lang);
    }
  } finally {
    host.remove();
  }
  doc.setProperties({ title: meta.title, creator: 'Ramure' });
  doc.setLanguage(meta.lang);
  return doc.output('blob');
}

interface Painter {
  doc: JsPdf;
  /** Points per CSS pixel. */
  k: number;
  left: number;
  top: number;
  lang: string;
  /** Where the baseline sits in a text box, as a share of its height, per face: measured once. */
  baselines: Map<string, number>;
}

async function paintPage(doc: JsPdf, page: HTMLElement, k: number, lang: string): Promise<void> {
  const origin = page.getBoundingClientRect();
  const p: Painter = { doc, k, left: origin.left, top: origin.top, lang, baselines: new Map() };
  await paintElement(p, page);
}

const X = (p: Painter, x: number) => (x - p.left) * p.k;
const Y = (p: Painter, y: number) => (y - p.top) * p.k;

async function paintElement(p: Painter, el: Element): Promise<void> {
  const style = getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return;
  paintBox(p, el, style);
  if (el instanceof HTMLImageElement) await paintImage(p, el);
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) paintText(p, child as Text, style);
    else if (child instanceof Element) await paintElement(p, child);
  }
  if (el instanceof HTMLAnchorElement && el.href) {
    for (const r of Array.from(el.getClientRects())) p.doc.link(X(p, r.left), Y(p, r.top), r.width * p.k, r.height * p.k, { url: el.href });
  }
}

type Side = 'Top' | 'Right' | 'Bottom' | 'Left';
const SIDES: Side[] = ['Top', 'Right', 'Bottom', 'Left'];

/** A box's background and borders, as CSS draws them: borders inside the box, dashed where CSS says so. */
function paintBox(p: Painter, el: Element, style: CSSStyleDeclaration): void {
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const { doc, k } = p;
  const x = X(p, r.left);
  const y = Y(p, r.top);
  const w = r.width * k;
  const h = r.height * k;
  const radius = style.borderTopLeftRadius;
  const round = radius.endsWith('%') ? parseFloat(radius) >= 50 : false;
  const rx = round ? w / 2 : (parseFloat(radius) || 0) * k;
  const ry = round ? h / 2 : rx;

  const fill = parseColor(style.backgroundColor);
  // The sheet is white paper: a white fill would be drawn over nothing.
  if (fill && !(fill[0] === 255 && fill[1] === 255 && fill[2] === 255)) {
    doc.setFillColor(...fill);
    if (round) doc.ellipse(x + w / 2, y + h / 2, rx, ry, 'F');
    else if (rx > 0) doc.roundedRect(x, y, w, h, rx, ry, 'F');
    else doc.rect(x, y, w, h, 'F');
  }

  const sides = SIDES.map((s) => ({
    side: s,
    width:
      style.getPropertyValue(`border-${s.toLowerCase()}-style`) === 'none'
        ? 0
        : parseFloat(style.getPropertyValue(`border-${s.toLowerCase()}-width`)) || 0,
    dashed: style.getPropertyValue(`border-${s.toLowerCase()}-style`) === 'dashed',
    color: parseColor(style.getPropertyValue(`border-${s.toLowerCase()}-color`)),
  }));
  const drawn = sides.filter((s) => s.width > 0 && s.color);
  if (!drawn.length) return;
  const same =
    drawn.length === 4 &&
    drawn.every((s) => s.width === drawn[0]!.width && s.dashed === drawn[0]!.dashed && String(s.color) === String(drawn[0]!.color));
  if (same && (rx > 0 || drawn[0]!.dashed)) {
    // A rounded or dashed outline: stroked along the middle of the border, so it stays inside the box.
    const s = drawn[0]!;
    const lw = s.width * k;
    doc.setDrawColor(...s.color!);
    doc.setLineWidth(lw);
    doc.setLineDashPattern(s.dashed ? [lw * 3, lw * 2] : [], 0);
    if (round) doc.ellipse(x + w / 2, y + h / 2, rx - lw / 2, ry - lw / 2, 'S');
    else doc.roundedRect(x + lw / 2, y + lw / 2, w - lw, h - lw, Math.max(0, rx - lw / 2), Math.max(0, ry - lw / 2), 'S');
    doc.setLineDashPattern([], 0);
    return;
  }
  for (const s of drawn) {
    const t = s.width * k;
    doc.setFillColor(...s.color!);
    if (s.dashed) {
      doc.setDrawColor(...s.color!);
      doc.setLineWidth(t);
      doc.setLineDashPattern([t * 3, t * 2], 0);
      if (s.side === 'Top') doc.line(x, y + t / 2, x + w, y + t / 2);
      if (s.side === 'Bottom') doc.line(x, y + h - t / 2, x + w, y + h - t / 2);
      if (s.side === 'Left') doc.line(x + t / 2, y, x + t / 2, y + h);
      if (s.side === 'Right') doc.line(x + w - t / 2, y, x + w - t / 2, y + h);
      doc.setLineDashPattern([], 0);
    } else {
      if (s.side === 'Top') doc.rect(x, y, w, t, 'F');
      if (s.side === 'Bottom') doc.rect(x, y + h - t, w, t, 'F');
      if (s.side === 'Left') doc.rect(x, y, t, h, 'F');
      if (s.side === 'Right') doc.rect(x + w - t, y, t, h, 'F');
    }
  }
}

/** Where the baseline sits in the box the browser gives this face's text, as a share of the box's height. */
function baselineShare(p: Painter, style: CSSStyleDeclaration): number {
  const key = `${style.fontFamily}|${style.fontWeight}|${style.fontStyle}`;
  const known = p.baselines.get(key);
  if (known !== undefined) return known;
  // Measured on a probe outside the page, so the page's own layout is never disturbed while it is read.
  const probe = document.createElement('span');
  probe.style.cssText = `position:fixed;left:-10000px;top:0;white-space:nowrap;font-family:${style.fontFamily};font-weight:${style.fontWeight};font-style:${style.fontStyle};font-size:100px;line-height:normal`;
  probe.textContent = 'H';
  const mark = document.createElement('span');
  mark.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
  probe.appendChild(mark);
  document.body.appendChild(probe);
  const range = document.createRange();
  range.setStart(probe.firstChild!, 0);
  range.setEnd(probe.firstChild!, 1);
  const box = range.getBoundingClientRect();
  const share = box.height ? (mark.getBoundingClientRect().top - box.top) / box.height : 0.8;
  probe.remove();
  p.baselines.set(key, share);
  return share;
}

function paintText(p: Painter, node: Text, style: CSSStyleDeclaration): void {
  const data = node.data;
  if (!data.trim()) return;
  const color = parseColor(style.color);
  if (!color) return;
  const range = document.createRange();
  const chars: CharBox[] = [];
  let i = 0;
  for (const ch of data) {
    range.setStart(node, i);
    range.setEnd(node, i + ch.length);
    i += ch.length;
    const r = range.getClientRects()[0];
    // A collapsed space, a line feed in pre-line text: nothing was drawn for it.
    if (!r || (r.width === 0 && ch.trim() === '')) continue;
    chars.push({ ch: /[\t\n\r]/.test(ch) ? ' ' : ch, left: r.left, top: r.top, bottom: r.bottom });
  }
  const face = faceFor(style.fontFamily, Number(style.fontWeight) || 400, style.fontStyle === 'italic');
  const share = baselineShare(p, style);
  const spacing = style.letterSpacing === 'normal' ? 0 : parseFloat(style.letterSpacing) || 0;
  const upper = style.textTransform === 'uppercase';
  const { doc, k } = p;
  doc.setFont(faceId(face), 'normal');
  doc.setFontSize(parseFloat(style.fontSize) * k);
  doc.setTextColor(...color);
  for (const line of intoLines(chars)) {
    const text = upper ? line.text.toLocaleUpperCase(p.lang) : line.text;
    const baseline = line.top + (line.bottom - line.top) * share;
    doc.text(text, X(p, line.left), Y(p, baseline), { baseline: 'alphabetic', charSpace: spacing * k });
  }
}

/** A portrait: the picture as the browser fitted it inside its frame's border, clipped to the oval. */
async function paintImage(p: Painter, img: HTMLImageElement): Promise<void> {
  const r = img.getBoundingClientRect();
  if (!r.width || !r.height || !img.naturalWidth) return;
  // Drawn through a canvas at three times the page's resolution: any format the browser shows becomes a JPEG the PDF takes.
  const scale = 3;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(r.width * scale);
  canvas.height = Math.round(r.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const cover = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
  const dw = img.naturalWidth * cover;
  const dh = img.naturalHeight * cover;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // The same framing as the stylesheet's `object-position: 50% 30%`.
  ctx.drawImage(img, (canvas.width - dw) * 0.5, (canvas.height - dh) * 0.3, dw, dh);
  const data = canvas.toDataURL('image/jpeg', 0.9);
  const { doc, k } = p;
  const x = X(p, r.left);
  const y = Y(p, r.top);
  const w = r.width * k;
  const h = r.height * k;
  doc.saveGraphicsState();
  doc.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, null);
  doc.clip();
  doc.discardPath();
  doc.addImage(data, 'JPEG', x, y, w, h);
  doc.restoreGraphicsState();
}
