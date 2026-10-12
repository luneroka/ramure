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
  family: string;
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
    const placed = layoutFromSeveralStarts(tree, comp.ids, gen, opts);
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
          family: fid,
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
      buses.push({ rowY: (h ?? w)!.y, ax, ay, kids, minX: Math.min(ax, ...centers), maxX: Math.max(ax, ...centers), lane: 0, family: fid });
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
        family: b.family,
        points: [
          [b.ax, b.ay],
          [b.ax, busY],
        ],
      });
      for (const k of b.kids)
        links.push({
          kind: 'child',
          family: b.family,
          points: [
            [k.x + k.w / 2, busY],
            [k.x + k.w / 2, k.y],
          ],
        });
      links.push({
        kind: 'child',
        family: b.family,
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

/** Room for extra attempts: a component gets as many as keep it near this many people laid out, four at most. */
const ATTEMPT_BUDGET = 1000;

/**
 * Lay a component out from more than one starting order and keep the one with the shortest lines.
 *
 * Where the settling ends depends on where it starts, and on a family whose lines marry into one another
 * again and again it can end in a much worse place: the same 230 people laid out 23 000 px wide from the
 * order one tree stored them in and 15 000 px from another. The starting order is only the order of people
 * the same age, so the other attempts reshuffle those ids from fixed seeds — the same tree always comes out
 * the same. A large tree gets fewer attempts, down to one, so it costs what it always did.
 */
function layoutFromSeveralStarts(tree: Tree, ids: string[], gen: Map<string, number>, opts: LayoutOptions): Placed[] {
  const attempts = Math.max(1, Math.min(4, Math.floor(ATTEMPT_BUDGET / ids.length)));
  let best = layoutComponent(tree, ids, gen, opts);
  for (let k = 1; k < attempts; k++) {
    const next = layoutComponent(tree, shuffled(ids, k), gen, opts);
    if (next.sprawl < best.sprawl) best = next;
  }
  // Each move re-settles the whole component, so a large tree tries fewer.
  return best.bringHome(Math.min(16, Math.floor((4 * ATTEMPT_BUDGET) / ids.length)));
}

/** The same ids in an order fixed by the seed. */
function shuffled(ids: string[], seed: number): string[] {
  const out = [...ids];
  let s = Math.imul(seed, 2654435761) >>> 0;
  for (let i = out.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = Math.floor((s / 2 ** 32) * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

interface Settled {
  /** How far the arrangement's lines run sideways. */
  sprawl: number;
  /** Move up to `tries` stranded branches home, keeping each move that shortens the lines; the final positions. */
  bringHome: (tries: number) => Placed[];
}

/** Order and position one connected component; world x per person comes from `bringHome` (y comes from gen). */
function layoutComponent(tree: Tree, ids: string[], gen: Map<string, number>, opts: LayoutOptions): Settled {
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
  /**
   * Partners side by side, and everyone married to the same person in one run with that person in the middle:
   * first wife, husband, second wife. A second wife sorted elsewhere in the row would be placed on her own, and
   * one the file gives no parents and no children has nothing to place her by but where she last stood.
   */
  const keepCouplesTogether = (row: string[]) => {
    const out: string[] = [];
    const done = new Set<string>();
    const rank = new Map(row.map((id, i) => [id, i]));
    for (const id of row) {
      if (done.has(id)) continue;
      const run = [id];
      done.add(id);
      for (let k = 0; k < run.length; k++)
        for (const p of partnersOf(run[k]!))
          if (!done.has(p) && gen.get(p) === gen.get(id)) {
            run.push(p);
            done.add(p);
          }
      if (run.length < 3) {
        out.push(...run);
        continue;
      }
      const ties = (a: string) => partnersOf(a).filter((p) => run.includes(p)).length;
      const hub = run.reduce((a, b) => (ties(b) > ties(a) ? b : a));
      const others = run.filter((p) => p !== hub).sort((a, b) => rank.get(a)! - rank.get(b)!);
      const half = Math.floor(others.length / 2);
      out.push(...others.slice(0, half), hub, ...others.slice(half));
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
   * A run of one person's partners is one block too, so a partner with nothing
   * else to go by is carried along rather than left where they last stood.
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
      while (j + 1 < row.length && ids.some((m) => partnersOf(m).includes(row[j + 1]!))) {
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
  const relax = () => {
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
  };
  /** How far every line runs sideways: partner to partner, and each child from their parents' midpoint. */
  const families = [...new Set(ids.flatMap((id) => tree.individuals[id]!.partnerIn))];
  const sprawl = (): number => {
    let total = 0;
    for (const fid of families) {
      const f = fam(fid);
      const ps = [f?.husbandId, f?.wifeId].filter((p): p is string => !!p && idSet.has(p));
      if (!f || !ps.length) continue;
      if (ps.length === 2) total += Math.abs(x.get(ps[0]!)! - x.get(ps[1]!)!);
      const mid = ps.reduce((s, p) => s + center(p), 0) / ps.length;
      for (const c of f.childIds) if (idSet.has(c)) total += Math.abs(center(c) - mid);
    }
    return total;
  };
  const keep = () => ({ sprawl: sprawl(), x: new Map(x), rows: new Map([...rows].map(([g, row]) => [g, [...row]])) });
  relax();
  // The first order was decided before anyone had a position, so a couple whose only tie is a child placed
  // far away (a spouse's parents, typically) ended up at the row's end and stayed there, its bus crossing the
  // whole row. Reorder each row by where the relatives actually are, settle again, and repeat.
  // Nothing makes a pass converge: on a large tree with many marriages between lines, each one can push the
  // rows wider than the last, and eight of them tore one 230-person tree across 75 000 px. So the passes only
  // propose, and the arrangement with the shortest lines is the one kept.
  let best = keep();
  for (let pass = 0; pass < 8; pass++) {
    for (const g of gens) {
      const row = rows.get(g)!;
      const scored = row.map((id) => {
        const xs = [...parentsOf(id), ...childrenOf(id), ...partnersOf(id)].map(center);
        return { id, b: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : center(id) };
      });
      scored.sort((a, b) => a.b - b.b);
      rows.set(g, keepCouplesTogether(scored.map((s) => s.id)));
    }
    reindex();
    relax();
    if (sprawl() < best.sprawl) best = keep();
  }
  const restore = (kept: ReturnType<typeof keep>) => {
    for (const [id, v] of kept.x) x.set(id, v);
    for (const [g, row] of kept.rows) rows.set(g, [...row]);
    reindex();
  };
  restore(best);

  // Every pass sorts a person by where their relatives are, and some relatives only ever follow: a wife the file
  // gives no parents, a daughter with no family of her own. A son's branch that the first order put on the wrong
  // side of the row votes, through them, for staying there, and ends up thousands of pixels from his parents,
  // drawn among a line he does not belong to. So the people furthest from their parents are carried home with
  // their descendants and the partners who have nobody else, the rows settle again, and the move is kept only if
  // the lines come out shorter.
  const bringHome = (tries: number): Placed[] => {
    const mid = (ps: string[]) => ps.reduce((s, p) => s + center(p), 0) / ps.length;
    const away = (id: string) => mid(parentsOf(id)) - center(id);
    const tooFar = 2 * (opts.cardW + opts.siblingGap);
    const stranded = ids
      .filter((id) => parentsOf(id).length && Math.abs(away(id)) > tooFar)
      .sort((a, b) => Math.abs(away(b)) - Math.abs(away(a)))
      .slice(0, tries);
    for (const who of stranded) {
      const delta = away(who);
      if (Math.abs(delta) <= tooFar) continue;
      const branch = new Set<string>();
      const carry = (id: string) => {
        if (branch.has(id)) return;
        branch.add(id);
        for (const p of partnersOf(id)) if (!parentsOf(p).length) branch.add(p);
        for (const c of childrenOf(id)) carry(c);
      };
      carry(who);
      for (const id of branch) x.set(id, x.get(id)! + delta);
      for (const g of gens) rows.set(g, keepCouplesTogether([...rows.get(g)!].sort((a, b) => x.get(a)! - x.get(b)!)));
      reindex();
      relax();
      if (sprawl() < best.sprawl) best = keep();
      else restore(best);
    }
    const out: Placed[] = [];
    for (const g of gens) rows.get(g)!.forEach((id, i) => out.push({ id, gen: g, x: x.get(id)!, order: i }));
    return out;
  };
  return { sprawl: best.sprawl, bringHome };
}
