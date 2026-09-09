/**
 * Whole-tree layout: every person in the file on one canvas.
 *
 * Classic genealogy charts (pedigree, descendants, hourglass) only show the
 * direct line of one person. This layout shows everyone: each connected
 * component gets generation rows, people are ordered within rows to keep
 * families together and connectors short, and x positions are relaxed so
 * parents sit over their children. Components are laid side by side.
 *
 * Method: layer assignment by breadth-first search over family links,
 * initial order by a depth-first walk of descendants, a few barycenter
 * sweeps to untangle, then priority relaxation for x with a hard minimum
 * spacing so cards never overlap.
 */

import type { Family, Tree } from '../gedcom/model';
import { DEFAULT_LAYOUT, type Layout, type LayoutLink, type LayoutNode, type LayoutOptions } from './layout';

interface Comp {
  ids: string[];
  gen: Map<string, number>;
}

function components(tree: Tree): Comp[] {
  const seen = new Set<string>();
  const out: Comp[] = [];
  for (const start of Object.keys(tree.individuals)) {
    if (seen.has(start)) continue;
    const gen = new Map<string, number>([[start, 0]]);
    const ids: string[] = [];
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const id = queue.shift()!;
      ids.push(id);
      const g = gen.get(id)!;
      const ind = tree.individuals[id]!;
      const visit = (other: string, og: number) => {
        if (!tree.individuals[other]) return;
        if (!gen.has(other)) gen.set(other, og);
        if (!seen.has(other)) {
          seen.add(other);
          queue.push(other);
        }
      };
      for (const l of ind.childOf) {
        const f = tree.families[l.familyId];
        if (f) for (const p of [f.husbandId, f.wifeId]) if (p) visit(p, g + 1);
      }
      for (const fid of ind.partnerIn) {
        const f = tree.families[fid];
        if (!f) continue;
        for (const p of [f.husbandId, f.wifeId]) if (p && p !== id) visit(p, g);
        for (const c of f.childIds) visit(c, g - 1);
      }
    }
    out.push({ ids, gen });
  }
  // Largest component first.
  return out.sort((a, b) => b.ids.length - a.ids.length);
}

interface Placed {
  id: string;
  gen: number;
  x: number;
  order: number;
}

/** A family's child connector before it gets a height: where it starts, whom it reaches, how wide it is. */
interface Bus {
  rowY: number;
  ax: number;
  ay: number;
  kids: LayoutNode[];
  minX: number;
  maxX: number;
  lane: number;
}
/** Horizontal room two buses in one lane keep between them. */
const BUS_CLEARANCE = 12;

