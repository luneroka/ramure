/** Wires the person panel to the workspace: every action becomes an op through `commit`. */

import { t } from '../../i18n';
import { mediaStore } from '../../store';
import { ops } from '../../tree/ops';
import { PersonPanel } from '../PersonPanel';
import { useWorkspace } from '../session/Workspace';
import { useUi } from '../ui/UiContext';

export function PersonPanelHost() {
  const { lang, toast } = useUi();
  const w = useWorkspace();
  const { tree, displayTree, editor, readOnly } = w;
  const draft = editor.draft;
  const selected = editor.selectedId ? displayTree.individuals[editor.selectedId] : undefined;
  if (!selected) return null;
  const saved = (ok: boolean, key: 'saved' | 'linked' | 'unlinked' | 'merged' | 'photoSaved' | 'personDeleted') =>
    ok && toast(t(lang, key));
  return (
    <PersonPanel
      tree={displayTree}
      person={selected}
      lang={lang}
      readOnly={readOnly}
      editing={(editor.editing || !!draft) && !readOnly}
      isDraft={!!draft}
      setEditing={(v) => {
        if (!v && draft) w.cancelDraft();
        else w.dispatch({ type: 'setEditing', editing: v });
      }}
      onFocus={w.focusOn}
      onSelect={w.select}
      onClose={() => w.dispatch({ type: 'closePanel' })}
      onSavePerson={(id, patch) => {
        if (draft) w.saveDraft(patch);
        else saved(w.commit(ops.updatePerson(id, patch)), 'saved');
      }}
      onDeletePerson={(id) => saved(w.commit(ops.deletePerson(id), { select: false }), 'personDeleted')}
      onSaveFamily={(id, patch) => saved(w.commit(ops.updateFamily(id, patch)), 'saved')}
      onAddChild={(pid, fid) => w.startDraft('child', pid, fid)}
      onLinkPartner={(pid, partner) => saved(w.commit(ops.linkPartner(pid, partner)), 'linked')}
      onLinkChild={(fid, cid) => saved(w.commit(ops.linkChild(fid, cid)), 'linked')}
      onUnlinkChild={(fid, cid) => saved(w.commit(ops.unlinkChild(fid, cid)), 'unlinked')}
      onMerge={(keep, drop) => saved(w.commit(ops.mergePeople(keep, drop)), 'merged')}
      onSetPortrait={(id, media) => {
        if (!draft) saved(w.commit(ops.updatePerson(id, { portrait: media })), 'photoSaved');
      }}
      onSaveDocument={(id, media) => {
        if (draft) return;
        const person = tree.individuals[id];
        if (!person) return;
        const known = person.mediaIds.includes(media.id);
        const mediaIds = known ? person.mediaIds : [...person.mediaIds, media.id];
        if (w.commit(ops.updatePerson(id, { media: [media], mediaIds }))) toast(t(lang, known ? 'saved' : 'documentAdded'));
      }}
      onDeleteDocument={(id, mediaId) => {
        if (draft) return;
        void w.confirmDeleteDocument().then((ok) => {
          const person = tree.individuals[id];
          if (!ok || !person) return;
          if (w.commit(ops.updatePerson(id, { mediaIds: person.mediaIds.filter((m) => m !== mediaId) }))) {
            void mediaStore.delete(mediaId);
            toast(t(lang, 'documentDeleted'));
          }
        });
      }}
      onSaveLeads={(id, leads) => {
        if (!draft) saved(w.commit(ops.updatePerson(id, { leads })), 'saved');
      }}
      onNotice={toast}
    />
  );
}
