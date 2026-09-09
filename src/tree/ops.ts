/**
 * Operations: every change to a tree as a plain, serialisable record.
 *
 * The UI builds an Op (allocating any new ids up front), applyOp turns it
 * into a new Tree through the pure functions in edit.ts. Because an op
 * carries its ids, the same op replays identically on another device, which
 * is what sync, history and "who changed what" are built on.
 */

import type { Lead, Tree } from '../gedcom/model';
import { geocodePlaces, type Geocode } from './places';
import { parseGedcom } from '../gedcom/parse';
import {
  addChild,
  addParent,
  addPartner,
  addSibling,
  createPerson,
  deletePerson,
  linkChild,
  linkPartner,
  mergePeople,
  setResources,
  unlinkChild,
  updateTree,
  type TreePatch,
  updateFamily,
  updatePerson,
  EditError,
  type EditResult,
  type FamilyPatch,
  type NewPerson,
  type PersonPatch,
} from './edit';
import { newId } from './ids';
import { applyRecordPatch, type RecordPatch } from './diff';

export type Op =
  | { t: 'createPerson'; id: string; data: NewPerson }
  | { t: 'updatePerson'; id: string; patch: PersonPatch }
  | { t: 'deletePerson'; id: string }
  | { t: 'addParent'; childId: string; slot: 'father' | 'mother'; data: NewPerson; personId: string; familyId: string }
  | { t: 'addPartner'; personId: string; data: NewPerson; newPersonId: string; familyId: string }
  | { t: 'addChild'; personId: string; data: NewPerson; inFamilyId?: string; childId: string; familyId: string }
  | { t: 'addSibling'; personId: string; data: NewPerson; siblingId: string; familyId: string }
  | { t: 'linkChild'; familyId: string; childId: string }
  | { t: 'unlinkChild'; familyId: string; childId: string }
  | { t: 'linkPartner'; personId: string; partnerId: string; familyId: string }
  | { t: 'updateFamily'; id: string; patch: FamilyPatch }
  | { t: 'mergePeople'; keepId: string; dropId: string }
  | { t: 'setResources'; resources: Lead[] }
  | { t: 'updateTree'; patch: TreePatch }
  | { t: 'geocodePlaces'; fixes: Geocode[] }
  /** Replace the whole tree (snapshot restore). Carries the GEDCOM text so it replays anywhere. */
  | { t: 'replaceTree'; gedcom: string }
  /** Several ops applied as one step (one undo, one sync record), e.g. "add child" then "fill in the card". */
  | { t: 'batch'; ops: Op[] }
  /** Set or remove whole records: the generic inverse of any edit (undo / redo). */
  | RecordPatch;

/** An op with its identity and provenance, as stored in a log or sent to a server. */
export interface OpEnvelope {
  id: string;
  /** Milliseconds since epoch, on the device that created it. */
  ts: number;
  /** User id once accounts exist; undefined for local-only edits. */
  actor?: string;
  op: Op;
}

export function envelope(op: Op, actor?: string): OpEnvelope {
  return { id: newId('T'), ts: Date.now(), actor, op };
}

/** Builders: allocate ids here so the op is complete before it is applied anywhere. */
export const ops = {
  createPerson: (data: NewPerson = {}): Op => ({ t: 'createPerson', id: newId('I'), data }),
  updatePerson: (id: string, patch: PersonPatch): Op => ({ t: 'updatePerson', id, patch }),
  deletePerson: (id: string): Op => ({ t: 'deletePerson', id }),
  addParent: (childId: string, slot: 'father' | 'mother', data: NewPerson = {}): Op => ({
    t: 'addParent',
    childId,
    slot,
    data,
    personId: newId('I'),
    familyId: newId('F'),
  }),
  addPartner: (personId: string, data: NewPerson = {}): Op => ({
    t: 'addPartner',
    personId,
    data,
    newPersonId: newId('I'),
    familyId: newId('F'),
  }),
  addChild: (personId: string, data: NewPerson = {}, inFamilyId?: string): Op => ({
    t: 'addChild',
    personId,
    data,
    inFamilyId,
    childId: newId('I'),
    familyId: newId('F'),
  }),
  addSibling: (personId: string, data: NewPerson = {}): Op => ({
    t: 'addSibling',
    personId,
    data,
    siblingId: newId('I'),
    familyId: newId('F'),
  }),
  linkChild: (familyId: string, childId: string): Op => ({ t: 'linkChild', familyId, childId }),
  unlinkChild: (familyId: string, childId: string): Op => ({ t: 'unlinkChild', familyId, childId }),
  linkPartner: (personId: string, partnerId: string): Op => ({ t: 'linkPartner', personId, partnerId, familyId: newId('F') }),
  updateFamily: (id: string, patch: FamilyPatch): Op => ({ t: 'updateFamily', id, patch }),
  mergePeople: (keepId: string, dropId: string): Op => ({ t: 'mergePeople', keepId, dropId }),
  setResources: (resources: Lead[]): Op => ({ t: 'setResources', resources }),
  updateTree: (patch: TreePatch): Op => ({ t: 'updateTree', patch }),
  geocodePlaces: (fixes: Geocode[]): Op => ({ t: 'geocodePlaces', fixes }),
  replaceTree: (gedcom: string): Op => ({ t: 'replaceTree', gedcom }),
  batch: (list: Op[]): Op => ({ t: 'batch', ops: list }),
};