export function layoutEverything(tree: Tree, opts: LayoutOptions = DEFAULT_LAYOUT): Layout {
  const nodes: LayoutNode[] = [];
  const links: LayoutLink[] = [];
  const buses: Bus[] = [];
  const rowH = opts.cardH + opts.rowGap;
  const compGap = opts.cardW; // horizontal space between components
  let offsetX = 0;
  const allGens = new Set<number>();

  const comps = components(tree);
  // Normalise generations so the oldest row of the largest component is the top; other components align by their oldest row.
  const compData = comps.map((c) => {
    const max = Math.max(...c.ids.map((id) => c.gen.get(id)!));
    const min = Math.min(...c.ids.map((id) => c.gen.get(id)!));
    return { ...c, max, min };
  });
  const topGen = Math.max(...compData.map((c) => c.max - c.min));

  for (const comp of compData) {
    // Shift so the oldest generation is topGen and the component's rows are 0..(max-min) from the bottom.
    const shift = topGen - comp.max;
    const gen = new Map<string, number>();
    for (const id of comp.ids) gen.set(id, comp.gen.get(id)! + shift);
    const placed = layoutComponent(tree, comp.ids, gen, opts);
    let minX = Infinity,
      maxX = -Infinity;
    for (const p of placed) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x + opts.cardW);
    }
    const dx = offsetX - minX;
    const byId = new Map<string, LayoutNode>();
    for (const p of placed) {
      const n: LayoutNode = {
        id: p.id,
        x: p.x + dx,
        y: -p.gen * rowH - opts.cardH / 2,
        w: opts.cardW,
        h: opts.cardH,
        gen: p.gen,
        dup: 0,
        role: 'descendant',
      };
      nodes.push(n);
      byId.set(p.id, n);
      allGens.add(p.gen);
    }
    // Connectors: partner ties now; child buses are collected and laid out per row once every component is placed,
    // so two families whose buses would cross in the same row get different heights instead of one merged line.
    for (const fid of new Set(comp.ids.flatMap((id) => tree.individuals[id]!.partnerIn))) {
      const f = tree.families[fid];
      if (!f) continue;
      const h = f.husbandId ? byId.get(f.husbandId) : undefined;
      const w = f.wifeId ? byId.get(f.wifeId) : undefined;
      let ax: number, ay: number;
      if (h && w) {
        const [l, r] = h.x <= w.x ? [h, w] : [w, h];
        const y = l.y + l.h / 2;
        links.push({
          kind: 'partner',
          points: [
            [l.x + l.w, y],
            [r.x, y],
          ],
        });
        ax = (l.x + l.w + r.x) / 2;
        ay = y;
        if (r.x - (l.x + l.w) > opts.partnerGap * 3) {
          ax = l.x + l.w / 2;
          ay = l.y + l.h;
        }
      } else {
        const p = h ?? w;
        if (!p) continue;
        ax = p.x + p.w / 2;
        ay = p.y + p.h;
      }
      const kids = f.childIds.map((c) => byId.get(c)).filter((n): n is LayoutNode => !!n);
      if (!kids.length) continue;
      const centers = kids.map((k) => k.x + k.w / 2);
      buses.push({ rowY: (h ?? w)!.y, ax, ay, kids, minX: Math.min(ax, ...centers), maxX: Math.max(ax, ...centers), lane: 0 });
    }
    offsetX += maxX - minX + compGap;
  }

  // Buses in one row take lanes: a bus goes to the first lane where nothing it would cross is already drawn.
  const byRow = new Map<number, Bus[]>();
  for (const b of buses) (byRow.get(b.rowY) ?? byRow.set(b.rowY, []).get(b.rowY)!).push(b);
  for (const row of byRow.values()) {
    row.sort((a, b) => a.minX - b.minX || a.maxX - b.maxX);
    const laneEnd: number[] = [];
    for (const b of row) {
      let lane = laneEnd.findIndex((end) => end + BUS_CLEARANCE < b.minX);
      if (lane < 0) lane = laneEnd.push(-Infinity) - 1;
      laneEnd[lane] = b.maxX;
      b.lane = lane;
    }
    const lanes = laneEnd.length;
    for (const b of row) {
      const busY = b.rowY + opts.cardH + (opts.rowGap * (b.lane + 1)) / (lanes + 1);
      links.push({
        kind: 'child',
        points: [
          [b.ax, b.ay],
          [b.ax, busY],
        ],
      });
      for (const k of b.kids)
        links.push({
          kind: 'child',
          points: [
            [k.x + k.w / 2, busY],
            [k.x + k.w / 2, k.y],
          ],
        });
      links.push({
        kind: 'child',
        points: [
          [b.minX, busY],
          [b.maxX, busY],
        ],
      });
    }
  }

  const rows = [...allGens].sort((a, b) => b - a);
  const bounds = nodes.reduce(
    (b, n) => ({
      minX: Math.min(b.minX, n.x),
      minY: Math.min(b.minY, n.y),
      maxX: Math.max(b.maxX, n.x + n.w),
      maxY: Math.max(b.maxY, n.y + n.h),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  const labels = new Map<number, string>();
  for (const g of rows) labels.set(g, `G${topGen - g + 1}`);
  return { focusId: '', nodes, links, rows, bounds, truncatedUp: false, truncatedDown: false, rowLabels: labels };
}

/** Order and position one connected component. Returns world x per person (y comes from gen). */
function layoutComponent(tree: Tree, ids: string[], gen: Map<string, number>, opts: LayoutOptions): Placed[] {
  const idSet = new Set(ids);
  const fam = (id: string): Family | undefined => tree.families[id];
  const partnersOf = (id: string): string[] =>
    tree.individuals[id]!.partnerIn.map(fam)
      .flatMap((f) => (f ? [f.husbandId, f.wifeId] : []))
      .filter((p): p is string => !!p && p !== id && idSet.has(p));
  const childrenOf = (id: string): string[] =>
    tree.individuals[id]!.partnerIn.map(fam)
      .flatMap((f) => f?.childIds ?? [])
      .filter((c) => idSet.has(c));
  const parentsOf = (id: string): string[] =>
    tree.individuals[id]!.childOf.map((l) => fam(l.familyId))
      .flatMap((f) => (f ? [f.husbandId, f.wifeId] : []))
      .filter((p): p is string => !!p && idSet.has(p));

  // ----- Initial order: depth-first walk of descendants from the oldest people, families kept together.
  const rows = new Map<number, string[]>();
  const placed = new Set<string>();
  const push = (id: string) => {
    if (placed.has(id)) return;
    placed.add(id);
    const g = gen.get(id)!;
    if (!rows.has(g)) rows.set(g, []);
    rows.get(g)!.push(id);
  };
  const visit = (id: string) => {
    if (placed.has(id)) return;
    push(id);
    for (const fid of tree.individuals[id]!.partnerIn) {
      const f = fam(fid);
      if (!f) continue;
      const partner = f.husbandId === id ? f.wifeId : f.husbandId;
      if (partner && idSet.has(partner) && !placed.has(partner)) {
        // Bring the partner's own parents in first so they sit near, then the partner.
        push(partner);
      }
      for (const c of f.childIds) if (idSet.has(c)) visit(c);
    }
  };
  const byOldest = [...ids].sort((a, b) => gen.get(b)! - gen.get(a)! || childrenOf(b).length - childrenOf(a).length);
  for (const id of byOldest) if (!placed.has(id)) visit(id);

  // ----- Barycenter sweeps to reduce crossings, keeping partners adjacent.
  const index = new Map<string, number>();
  const reindex = () => {
    for (const [, row] of rows) row.forEach((id, i) => index.set(id, i));
  };
  const bary = (id: string): number | undefined => {
    const neigh = [...parentsOf(id), ...childrenOf(id), ...partnersOf(id)]
      .map((n) => index.get(n))
      .filter((v): v is number => v !== undefined);
    if (!neigh.length) return undefined;
    return neigh.reduce((a, b) => a + b, 0) / neigh.length;
  };
  const keepCouplesTogether = (row: string[]) => {
    const out: string[] = [];
    const done = new Set<string>();
    for (const id of row) {
      if (done.has(id)) continue;
      out.push(id);
      done.add(id);
      for (const p of partnersOf(id))
        if (!done.has(p) && gen.get(p) === gen.get(id)) {
          out.push(p);
          done.add(p);
        }
    }
    return out;
  };
  reindex();
  const gens = [...rows.keys()].sort((a, b) => b - a);
  for (let sweep = 0; sweep < 6; sweep++) {
    const order = sweep % 2 === 0 ? gens : [...gens].reverse();
    for (const g of order) {
      const row = rows.get(g)!;
      const scored = row.map((id, i) => ({ id, b: bary(id) ?? i }));
      scored.sort((a, b) => a.b - b.b);
      rows.set(g, keepCouplesTogether(scored.map((s) => s.id)));
      reindex();
    }
  }

  // ----- X assignment: minimum spacing, then relaxation toward parents / children.
  const x = new Map<string, number>();
  const gapAfter = (row: string[], i: number): number => {
    const a = row[i]!,
      b = row[i + 1];
    if (!b) return 0;
    return partnersOf(a).includes(b) ? opts.partnerGap : opts.siblingGap;
  };
  for (const g of gens) {
    const row = rows.get(g)!;
    let cx = 0;
    row.forEach((id, i) => {
      x.set(id, cx);
      cx += opts.cardW + gapAfter(row, i);
    });
  }
  const center = (id: string) => x.get(id)! + opts.cardW / 2;
  const desired = (id: string, useParents: boolean, useChildren: boolean): number | undefined => {
    const targets: number[] = [];
    if (useChildren) {
      // Centre the couple over the children of each family.
      for (const fid of tree.individuals[id]!.partnerIn) {
        const f = fam(fid);
        if (!f) continue;
        const kids = f.childIds.filter((c) => idSet.has(c));
        if (!kids.length) continue;
        const mid = kids.reduce((s, c) => s + center(c), 0) / kids.length;
        const partner = f.husbandId === id ? f.wifeId : f.husbandId;
        if (partner && idSet.has(partner) && gen.get(partner) === gen.get(id)) {
          const isLeft = x.get(id)! <= x.get(partner)!;
          targets.push(mid + (isLeft ? -(opts.cardW + opts.partnerGap) / 2 : (opts.cardW + opts.partnerGap) / 2));
        } else targets.push(mid);
      }
    }
    if (useParents) {
      const ps = parentsOf(id);
      if (ps.length) targets.push(ps.reduce((s, p) => s + center(p), 0) / ps.length);
    }
    if (!targets.length) return undefined;
    return targets.reduce((a, b) => a + b, 0) / targets.length - opts.cardW / 2;
  };
  /**
   * Place one row. Adjacent partners form a rigid block that moves as one, so
   * couples never drift apart; blocks keep at least siblingGap between them.
   */
  const placeRow = (row: string[], want: Map<string, number>) => {
    interface Block {
      ids: string[];
      offsets: number[];
      width: number;
      want?: number;
    }
    const blocks: Block[] = [];
    let i = 0;
    while (i < row.length) {
      const ids = [row[i]!];
      let j = i;
      while (j + 1 < row.length && partnersOf(row[j]!).includes(row[j + 1]!)) {
        ids.push(row[j + 1]!);
        j++;
      }
      const offsets = ids.map((_, k) => k * (opts.cardW + opts.partnerGap));
      const wants = ids
        .map((id, k) => {
          const w = want.get(id);
          return w === undefined ? undefined : w - offsets[k]!;
        })
        .filter((v): v is number => v !== undefined);
      const current = x.get(ids[0]!)!;
      blocks.push({
        ids,
        offsets,
        width: offsets[offsets.length - 1]! + opts.cardW,
        want: wants.length ? wants.reduce((a, b) => a + b, 0) / wants.length : current,
      });
      i = j + 1;
    }
    const ltr: number[] = [];
    let minX = -Infinity;
    for (const b of blocks) {
      const v = Math.max(b.want!, minX);
      ltr.push(v);
      minX = v + b.width + opts.siblingGap;
    }
    const rtl: number[] = new Array(blocks.length);
    let maxX = Infinity;
    for (let k = blocks.length - 1; k >= 0; k--) {
      const b = blocks[k]!;
      const v = Math.min(b.want!, maxX);
      rtl[k] = v;
      maxX = v - opts.siblingGap - (k > 0 ? blocks[k - 1]!.width : 0);
    }
    let shift = 0;
    for (let k = 0; k < blocks.length; k++) shift += rtl[k]! - ltr[k]!;
    shift = blocks.length ? shift / blocks.length / 2 : 0;
    blocks.forEach((b, k) => b.ids.forEach((id, m) => x.set(id, ltr[k]! + shift + b.offsets[m]!)));
  };
  for (let iter = 0; iter < 10; iter++) {
    // Bottom-up: parents over children.
    for (const g of [...gens].reverse()) {
      const row = rows.get(g)!;
      const want = new Map<string, number>();
      for (const id of row) {
        const d = desired(id, iter > 2, true);
        if (d !== undefined) want.set(id, d);
      }
      placeRow(row, want);
    }
    // Top-down: children under parents.
    for (const g of gens) {
      const row = rows.get(g)!;
      const want = new Map<string, number>();
      for (const id of row) {
        const d = desired(id, true, iter > 2);
        if (d !== undefined) want.set(id, d);
      }
      placeRow(row, want);
    }
  }

  const out: Placed[] = [];
  for (const g of gens) rows.get(g)!.forEach((id, i) => out.push({ id, gen: g, x: x.get(id)!, order: i }));
  return out;
}
