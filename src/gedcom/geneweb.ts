/**
 * Repairs for GEDCOM files exported by GeneWeb, which is what Geneanet runs.
 *
 * Every rule here was observed on a real round trip; see
 * docs/phase0-geneanet-roundtrip.md. Each repair records an ImportNote so the
 * user can see what was changed.
 */

import type { Event, Family, Individual, Tree } from './model';

export function isGeneWebExport(tree: Tree): boolean {
  const s = (tree.header.sourceSystem ?? '').toLowerCase();
  return s.includes('geneweb') || s.includes('geneanet');
}

export function repairGeneWeb(tree: Tree): void {
  const geneweb = isGeneWebExport(tree);
  // These rules are safe on any file, so they always run.
  for (const ind of Object.values(tree.individuals)) {
    unknownGivenName(tree, ind);
    liftCauseFromNote(tree, ind.events, ind.id);
    liftAddressFromNote(ind.events);
    dedupeOccupation(tree, ind);
  }
  for (const fam of Object.values(tree.families)) {
    liftCauseFromNote(tree, fam.events, fam.id);
    unionTypeFromEvent(fam);
  }
  // These rewrite structure and only run when we know the dialect.
  if (geneweb) {
    repairAdoptions(tree);
    dropParentlessFamilies(tree);
    tree.importNotes.push({
      level: 'info',
      code: 'geneweb',
      message:
        "Fichier exporté par GeneWeb (Geneanet). Les coordonnées, les flags de confidentialité, les médias et la structure des sources ne sont pas présents dans ce format d'export.",
    });
  }
}

/** GeneWeb writes "x" or "X" for an unknown given name. */
function unknownGivenName(tree: Tree, ind: Individual): void {
  for (const n of ind.names) {
    if (n.given === 'x' || n.given === 'X' || n.given === '?') {
      n.given = '';
      tree.importNotes.push({
        level: 'info',
        code: 'unknown-given',
        message: `Prénom inconnu (« ${'x'} ») remplacé par un prénom vide.`,
        ids: [ind.id],
      });
    }
  }
}

/** "2 NOTE Cause: ..." under DEAT becomes the death cause. */
function liftCauseFromNote(tree: Tree, events: Event[], id: string): void {
  for (const e of events) {
    if (e.cause) continue;
    const idx = e.notes.findIndex((n) => /^cause\s*:\s*/i.test(n));
    if (idx >= 0) {
      e.cause = e.notes[idx]!.replace(/^cause\s*:\s*/i, '').trim();
      e.notes.splice(idx, 1);
      tree.importNotes.push({ level: 'info', code: 'cause-from-note', message: 'Cause du décès récupérée depuis une note.', ids: [id] });
    }
  }
}

/** "2 NOTE Address: \n Address: , Brest, 29200, France" under RESI becomes the address. */
function liftAddressFromNote(events: Event[]): void {
  for (const e of events) {
    if (e.address) continue;
    const idx = e.notes.findIndex((n) => /^address\s*:/i.test(n));
    if (idx >= 0) {
      const lines = e.notes[idx]!.split('\n')
        .map((l) => l.replace(/^address\s*:\s*/i, '').trim())
        .filter(Boolean);
      const parts = lines.flatMap((l) => l.split(',').map((s) => s.trim())).filter(Boolean);
      if (parts.length) e.address = parts.join(', ');
      e.notes.splice(idx, 1);
    }
  }
}

/**
 * A dated occupation comes back as an OCCU event whose text is in a note,
 * plus a second bare OCCU with the text as value. Fold them together.
 */
function dedupeOccupation(tree: Tree, ind: Individual): void {
  const occs = ind.events.filter((e) => e.type === 'occupation');
  if (occs.length < 2) return;
  const bare = occs.filter((e) => e.value && !e.date && !e.place && e.notes.length === 0);
  const dated = occs.filter((e) => !e.value && (e.date || e.place) && e.notes.length >= 1);
  for (const d of dated) {
    const text = d.notes[0]!;
    const twin = bare.find((b) => b.value === text);
    if (twin) {
      d.value = text;
      d.notes.shift();
      ind.events.splice(ind.events.indexOf(twin), 1);
      bare.splice(bare.indexOf(twin), 1);
      tree.importNotes.push({ level: 'info', code: 'occupation-merged', message: `Profession « ${text} » dédoublonnée.`, ids: [ind.id] });
    }
  }
}