/** The one place a tree changes. Throws with a short message when the op cannot apply. */
export function applyOp(tree: Tree, op: Op): EditResult {
  switch (op.t) {
    case 'createPerson':
      return createPerson(tree, op.data, op.id);
    case 'updatePerson':
      return updatePerson(tree, op.id, op.patch);
    case 'deletePerson':
      return deletePerson(tree, op.id);
    case 'addParent':
      return addParent(tree, op.childId, op.slot, op.data, { person: op.personId, family: op.familyId });
    case 'addPartner':
      return addPartner(tree, op.personId, op.data, { person: op.newPersonId, family: op.familyId });
    case 'addChild':
      return addChild(tree, op.personId, op.data, op.inFamilyId, { person: op.childId, family: op.familyId });
    case 'addSibling':
      return addSibling(tree, op.personId, op.data, { person: op.siblingId, family: op.familyId });
    case 'linkChild':
      return linkChild(tree, op.familyId, op.childId);
    case 'unlinkChild':
      return unlinkChild(tree, op.familyId, op.childId);
    case 'linkPartner':
      return linkPartner(tree, op.personId, op.partnerId, { family: op.familyId });
    case 'updateFamily':
      return updateFamily(tree, op.id, op.patch);
    case 'mergePeople':
      return mergePeople(tree, op.keepId, op.dropId);
    case 'setResources':
      return setResources(tree, op.resources);
    case 'updateTree':
      return updateTree(tree, op.patch);
    case 'geocodePlaces':
      return geocodePlaces(tree, op.fixes);
    case 'replaceTree':
      return { tree: parseGedcom(op.gedcom) };
    default:
      throw new EditError('unknown_op', String((op as { t?: string }).t));
    case 'patchRecords':
      return { tree: applyRecordPatch(tree, op) };
    case 'batch': {
      let r: EditResult = { tree };
      for (const inner of op.ops) {
        const step = applyOp(r.tree, inner);
        r = { tree: step.tree, focusId: step.focusId ?? r.focusId };
      }
      return r;
    }
  }
}

/** The person an op most concerns, for "changed by" displays and for opening the panel after applying. */
export function opSubject(op: Op, result: EditResult): string | undefined {
  switch (op.t) {
    case 'createPerson':
      return op.id;
    case 'addParent':
      return op.personId;
    case 'addPartner':
      return op.newPersonId;
    case 'addChild':
      return op.childId;
    case 'addSibling':
      return op.siblingId;
    case 'replaceTree':
      return undefined;
    case 'batch':
      return op.ops.length ? opSubject(op.ops[op.ops.length - 1]!, result) : result.focusId;
    default:
      return result.focusId;
  }
}

/** A short label for history views. */
export function describeOp(op: Op, lang: 'fr' | 'en'): string {
  const fr = lang === 'fr';
  switch (op.t) {
    case 'createPerson':
      return fr ? 'Nouvelle personne' : 'New person';
    case 'updatePerson':
      return fr ? 'Fiche modifiée' : 'Person edited';
    case 'deletePerson':
      return fr ? 'Personne supprimée' : 'Person deleted';
    case 'addParent':
      return fr ? (op.slot === 'father' ? 'Père ajouté' : 'Mère ajoutée') : op.slot === 'father' ? 'Father added' : 'Mother added';
    case 'addPartner':
      return fr ? 'Conjoint·e ajouté·e' : 'Partner added';
    case 'addChild':
      return fr ? 'Enfant ajouté' : 'Child added';
    case 'addSibling':
      return fr ? 'Frère ou sœur ajouté·e' : 'Sibling added';
    case 'linkChild':
      return fr ? 'Enfant rattaché' : 'Child linked';
    case 'unlinkChild':
      return fr ? 'Enfant retiré de la famille' : 'Child unlinked';
    case 'linkPartner':
      return fr ? 'Union ajoutée' : 'Union added';
    case 'updateFamily':
      return fr ? 'Union modifiée' : 'Union edited';
    case 'mergePeople':
      return fr ? 'Doublons fusionnés' : 'Duplicates merged';
    case 'setResources':
      return fr ? 'Ressources modifiées' : 'Resources edited';
    case 'updateTree':
      if (op.patch.dismissedChecks) return fr ? 'Vérification ignorée' : 'Check dismissed';
      return fr ? 'Ressources modifiées' : 'Resources edited';
    case 'geocodePlaces':
      return fr ? 'Lieux localisés' : 'Places located';
    case 'replaceTree':
      return fr ? 'Sauvegarde restaurée' : 'Snapshot restored';
    case 'patchRecords':
      return fr ? 'Annulation' : 'Undo';
    case 'batch':
      return op.ops.length ? describeOp(op.ops[0]!, lang) : fr ? 'Modification' : 'Change';
  }
}
