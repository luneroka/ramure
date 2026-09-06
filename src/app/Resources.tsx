/** The tree's Ressources: a quiet list of useful sites and collections, edited in place. */

import { useState } from 'react';
import type { Lead } from '../gedcom/model';
import { t, type Lang } from '../i18n';
import { newId } from '../tree/ids';
import { LeadForm } from './Leads';

interface Props {
  lang: Lang;
  resources: Lead[];
  readOnly?: boolean;
  onSave(resources: Lead[]): void;
  onClose(): void;
}

export function ResourcesDialog({ lang, resources, readOnly, onSave, onClose }: Props) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog resources" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t(lang, 'resources')}>
        <div className="report-head">
          <strong>{t(lang, 'resources')}</strong>
          <span className="muted">{t(lang, 'resourcesHint')}</span>
          <button className="icon-btn" onClick={onClose} aria-label={t(lang, 'close')}>
            ×
          </button>
        </div>
        {resources.length === 0 && !adding && <p className="muted">{t(lang, 'noResources')}</p>}
        <ul className="lead-list">
          {resources.map((r) =>
            editingId === r.id ? (
              <li key={r.id} className="lead editing">
                <LeadForm
                  lang={lang}
                  initial={r}
                  titleLabel={t(lang, 'resourceTitle')}
                  urlLabel={t(lang, 'resourceUrl')}
                  submitLabel={t(lang, 'save')}
                  onSubmit={(v) => {
                    onSave(resources.map((x) => (x.id === r.id ? { ...x, title: v.title, url: v.url } : x)));
                    setEditingId(null);
                  }}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <li key={r.id} className="lead">
                <div className="lead-body">
                  {r.url ? (
                    <a className="lead-title" href={r.url} target="_blank" rel="noopener">
                      {r.title} ↗
                    </a>
                  ) : (
                    <span className="lead-title">{r.title}</span>
                  )}
                  {!readOnly && (
                    <div className="row doc-actions">
                      <button type="button" className="btn small subtle" onClick={() => setEditingId(r.id)}>
                        {t(lang, 'edit')}
                      </button>
                      <button
                        type="button"
                        className="btn small subtle danger-text"
                        onClick={() => onSave(resources.filter((x) => x.id !== r.id))}
                      >
                        {t(lang, 'delete')}
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ),
          )}
          {adding && (
            <li className="lead editing">
              <LeadForm
                lang={lang}
                titleLabel={t(lang, 'resourceTitle')}
                urlLabel={t(lang, 'resourceUrl')}
                submitLabel={t(lang, 'addResource')}
                onSubmit={(v) => {
                  onSave([...resources, { id: newId('L'), title: v.title, url: v.url }]);
                  setAdding(false);
                }}
                onCancel={() => setAdding(false)}
              />
            </li>
          )}
        </ul>
        {!readOnly && !adding && (
          <div className="row small-actions">
            <button type="button" className="btn small" onClick={() => setAdding(true)}>
              + {t(lang, 'addResource')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
