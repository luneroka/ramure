/** The checks report: import notes still relevant and live audits, each pointing at the people concerned. */

import { displayName } from '@/gedcom/model';
import { t } from '@/i18n';
import { noteKey } from '@/tree/audit';
import { useWorkspace } from '@/app/state/Workspace';
import { useUi } from '@/app/ui/UiContext';

export function ReportPanel() {
  const { lang } = useUi();
  const w = useWorkspace();
  const { tree, reportNotes } = w;
  const close = () => w.dispatch({ type: 'showReport', show: false });
  return (
    <div className="report">
      <div className="report-head">
        <strong>{t(lang, 'importReport')}</strong>
        <span className="muted">
          {reportNotes.length} · {t(lang, 'reportHint')}
        </span>
        <button className="icon-btn" onClick={close} aria-label={t(lang, 'close')}>
          ×
        </button>
      </div>
      {reportNotes.length === 0 ? (
        <p className="muted">{t(lang, 'reportEmpty')}</p>
      ) : (
        <ul>
          {reportNotes.map((n) => (
            <li key={noteKey(n)} className={n.level}>
              <span className="report-text">
                {n.message}
                {n.ids
                  ?.filter((id) => tree.individuals[id])
                  .map((id) => (
                    <button key={id} className="link" onClick={() => w.focusOn(id)}>
                      {displayName(tree.individuals[id]!)}
                    </button>
                  ))}
              </span>
              <span className="report-actions">
                {n.fixId && tree.individuals[n.fixId] && !w.readOnly && (
                  <button
                    className="btn small"
                    onClick={() => {
                      w.focusOn(n.fixId!);
                      w.dispatch({ type: 'setEditing', editing: true });
                    }}
                  >
                    {t(lang, 'fix')}
                  </button>
                )}
                <button className="btn small subtle" onClick={() => w.dismissNote(noteKey(n))} title={t(lang, 'dismissHint')}>
                  {t(lang, 'dismiss')}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
