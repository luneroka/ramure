/**
 * Live checks on a tree: recomputed from the current state, so the report
 * clears itself as problems get fixed. Import-time repairs stay in
 * tree.importNotes; these are the things worth a look at any time.
 */

import { approximateYear } from '../gedcom/dates';
import { displayName, findEvent, type ImportNote, type Tree } from '../gedcom/model';

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function auditTree(tree: Tree): ImportNote[] {
  const notes: ImportNote[] = [];
  const people = Object.values(tree.individuals);
  if (people.length < 2) return notes;

  // People attached to no family at all.
  const unlinked = people.filter((i) => i.childOf.length === 0 && i.partnerIn.length === 0);
  for (const i of unlinked) {
    notes.push({ level: 'info', code: 'unlinked', message: `${displayName(i)} n'est rattaché·e à aucune famille.`, ids: [i.id] });
  }

  // Same name, births within two years (or both unknown): probably the same person twice.
  const byName = new Map<string, typeof people>();
  for (const i of people) {
    const key = fold(displayName(i));
    if (key === '?' || !key) continue;
    byName.set(key, [...(byName.get(key) ?? []), i]);
  }
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    for (let a = 0; a < group.length; a++) {
      for (let b = a + 1; b < group.length; b++) {
        const ya = approximateYear(findEvent(group[a]!.events, 'birth')?.date);
        const yb = approximateYear(findEvent(group[b]!.events, 'birth')?.date);
        const close = ya === undefined || yb === undefined ? ya === yb : Math.abs(ya - yb) <= 2;
        if (!close) continue;
        notes.push({
          level: 'warning',
          code: 'possible-duplicate',
          message: `${displayName(group[a]!)} apparaît deux fois avec des naissances proches : doublon possible.`,
          ids: [group[a]!.id, group[b]!.id],
        });
      }
    }
  }

  // Parents with an implausible age at a child's birth, or a child born after a parent's death.
  for (const fam of Object.values(tree.families)) {
    for (const cid of fam.childIds) {
      const child = tree.individuals[cid];
      const cy = approximateYear(findEvent(child?.events ?? [], 'birth')?.date);
      if (!child || cy === undefined) continue;
      for (const pid of [fam.husbandId, fam.wifeId]) {
        const parent = pid ? tree.individuals[pid] : undefined;
        if (!parent) continue;
        const py = approximateYear(findEvent(parent.events, 'birth')?.date);
        const dy = approximateYear(findEvent(parent.events, 'death')?.date);
        // Mothers past 50 and fathers past 75 are worth a second look; so is any parent under 13.
        const tooOld = pid === fam.wifeId ? 50 : 75;
        if (py !== undefined && (cy - py < 13 || cy - py > tooOld)) {
          notes.push({
            level: 'warning',
            code: 'parent-age',
            message: `${displayName(parent)} aurait ${cy - py} ans à la naissance de ${displayName(child)}.`,
            ids: [parent.id, child.id],
          });
        }
        if (dy !== undefined && cy > dy + 1) {
          notes.push({
            level: 'warning',
            code: 'born-after-death',
            message: `${displayName(child)} est né·e après le décès de ${displayName(parent)}.`,
            ids: [child.id, parent.id],
          });
        }
      }
    }
  }
  return notes;
}

/** A stable key for a note, used to remember dismissals. */
export function noteKey(n: ImportNote): string {
  return `${n.code}:${(n.ids ?? []).join(',')}`;
}
