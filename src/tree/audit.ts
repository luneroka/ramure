/**
 * Live checks on a tree: recomputed from the current state, so the report
 * clears itself as problems get fixed. Import-time repairs stay in
 * tree.importNotes; these are the things worth a look at any time.
 *
 * Levels: 'warning' for something that cannot be true, 'info' for something
 * unusual enough to deserve a glance.
 */

import { approximateYear, type GDate } from '../gedcom/dates';
import { displayName, findEvent, type ImportNote, type Individual, type Tree } from '../gedcom/model';

/** A check note: an ImportNote plus which person to open when fixing. */
export interface CheckNote extends ImportNote {
  fixId?: string;
}

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Day number for a full Gregorian date, or undefined. */
function dayOf(d: GDate | undefined): number | undefined {
  const x = d?.date;
  if (!d || d.kind !== 'exact' || !x || x.calendar !== 'gregorian' || !x.year || !x.month || !x.day) return undefined;
  return Math.round(Date.UTC(x.year, x.month - 1, x.day) / 86400000);
}

function year(ind: Individual | undefined, type: 'birth' | 'death' | 'baptism' | 'burial'): number | undefined {
  return ind ? approximateYear(findEvent(ind.events, type)?.date) : undefined;
}

export function auditTree(tree: Tree): CheckNote[] {
  const notes: CheckNote[] = [];
  const people = Object.values(tree.individuals);
  if (people.length === 0) return notes;
  const name = (i: Individual) => displayName(i);

  // ---------- Each person on their own ----------
  for (const i of people) {
    const birthY = year(i, 'birth');
    const deathY = year(i, 'death');
    const b = birthY ?? year(i, 'baptism');
    const d = deathY ?? year(i, 'burial');
    const bap = year(i, 'baptism');
    const bur = year(i, 'burial');
    const bd = dayOf(findEvent(i.events, 'birth')?.date);
    const dd = dayOf(findEvent(i.events, 'death')?.date);

    if (b !== undefined && d !== undefined && (dd !== undefined && bd !== undefined ? dd < bd : d < b)) {
      notes.push({
        level: 'warning',
        code: 'death-before-birth',
        message: `${name(i)} serait décédé·e avant sa naissance.`,
        ids: [i.id],
        fixId: i.id,
      });
    }
    if (birthY !== undefined && bap !== undefined && bap < birthY) {
      notes.push({
        level: 'warning',
        code: 'baptism-before-birth',
        message: `${name(i)} aurait été baptisé·e avant sa naissance.`,
        ids: [i.id],
        fixId: i.id,
      });
    }
    if (deathY !== undefined && bur !== undefined && bur < deathY) {
      notes.push({
        level: 'warning',
        code: 'burial-before-death',
        message: `${name(i)} aurait été inhumé·e avant son décès.`,
        ids: [i.id],
        fixId: i.id,
      });
    }
    if (b !== undefined && d !== undefined && d - b > 115) {
      notes.push({ level: 'warning', code: 'lifespan', message: `${name(i)} aurait vécu ${d - b} ans.`, ids: [i.id], fixId: i.id });
    }
    if (i.events.every((e) => !e.date)) {
      notes.push({ level: 'info', code: 'no-dates', message: `${name(i)} n'a aucune date.`, ids: [i.id], fixId: i.id });
    }
    for (const e of i.events) {
      if (['birth', 'baptism', 'death', 'burial', 'cremation'].includes(e.type)) continue;
      const y = approximateYear(e.date);
      if (y === undefined) continue;
      if ((b !== undefined && y < b) || (d !== undefined && y > d + 1)) {
        const label = e.type === 'custom' ? (e.customType ?? 'événement') : e.type;
        notes.push({
          level: 'warning',
          code: 'event-outside-life',
          message: `${name(i)} : un événement (${label}) daté de ${y} tombe hors de sa vie.`,
          ids: [i.id],
          fixId: i.id,
        });
        break;
      }
    }
    if (i.childOf.length === 0 && i.partnerIn.length === 0 && people.length > 1) {
      notes.push({ level: 'info', code: 'unlinked', message: `${name(i)} n'est rattaché·e à aucune famille.`, ids: [i.id], fixId: i.id });
    }
    if (i.childOf.filter((l) => l.pedigree === 'birth').length > 1) {
      notes.push({
        level: 'warning',
        code: 'two-birth-families',
        message: `${name(i)} est enfant de naissance dans deux familles.`,
        ids: [i.id],
        fixId: i.id,
      });
    }
  }

  // ---------- Possible duplicates: same name, births within two years (accents ignored) ----------
  const byName = new Map<string, Individual[]>();
  for (const i of people) {
    const key = fold(name(i));
    if (key === '?' || !key) continue;
    byName.set(key, [...(byName.get(key) ?? []), i]);
  }
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    for (let a = 0; a < group.length; a++) {
      for (let c = a + 1; c < group.length; c++) {
        const ya = year(group[a], 'birth'),
          yc = year(group[c], 'birth');
        const close = ya === undefined || yc === undefined ? ya === yc : Math.abs(ya - yc) <= 2;
        if (!close) continue;
        notes.push({
          level: 'warning',
          code: 'possible-duplicate',
          message: `${name(group[a]!)} apparaît deux fois avec des naissances proches : doublon possible.`,
          ids: [group[a]!.id, group[c]!.id],
          fixId: group[a]!.id,
        });
      }
    }
  }

  // ---------- Families ----------
  for (const fam of Object.values(tree.families)) {
    const h = fam.husbandId ? tree.individuals[fam.husbandId] : undefined;
    const w = fam.wifeId ? tree.individuals[fam.wifeId] : undefined;
    const hy = year(h, 'birth'),
      wy = year(w, 'birth');
    if (h && w && hy !== undefined && wy !== undefined && Math.abs(hy - wy) > 40) {
      notes.push({
        level: 'info',
        code: 'spouse-gap',
        message: `${name(h)} et ${name(w)} ont ${Math.abs(hy - wy)} ans d'écart.`,
        ids: [h.id, w.id],
        fixId: h.id,
      });
    }
    const my = approximateYear(findEvent(fam.events, 'marriage')?.date);
    if (my !== undefined) {
      for (const p of [h, w]) {
        if (!p) continue;
        const py = year(p, 'birth');
        const dy = year(p, 'death');
        if (py !== undefined && my - py < 14) {
          notes.push({
            level: 'warning',
            code: 'married-too-young',
            message: `${name(p)} aurait ${my - py} ans à son mariage.`,
            ids: [p.id],
            fixId: p.id,
          });
        }
        if (dy !== undefined && my > dy) {
          notes.push({
            level: 'warning',
            code: 'married-after-death',
            message: `${name(p)} se serait marié·e après son décès.`,
            ids: [p.id],
            fixId: p.id,
          });
        }
      }
    }
    const seen = new Set<string>();
    for (const cid of fam.childIds) {
      if (seen.has(cid)) {
        const c = tree.individuals[cid];
        if (c)
          notes.push({
            level: 'warning',
            code: 'duplicate-child',
            message: `${name(c)} est listé·e deux fois comme enfant de la même famille.`,
            ids: [cid],
            fixId: cid,
          });
      }
      seen.add(cid);
    }
    const kids = fam.childIds.map((cid) => tree.individuals[cid]).filter((c): c is Individual => !!c);
    for (const child of kids) {
      const cy = year(child, 'birth');
      if (cy === undefined) continue;
      for (const p of [h, w]) {
        if (!p) continue;
        const py = year(p, 'birth');
        const dy = year(p, 'death');
        // Mothers past 50 and fathers past 75 are worth a second look; so is any parent under 13.
        const tooOld = p === w ? 50 : 75;
        if (py !== undefined && (cy - py < 13 || cy - py > tooOld)) {
          notes.push({
            level: 'warning',
            code: 'parent-age',
            message: `${name(p)} aurait ${cy - py} ans à la naissance de ${name(child)}.`,
            ids: [p.id, child.id],
            fixId: p.id,
          });
        }
        if (dy !== undefined && cy > dy + 1) {
          notes.push({
            level: 'warning',
            code: 'born-after-death',
            message: `${name(child)} est né·e après le décès de ${name(p)}.`,
            ids: [child.id, p.id],
            fixId: child.id,
          });
        }
      }
    }
    const dated = kids
      .map((c) => ({ c, day: dayOf(findEvent(c.events, 'birth')?.date) }))
      .filter((x): x is { c: Individual; day: number } => x.day !== undefined)
      .sort((a, b) => a.day - b.day);
    for (let k = 1; k < dated.length; k++) {
      const gap = dated[k]!.day - dated[k - 1]!.day;
      if (gap > 0 && gap < 270) {
        notes.push({
          level: 'warning',
          code: 'siblings-too-close',
          message: `${name(dated[k - 1]!.c)} et ${name(dated[k]!.c)} seraient nés à ${gap} jours d'écart.`,
          ids: [dated[k - 1]!.c.id, dated[k]!.c.id],
          fixId: dated[k]!.c.id,
        });
      }
    }
  }
  return notes;
}

/** A stable key for a note, used to remember dismissals. */
export function noteKey(n: ImportNote): string {
  return `${n.code}:${(n.ids ?? []).join(',')}`;
}
