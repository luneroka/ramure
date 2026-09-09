/** Wires the resources page (links and documents of the whole tree) to the workspace. */

import { t } from '@/i18n';
import { mediaStore } from '@/store';
import { ops } from '@/tree/ops';
import { ResourcesPage } from '@/app/screens/Resources';
import type { Route } from '@/app/state/router';
import { useWorkspace } from '@/app/state/Workspace';
import { useUi } from '@/app/ui/UiContext';

export function ResourcesHost({ navigate }: { navigate(r: Route): void }) {
  const { lang, toast } = useUi();
  const w = useWorkspace();
  const { tree } = w;
  return (
    <ResourcesPage
      lang={lang}
      tree={tree}
      treeName={w.source.name}
      readOnly={w.readOnly}
      onBack={() => navigate({ name: 'tree', id: w.source.id })}
      onNotice={toast}
      onSaveLinks={(resources) => {
        if (w.commit(ops.updateTree({ resources }))) toast(t(lang, 'resourceSaved'));
      }}
      onSaveDocument={(media) => {
        const ids = tree.documentIds ?? [];
        const known = ids.includes(media.id);
        if (w.commit(ops.updateTree({ media: [media], documentIds: known ? ids : [...ids, media.id] })))
          toast(t(lang, known ? 'saved' : 'documentAdded'));
      }}
      onDeleteDocument={(mediaId) => {
        void w.confirmDeleteDocument().then((ok) => {
          if (!ok) return;
          if (w.commit(ops.updateTree({ documentIds: (tree.documentIds ?? []).filter((m) => m !== mediaId) }))) {
            void mediaStore.delete(mediaId);
            toast(t(lang, 'documentDeleted'));
          }
        });
      }}
    />
  );
}
