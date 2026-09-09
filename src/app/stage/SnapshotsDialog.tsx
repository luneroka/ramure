/** The versions of the tree: automatic ones and those saved with a label. Owners can restore. */

import { t } from '../../i18n';
import { localeOf } from '../format';
import type { SnapshotRow } from '../hooks/useSnapshots';
import { useUi } from '../ui/UiContext';

interface Props {
  snapshots: SnapshotRow[];
  readOnly: boolean;
  owner: boolean;
  onClose(): void;
  onSaveVersion(): void;
  onRestore(id: string): void;
}

export function SnapshotsDialog({ snapshots, readOnly, owner, onClose, onSaveVersion, onRestore }: Props) {
  const { lang } = useUi();
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t(lang, 'snapshots')}>
        <div className="report-head">
          <strong>{t(lang, 'snapshots')}</strong>
          <span className="muted" />
          <button className="icon-btn" onClick={onClose} aria-label={t(lang, 'close')}>
            ×
          </button>
        </div>
        <p className="muted small">{t(lang, 'snapshotsHint')}</p>
        {!readOnly && (
          <div className="row" style={{ marginBottom: 10 }}>
            <button className="btn primary" onClick={onSaveVersion}>
              {t(lang, 'saveVersion')}
            </button>
          </div>
        )}
        {snapshots.length === 0 ? (
          <p className="muted">{t(lang, 'noSnapshots')}</p>
        ) : (
          <ul className="snapshots">
            {snapshots.map((s, i) => (
              <li key={s.id}>
                <span className="mono">{new Date(s.created_at).toLocaleString(localeOf(lang))}</span>
                <span>
                  <strong>{s.label ?? t(lang, 'automaticVersion')}</strong>
                  <span className="muted small">
                    {' '}
                    · {t(lang, 'versionN')} {snapshots.length - i}
                    {s.by ? ` · ${t(lang, 'by')} ${s.by}` : ''}
                  </span>
                </span>
                <button
                  className="btn small"
                  onClick={() => onRestore(s.id)}
                  disabled={!owner}
                  title={!owner ? t(lang, 'adminsOnly') : undefined}
                >
                  {t(lang, 'restore')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
