/** Adding a relative: the card is previewed on the canvas and committed only on save. */

import { useCallback, type Dispatch } from 'react';
import type { Tree } from '../../gedcom/model';
import { t, tg, type Lang } from '../../i18n';
import { layoutHourglass, type LayoutOptions } from '../../tree/layout';
import type { PersonPatch } from '../../tree/edit';
import { applyOp, ops, opSubject, type Op } from '../../tree/ops';
import type { AddKind, Draft, EditorAction, ViewMode } from '../editorState';
import { errorText } from '../errorText';

function relativeOp(kind: AddKind, id: string, familyId?: string): Op {
  switch (kind) {
    case 'father':
      return ops.addParent(id, 'father');
    case 'mother':
      return ops.addParent(id, 'mother');
    case 'partner':
      return ops.addPartner(id);
    case 'child':
      return ops.addChild(id, {}, familyId);
    case 'sibling':
      return ops.addSibling(id);
  }
}

interface Args {
  tree: Tree | null;
  readOnly: boolean;
  lang: Lang;
  view: ViewMode;
  effectiveFocus: string | undefined;
  layoutOpts: LayoutOptions;
  draft: Draft | null;
  dispatch: Dispatch<EditorAction>;
  commit(op: Op): boolean;
  toast(msg: string): void;
}

export function useDrafts(a: Args) {
  const { tree, readOnly, lang, view, effectiveFocus, layoutOpts, draft, dispatch, commit, toast } = a;

  const startDraft = useCallback(
    (kind: AddKind, id: string, familyId?: string) => {
      if (!tree || readOnly) return;
      try {
        const op = relativeOp(kind, id, familyId);
        const preview = applyOp(tree, op);
        const newId = opSubject(op, preview)!;
        let nextView: ViewMode | undefined;
        if (view !== 'all') {
          const probe = effectiveFocus ? layoutHourglass(preview.tree, effectiveFocus, layoutOpts) : null;
          if (!probe || !probe.nodes.some((n) => n.id === newId)) nextView = 'all';
        }
        dispatch({ type: 'openDraft', draft: { kind, relativeId: id, op, preview }, newId, view: nextView });
      } catch (err) {
        toast(errorText(lang, err));
      }
    },
    [tree, readOnly, view, effectiveFocus, layoutOpts, dispatch, toast, lang],
  );

  const saveDraft = useCallback(
    (patch: PersonPatch) => {
      if (!tree || !draft) return;
      const newId = opSubject(draft.op, draft.preview)!;
      dispatch({ type: 'draftSaved' });
      if (commit(ops.batch([draft.op, ops.updatePerson(newId, patch)]))) toast(t(lang, 'saved'));
    },
    [tree, draft, dispatch, commit, toast, lang],
  );

  const addOptions = useCallback(
    (id: string): Array<{ kind: AddKind; label: string }> => {
      if (!tree) return [];
      const ind = tree.individuals[id];
      if (!ind) return [];
      const birth = ind.childOf.find((l) => l.pedigree === 'birth') ?? ind.childOf[0];
      const fam = birth ? tree.families[birth.familyId] : undefined;
      const out: Array<{ kind: AddKind; label: string }> = [];
      if (!fam?.husbandId) out.push({ kind: 'father', label: t(lang, 'addFather') });
      if (!fam?.wifeId) out.push({ kind: 'mother', label: t(lang, 'addMother') });
      out.push(
        { kind: 'partner', label: tg(lang, 'addPartner', ind.sex) },
        { kind: 'child', label: t(lang, 'addChild') },
        { kind: 'sibling', label: t(lang, 'addSibling') },
      );
      return out;
    },
    [tree, lang],
  );

  return { startDraft, saveDraft, addOptions };
}
