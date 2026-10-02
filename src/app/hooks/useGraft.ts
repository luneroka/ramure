/**
 * Completing the open tree from a GEDCOM file: read it as an import would,
 * plan the graft, and write nothing until the person has seen what it adds.
 *
 * The sizes are checked before the preview opens, so nobody confirms an
 * addition only to hear it cannot be saved.
 */

import { useCallback, useState } from 'react';
import { serializeGedcom } from '@/gedcom';
import { decodeGedcom } from '@/gedcom/charset';
import type { Tree } from '@/gedcom/model';
import { parseGedcom } from '@/gedcom/parse';
import { t, tn, type Lang, type StringKey } from '@/i18n';
import { planGraft, type GraftPlan } from '@/tree/graft';
import type { Op } from '@/tree/ops';
import { errorText } from '@/app/lib/errorText';

/** The Worker refuses a document past this many bytes (MAX_DOC_BYTES in worker/trees.ts); a file past it is refused at import too. */
const MAX_DOC_BYTES = 1_500_000;
/** The op is stored whole in one D1 row, which holds at most 2 MB, beside a few other columns. */
const MAX_OP_BYTES = 1_800_000;

const bytes = (s: string): number => new TextEncoder().encode(s).byteLength;

/** Why a plan cannot be saved, if it cannot. */
function tooLarge(plan: GraftPlan): StringKey | null {
  if (!plan.op) return null;
  if (bytes(serializeGedcom(plan.tree)) > MAX_DOC_BYTES) return 'graftTreeTooLarge';
  return bytes(JSON.stringify(plan.op)) > MAX_OP_BYTES ? 'graftOpTooLarge' : null;
}

export interface GraftPreview {
  file: string;
  plan: GraftPlan;
  /** What the plan was made from, to plan again if the tree moves while the preview is open. */
  base: Tree;
  incoming: Tree;
}

interface Args {
  lang: Lang;
  tree: Tree | null;
  toast(msg: string): void;
  commit(op: Op, opts?: { select?: boolean }): boolean;
}

export function useGraft({ lang, tree, toast, commit }: Args) {
  const [preview, setPreview] = useState<GraftPreview | null>(null);

  const pick = useCallback(
    async (file: File) => {
      if (!tree) return;
      if (file.size > MAX_DOC_BYTES) {
        toast(t(lang, 'treeTooLarge'));
        return;
      }
      try {
        const incoming = parseGedcom(decodeGedcom(await file.arrayBuffer()), { repairGeneWeb: true });
        if (Object.keys(incoming.individuals).length === 0) {
          toast(t(lang, 'graftEmptyFile'));
          return;
        }
        const plan = planGraft(tree, incoming, file.name);
        const problem = tooLarge(plan);
        if (problem) toast(t(lang, problem));
        else setPreview({ file: file.name, plan, base: tree, incoming });
      } catch (err) {
        toast(errorText(lang, err));
      }
    },
    [tree, lang, toast],
  );

  const apply = useCallback(() => {
    if (!preview || !tree) return;
    setPreview(null);
    // A relative's edit may have arrived while the preview was open: plan again on the tree as it is now.
    const plan = preview.base === tree ? preview.plan : planGraft(tree, preview.incoming, preview.file);
    if (!plan.op) return;
    const problem = tooLarge(plan);
    if (problem) toast(t(lang, problem));
    else if (commit(plan.op, { select: false })) toast(tn(lang, 'graftDone', plan.added.length));
  }, [preview, tree, lang, toast, commit]);

  const cancel = useCallback(() => setPreview(null), []);

  return { preview, pick, apply, cancel };
}
