/**
 * Hourglass layout: ancestors of a focus person above, descendants below.
 *
 * Pure function of (tree, focusId, options) so it can run on the main thread
 * today and in a worker tomorrow without changes. Coordinates are in world
 * units; the canvas applies the camera transform.
 *
 * Ancestors use a compact pedigree: each parent pair is centred above its
 * child and subtrees never overlap. Descendants are laid out as "units": a
 * person, their partners in a row to the right, and each family's children
 * as a block underneath.
 */

import type { Individual, Tree } from '../gedcom/model';

export interface LayoutOptions {
  cardW: number;
  cardH: number;
  /** Vertical gap between generation rows. */
  rowGap: number;
  /** Horizontal gap between siblings and between unrelated subtrees. */
  siblingGap: number;
  /** Horizontal gap between a person and their partner. */
  partnerGap: number;
  maxUp: number;
  maxDown: number;
}

export const DEFAULT_LAYOUT: LayoutOptions = {
  cardW: 176, cardH: 60, rowGap: 84, siblingGap: 30, partnerGap: 16, maxUp: 6, maxDown: 6,
};

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Generation relative to focus: +1 parents, -1 children. */
  gen: number;
  /** Occurrence index when the same person appears more than once (pedigree collapse). */
  dup: number;
  /** Where this node comes from, for styling. */
  role: 'focus' | 'ancestor' | 'partner' | 'descendant';
}

export interface LayoutLink {
  kind: 'parent' | 'child' | 'partner';
  /** Polyline in world coordinates. */
  points: Array<[number, number]>;
}

