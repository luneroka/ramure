/** Trees as files: import, export, create, rename, delete. */

import { useCallback, useState } from 'react';
import { serializeGedcom } from '../../gedcom';
import { decodeGedcom } from '../../gedcom/charset';
import type { Tree } from '../../gedcom/model';
import { t, type Lang } from '../../i18n';
import { api, type Account, type Role, type TreeSummary } from '../../sync/api';
import { newTree } from '../../tree/edit';
import type { AskSpec } from '../Modal';
import type { Source } from './useTreeSession';

interface Args {
  lang: Lang;
  account: Account | null;
  source: Source | null;
  tree: Tree | null;
  toast(msg: string): void;
  ask(spec: AskSpec): Promise<string | null>;
  openTree(id: string, name: string, role: Role, thenEdit?: boolean): Promise<void>;
  onRenamed(name: string): void;
  onDeleted(id: string): void;
}

export function useTreeFiles(a: Args) {
  const { lang, account, source, tree, toast, ask, openTree } = a;
  const [busy, setBusy] = useState(false);

  const createTreeFrom = useCallback(
    async (name: string, gedcom: string, thenEdit?: boolean) => {
      if (!account) return;
      setBusy(true);
      toast(t(lang, 'creatingTree'));
      try {
        const created = await api.createTree(account.id, name, gedcom);
        await openTree(created.id, created.name, created.role, thenEdit);
        toast(t(lang, 'treeCreated'));
      } catch {
        toast(t(lang, 'syncError'));
      } finally {
        setBusy(false);
      }
    },
    [account, lang, toast, openTree],
  );

  const openFile = useCallback(
    async (file: File) => {
      if (file.size > 1_500_000) {
        toast(t(lang, 'treeTooLarge'));
        return;
      }
      await createTreeFrom(file.name.replace(/\.(ged|gedcom)$/i, ''), decodeGedcom(await file.arrayBuffer()));
    },
    [createTreeFrom, lang, toast],
  );

  const exportGedcom = useCallback(() => {
    if (!tree || !source) return;
    const blob = new Blob([serializeGedcom(tree)], { type: 'text/plain;charset=utf-8' });
    const el = document.createElement('a');
    el.href = URL.createObjectURL(blob);
    el.download = source.name.replace(/\.ged$/i, '') + '-ramure.ged';
    el.click();
    setTimeout(() => URL.revokeObjectURL(el.href), 1000);
  }, [tree, source]);

  const startNewTree = useCallback(async () => {
    const name = await ask({
      title: t(lang, 'newTree'),
      input: { label: t(lang, 'treeName'), initial: account?.name ?? '' },
      confirmLabel: t(lang, 'create'),
    });
    if (name === null) return;
    const r = newTree('', '', 'U');
    void createTreeFrom(name.trim() || t(lang, 'newTreeName').replace(/\.ged$/, ''), serializeGedcom(r.tree), true);
  }, [ask, lang, account, createTreeFrom]);

  const renameTree = useCallback(async () => {
    if (!source) return;
    const answer = await ask({
      title: t(lang, 'renameTree'),
      input: { label: t(lang, 'treeName'), initial: source.name },
      confirmLabel: t(lang, 'save'),
    });
    const name = (answer ?? '').trim();
    if (!name || name === source.name) return;
    try {
      await api.renameTree(source.id, name);
      a.onRenamed(name);
      toast(t(lang, 'treeRenamed'));
    } catch {
      toast(t(lang, 'syncError'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, ask, lang, toast, a.onRenamed]);

  const deleteTree = useCallback(
    async (tr: TreeSummary) => {
      const answer = await ask({
        title: t(lang, 'deleteTreeTitle'),
        message: t(lang, 'deleteTreeMessage'),
        confirmLabel: t(lang, 'deleteTree'),
        danger: true,
        requireText: tr.name,
      });
      if (answer === null) return;
      try {
        await api.deleteTree(tr.id);
        a.onDeleted(tr.id);
        toast(t(lang, 'treeDeleted'));
      } catch {
        toast(t(lang, 'syncError'));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ask, lang, toast, a.onDeleted],
  );

  return { busy, createTreeFrom, openFile, exportGedcom, startNewTree, renameTree, deleteTree };
}
