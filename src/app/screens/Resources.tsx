/**
 * The tree's Ressources page: links and documents that belong to the whole
 * tree rather than to one person. Reached from the bar and the tree menu.
 */

import { useState } from 'react';
import type { Lead, MediaObject, Tree } from '@/gedcom/model';
import { t, type Lang } from '@/i18n';
import { newId } from '@/tree/ids';
import { DocumentList } from './Documents';
import { LeadForm, safeHref } from './Leads';

interface Props {
  lang: Lang;
  tree: Tree;
  treeName: string;
  readOnly?: boolean;
  onSaveLinks(resources: Lead[]): void;
  onSaveDocument(media: MediaObject): void;
  onDeleteDocument(mediaId: string): void;
  onNotice(message: string): void;
  onBack(): void;
}

export function ResourcesPage({ lang, tree, treeName, readOnly, onSaveLinks, onSaveDocument, onDeleteDocument, onNotice, onBack }: Props) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const resources = tree.resources ?? [];
  const docs = (tree.documentIds ?? []).map((id) => tree.media[id]).filter((m): m is MediaObject => !!m);

  return (
    <div className="settings resources-page">
      <div className="settings-head">
        <button className="btn subtle" onClick={onBack}>
          ← {t(lang, 'backToTree')}
        </button>
        <h1>{t(lang, 'resources')}</h1>
        <span className="muted resources-tree">{treeName}</span>
      </div>
      <p className="muted resources-hint">{t(lang, 'resourcesHint')}</p>

      <section className="home-card">
        <h2>{t(lang, 'resourceLinks')}</h2>
        {resources.length === 0 && !adding && <p className="muted small">{t(lang, 'noResourceLinks')}</p>}
        <ul className="lead-list">
          {resources.map((r) =>
            editingId === r.id ? (
              <li key={r.id} className="lead editing">
                <LeadForm
                  lang={lang}
                  initial={r}
                  titleLabel={t(lang, 'resourceTitle')}
                  urlLabel={t(lang, 'resourceUrl')}
                  withNote
                  submitLabel={t(lang, 'save')}
                  onSubmit={(v) => {
                    onSaveLinks(
                      resources.map((x) => (x.id === r.id ? { ...x, title: v.title, url: v.url, note: v.note || undefined } : x)),
                    );
                    setEditingId(null);
                  }}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <li key={r.id} className="lead">
                <div className="lead-body">
                  {safeHref(r.url) ? (
                    <a className="lead-title" href={safeHref(r.url)} target="_blank" rel="noopener noreferrer">
                      {r.title} ↗
                    </a>
                  ) : (
                    <span className="lead-title">{r.title}</span>
                  )}
                  {r.note && <p className="lead-note">{r.note}</p>}
                  {!readOnly && (
                    <div className="row doc-actions">
                      <button type="button" className="btn small subtle" onClick={() => setEditingId(r.id)}>
                        {t(lang, 'edit')}
                      </button>
                      <button
                        type="button"
                        className="btn small subtle danger-text"
                        onClick={() => onSaveLinks(resources.filter((x) => x.id !== r.id))}
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
                withNote
                submitLabel={t(lang, 'addResource')}
                onSubmit={(v) => {
                  onSaveLinks([...resources, { id: newId('L'), title: v.title, url: v.url, note: v.note || undefined }]);
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
      </section>

      <section className="home-card">
        <h2>{t(lang, 'documents')}</h2>
        <DocumentList
          lang={lang}
          docs={docs}
          readOnly={readOnly}
          emptyText={t(lang, 'noTreeDocuments')}
          onSave={onSaveDocument}
          onDelete={onDeleteDocument}
          onError={onNotice}
        />
      </section>
    </div>
  );
}