/** "1 EVEN / 2 TYPE unmarried" on a family is GeneWeb's relation kind, not an event. */
function unionTypeFromEvent(fam: Family): void {
  const idx = fam.events.findIndex(
    (e) =>
      e.type === 'custom' &&
      e.tag === 'EVEN' &&
      !e.date &&
      !e.place &&
      /^(unmarried|no mention|engaged|pacs|civil|marriage contract|marriage license)$/i.test(e.customType ?? ''),
  );
  if (idx < 0) return;
  const t = fam.events[idx]!.customType!.toLowerCase();
  if (t === 'unmarried' || t === 'no mention') fam.unionType = 'unmarried';
  else if (t === 'pacs' || t === 'civil') fam.unionType = 'civil';
  else return; // keep engaged / contract / license as events
  fam.events.splice(idx, 1);
}

/**
 * GeneWeb exports an adopted child like this: the child is removed from the
 * CHIL list of its parents' family; a new family with the same partners and
 * no children is created; the child gets "1 ADOP / 2 FAMC @new@ / 3 ADOP BOTH".
 * We put the child back into the original family with pedigree "adopted" and
 * drop the duplicate family.
 */
function repairAdoptions(tree: Tree): void {
  for (const ind of Object.values(tree.individuals)) {
    for (const ev of ind.events) {
      if (ev.type !== 'adoption' || !ev.adoptionFamilyId) continue;
      const adoptive = tree.families[ev.adoptionFamilyId];
      if (!adoptive) continue;
      const alreadyChild = ind.childOf.some((l) => l.familyId === adoptive.id);
      if (adoptive.childIds.length === 0 && !alreadyChild) {
        // Look for the "real" family with the same partners that lists other children or events.
        const twin = Object.values(tree.families).find(
          (f) => f.id !== adoptive.id && f.husbandId === adoptive.husbandId && f.wifeId === adoptive.wifeId,
        );
        const target = twin ?? adoptive;
        if (!target.childIds.includes(ind.id)) target.childIds.push(ind.id);
        const link = ind.childOf.find((l) => l.familyId === target.id);
        if (link) link.pedigree = 'adopted';
        else ind.childOf.push({ familyId: target.id, pedigree: 'adopted' });
        ev.adoptionFamilyId = target.id;
        if (twin) {
          delete tree.families[adoptive.id];
          for (const p of Object.values(tree.individuals)) p.partnerIn = p.partnerIn.filter((id) => id !== adoptive.id);
        }
        tree.importNotes.push({
          level: 'warning',
          code: 'adoption-repaired',
          message: 'Adoption reconstruite : enfant rattaché à la famille de ses parents adoptifs.',
          ids: [ind.id, target.id],
        });
      } else if (alreadyChild) {
        const link = ind.childOf.find((l) => l.familyId === adoptive.id)!;
        link.pedigree = 'adopted';
      }
      // GeneWeb appends a sentence to the person's note; remove it.
      ind.notes = ind.notes
        .map((n) => n.replace(/\n*\s*Family child Pedigree linkage type:\s*\w+\s*$/i, '').replace(/\n+$/, ''))
        .filter((n) => n.length);
    }
  }
}

/** Families with no partners and one child are GeneWeb placeholders for unlinked people. */
function dropParentlessFamilies(tree: Tree): void {
  for (const fam of Object.values(tree.families)) {
    if (fam.husbandId || fam.wifeId || fam.events.length || fam.notes.length) continue;
    delete tree.families[fam.id];
    for (const cid of fam.childIds) {
      const c = tree.individuals[cid];
      if (c) c.childOf = c.childOf.filter((l) => l.familyId !== fam.id);
    }
    tree.importNotes.push({
      level: 'info',
      code: 'empty-family-dropped',
      message: 'Famille sans parents supprimée (artefact GeneWeb).',
      ids: [fam.id, ...fam.childIds],
    });
  }
}