export interface Layout {
  focusId: string;
  nodes: LayoutNode[];
  links: LayoutLink[];
  /** Generation numbers present, sorted descending (top row first). */
  rows: number[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** True when the ancestor side was cut by maxUp, or the descendant side by maxDown. */
  truncatedUp: boolean;
  truncatedDown: boolean;
  /** Row labels for layouts where generations are absolute rather than relative to a focus. */
  rowLabels?: Map<number, string>;
}

export function layoutHourglass(tree: Tree, focusId: string, opts: LayoutOptions = DEFAULT_LAYOUT): Layout {
  const focus = tree.individuals[focusId];
  if (!focus) throw new Error(`Unknown focus ${focusId}`);
  const nodes: LayoutNode[] = [];
  const links: LayoutLink[] = [];
  const seen = new Map<string, number>();
  const rowH = opts.cardH + opts.rowGap;
  let truncatedUp = false, truncatedDown = false;

  const place = (id: string, x: number, gen: number, role: LayoutNode['role']): LayoutNode => {
    const dup = seen.get(id) ?? 0;
    seen.set(id, dup + 1);
    const n: LayoutNode = { id, x, y: -gen * rowH - opts.cardH / 2, w: opts.cardW, h: opts.cardH, gen, dup, role };
    nodes.push(n);
    return n;
  };

  const parentsOf = (ind: Individual): { father?: string; mother?: string } => {
    const link = ind.childOf.find((l) => l.pedigree !== 'adopted' && l.pedigree !== 'foster') ?? ind.childOf[0];
    if (!link) return {};
    const fam = tree.families[link.familyId];
    if (!fam) return {};
    return { father: fam.husbandId, mother: fam.wifeId };
  };

  // ---------- Ancestors ----------
  // For every ancestor subtree we know its width and its anchor: the x offset
  // (from the subtree's left edge) of the person's card centre. A person sits
  // at the midpoint of their parents' centres, so the anchor is derived from
  // the parents' anchors, not from the subtree extent.
  interface AncInfo { w: number; a: number }
  const ancInfo = new Map<string, AncInfo>(); // keyed by `${id}@${gen}` so duplicates at different depths are fine
  const infoUp = (id: string, gen: number): AncInfo => {
    const key = `${id}@${gen}`;
    const cached = ancInfo.get(key);
    if (cached) return cached;
    let info: AncInfo = { w: opts.cardW, a: opts.cardW / 2 };
    const { father, mother } = parentsOf(tree.individuals[id]!);
    const f = father && tree.individuals[father] ? father : undefined;
    const m = mother && tree.individuals[mother] ? mother : undefined;
    if (gen < opts.maxUp) {
      const fi = f ? infoUp(f, gen + 1) : undefined;
      const mi = m ? infoUp(m, gen + 1) : undefined;
      if (fi && mi) info = { w: fi.w + opts.siblingGap + mi.w, a: (fi.a + fi.w + opts.siblingGap + mi.a) / 2 };
      else if (fi) info = { w: fi.w, a: fi.a };
      else if (mi) info = { w: mi.w, a: mi.a };
      // A card must stay inside its own extent.
      if (info.w < opts.cardW) info = { w: opts.cardW, a: opts.cardW / 2 };
      info.a = Math.min(Math.max(info.a, opts.cardW / 2), info.w - opts.cardW / 2);
    } else if (f || m) {
      truncatedUp = true;
    }
    ancInfo.set(key, info);
    return info;
  };

  /** Place the parents of `child` (already placed) inside [left, left + width]. */
  const placeParents = (child: LayoutNode, gen: number, left: number): void => {
    if (gen > opts.maxUp) return;
    const { father, mother } = parentsOf(tree.individuals[child.id]!);
    const f = father && tree.individuals[father] ? father : undefined;
    const m = mother && tree.individuals[mother] ? mother : undefined;
    if (!f && !m) return;
    const fi = f ? infoUp(f, gen) : undefined;
    const mi = m ? infoUp(m, gen) : undefined;
    let cx = left;
    const placed: LayoutNode[] = [];
    if (f && fi) {
      const n = place(f, cx + fi.a - opts.cardW / 2, gen, 'ancestor');
      placed.push(n);
      placeParents(n, gen + 1, cx);
      cx += fi.w + opts.siblingGap;
    }
    if (m && mi) {
      const n = place(m, cx + mi.a - opts.cardW / 2, gen, 'ancestor');
      placed.push(n);
      placeParents(n, gen + 1, cx);
    }
    // Connector: parents' bottoms → bus → child's top.
    const busY = child.y - opts.rowGap / 2;
    const childTopX = child.x + child.w / 2;
    for (const p of placed) links.push({ kind: 'parent', points: [[p.x + p.w / 2, p.y + p.h], [p.x + p.w / 2, busY]] });
    if (placed.length === 2) links.push({ kind: 'parent', points: [[placed[0]!.x + placed[0]!.w / 2, busY], [placed[1]!.x + placed[1]!.w / 2, busY]] });
    const anchorX = placed.length === 2 ? (placed[0]!.x + placed[1]!.x + opts.cardW) / 2 : placed[0]!.x + opts.cardW / 2;
    links.push({ kind: 'parent', points: [[anchorX, busY], [childTopX, busY], [childTopX, child.y]] });
  };

  // ---------- Descendants ----------
  interface Unit { id: string; families: Array<{ famId: string; partnerId?: string; children: Unit[] }>; rowW: number; width: number; truncated: boolean }

  const buildUnit = (id: string, depth: number): Unit => {
    const ind = tree.individuals[id]!;
    const families = ind.partnerIn
      .map((fid) => tree.families[fid])
      .filter((f): f is NonNullable<typeof f> => !!f)
      .map((f) => {
        const partnerId = f.husbandId === id ? f.wifeId : f.husbandId;
        const kids = f.childIds.filter((c) => tree.individuals[c]);
        let children: Unit[] = [];
        let truncated = false;
        if (depth < opts.maxDown) children = kids.map((c) => buildUnit(c, depth + 1));
        else if (kids.length) truncated = true;
        return { famId: f.id, partnerId: partnerId && tree.individuals[partnerId] ? partnerId : undefined, children, truncated };
      });
    const partners = families.filter((f) => f.partnerId).length;
    const rowW = opts.cardW + partners * (opts.partnerGap + opts.cardW);
    const childBlocks = families.map((f) => f.children.reduce((s, u, i) => s + u.width + (i ? opts.siblingGap : 0), 0));
    const childrenW = childBlocks.reduce((s, w, i) => s + w + (i && w && childBlocks.slice(0, i).some((x) => x) ? opts.siblingGap : 0), 0);
    const truncated = families.some((f) => f.truncated);
    if (truncated) truncatedDown = true;
    return { id, families, rowW, width: Math.max(rowW, childrenW), truncated };
  };

  const placeUnit = (u: Unit, depth: number, left: number, role: LayoutNode['role']): LayoutNode => {
    const gen = depth === 0 ? 0 : -depth;
    const rowLeft = left + (u.width - u.rowW) / 2;
    const self = place(u.id, rowLeft, gen, role);
    let px = rowLeft + opts.cardW + opts.partnerGap;
    // Children blocks, centred under the whole row.
    const blocks = u.families.map((f) => f.children.reduce((s, c, i) => s + c.width + (i ? opts.siblingGap : 0), 0));
    const totalKids = blocks.reduce((s, w) => s + w + (w ? opts.siblingGap : 0), 0) - (blocks.some((w) => w) ? opts.siblingGap : 0);
    let bx = left + (u.width - totalKids) / 2;
    let lastAnchorX = self.x + self.w / 2;
    for (let i = 0; i < u.families.length; i++) {
      const fam = u.families[i]!;
      let anchorX: number;
      let anchorY: number;
      if (fam.partnerId) {
        const p = place(fam.partnerId, px, gen, 'partner');
        links.push({ kind: 'partner', points: [[px - opts.partnerGap, self.y + self.h / 2], [px, self.y + self.h / 2]] });
        anchorX = px - opts.partnerGap / 2;
        anchorY = self.y + self.h / 2;
        px += opts.cardW + opts.partnerGap;
        lastAnchorX = p.x + p.w / 2;
      } else {
        anchorX = lastAnchorX;
        anchorY = self.y + self.h;
      }
      if (!fam.children.length) continue;
      const busY = self.y + self.h + opts.rowGap / 2;
      links.push({ kind: 'child', points: [[anchorX, anchorY], [anchorX, busY]] });
      let cx = bx;
      const childCenters: number[] = [];
      for (const c of fam.children) {
        const n = placeUnit(c, depth + 1, cx, 'descendant');
        const tx = n.x + n.w / 2;
        childCenters.push(tx);
        links.push({ kind: 'child', points: [[tx, busY], [tx, n.y]] });
        cx += c.width + opts.siblingGap;
      }
      const lo = Math.min(anchorX, ...childCenters), hi = Math.max(anchorX, ...childCenters);
      links.push({ kind: 'child', points: [[lo, busY], [hi, busY]] });
      bx = cx;
    }
    return self;
  };

  // ---------- Assemble ----------
  const root = buildUnit(focusId, 0);
  const up = infoUp(focusId, 0);
  const totalW = Math.max(root.width, up.w);
  const left = -totalW / 2;
  const focusNode = placeUnit(root, 0, left + (totalW - root.width) / 2, 'focus');
  // The ancestor block hangs from the focus card: its anchor lands on the card centre.
  placeParents(focusNode, 1, focusNode.x + opts.cardW / 2 - up.a);

  const rows = [...new Set(nodes.map((n) => n.gen))].sort((a, b) => b - a);
  const bounds = nodes.reduce(
    (b, n) => ({ minX: Math.min(b.minX, n.x), minY: Math.min(b.minY, n.y), maxX: Math.max(b.maxX, n.x + n.w), maxY: Math.max(b.maxY, n.y + n.h) }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  return { focusId, nodes, links, rows, bounds, truncatedUp, truncatedDown };
}

/** Label for a generation offset, in French or English. */
export function generationLabel(gen: number, lang: 'fr' | 'en'): string {
  const fr = lang === 'fr';
  if (gen === 0) return fr ? 'Personne centrale' : 'Focus';
  if (gen === 1) return 'Parents';
  if (gen === 2) return fr ? 'Grands-parents' : 'Grandparents';
  if (gen === -1) return fr ? 'Enfants' : 'Children';
  if (gen === -2) return fr ? 'Petits-enfants' : 'Grandchildren';
  const n = Math.abs(gen) - 2;
  const great = fr ? 'arrière-' : 'great-';
  const prefix = n <= 2 ? great.repeat(n) : `${great}(×${n}) `;
  const base = gen > 0 ? (fr ? 'grands-parents' : 'grandparents') : fr ? 'petits-enfants' : 'grandchildren';
  const label = prefix + base;
  return label.charAt(0).toUpperCase() + label.slice(1);
}
