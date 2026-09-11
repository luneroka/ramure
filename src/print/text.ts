/**
 * How wide a string will be once printed, without a DOM to ask.
 *
 * The charts decide what fits in a sector before any of it is drawn, and they
 * are pure functions tested under node, so `measureText` is not available. The
 * table below is Helvetica's advance widths in units of the font size, which
 * the app's own face (Public Sans, falling back to Helvetica or Arial) is close
 * enough to for the purpose: the answer only has to be good enough to choose a
 * font size and to cut a name that would run over its neighbour.
 *
 * It errs neither way on purpose — callers keep their own safety margin.
 */

const WIDTHS: Record<string, number> = {
  ' ': 0.278,
  '!': 0.278,
  '"': 0.355,
  '#': 0.556,
  $: 0.556,
  '%': 0.889,
  '&': 0.667,
  "'": 0.191,
  '‘': 0.191,
  '’': 0.191,
  '(': 0.333,
  ')': 0.333,
  '*': 0.389,
  '+': 0.584,
  ',': 0.278,
  '-': 0.333,
  '–': 0.556,
  '—': 1,
  '.': 0.278,
  '/': 0.278,
  ':': 0.278,
  ';': 0.278,
  '?': 0.556,
  '…': 1,
  A: 0.667,
  B: 0.667,
  C: 0.722,
  D: 0.722,
  E: 0.667,
  F: 0.611,
  G: 0.778,
  H: 0.722,
  I: 0.278,
  J: 0.5,
  K: 0.667,
  L: 0.556,
  M: 0.833,
  N: 0.722,
  O: 0.778,
  P: 0.667,
  Q: 0.778,
  R: 0.722,
  S: 0.667,
  T: 0.611,
  U: 0.722,
  V: 0.667,
  W: 0.944,
  X: 0.667,
  Y: 0.667,
  Z: 0.611,
  a: 0.556,
  b: 0.556,
  c: 0.5,
  d: 0.556,
  e: 0.556,
  f: 0.278,
  g: 0.556,
  h: 0.556,
  i: 0.222,
  j: 0.222,
  k: 0.5,
  l: 0.222,
  m: 0.833,
  n: 0.556,
  o: 0.556,
  p: 0.556,
  q: 0.556,
  r: 0.333,
  s: 0.5,
  t: 0.278,
  u: 0.556,
  v: 0.5,
  w: 0.722,
  x: 0.5,
  y: 0.5,
  z: 0.5,
};
const DIGIT = 0.556;
const OTHER = 0.55;

/** Width of `s` set at `size` pixels. Accents are measured as the letter underneath. */
export function textWidth(s: string, size: number): number {
  let em = 0;
  for (const ch of s.normalize('NFD').replace(/\p{M}/gu, '')) {
    em += WIDTHS[ch] ?? (ch >= '0' && ch <= '9' ? DIGIT : OTHER);
  }
  return em * size;
}

/** `s` if it fits in `max` pixels, otherwise as much of it as fits with an ellipsis. */
export function truncate(s: string, size: number, max: number): string {
  if (textWidth(s, size) <= max) return s;
  const chars = [...s];
  let cut = chars.length;
  while (cut > 0 && textWidth(`${chars.slice(0, cut).join('')}…`, size) > max) cut--;
  return cut > 0 ? `${chars.slice(0, cut).join('').trimEnd()}…` : '';
}
