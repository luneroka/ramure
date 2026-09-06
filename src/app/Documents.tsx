/**
 * Documents: files attached to a person or to the tree itself (scans,
 * photos, PDFs), with a small form to add or edit one. The person's tab
 * lists its source citations below the files.
 */

import { useRef, useState } from 'react';
import { formatDate, type GDate } from '../gedcom/dates';
import type { Individual, MediaKind, MediaObject, Tree } from '../gedcom/model';
import { t, type Lang } from '../i18n';
import { documentError, isPdf, prepareDocument } from '../media/documents';
import { mediaStore } from '../store';
import { newId } from '../tree/ids';
import { portraitId, RAMURE_MEDIA_SCHEME } from '../tree/edit';
import { DateField } from './fields/DateField';
import { usePortraitUrl } from './fields/Portrait';
import { Lightbox } from './Lightbox';

const KINDS: MediaKind[] = ['birth', 'marriage', 'death', 'photo', 'other'];

export function kindLabel(lang: Lang, k: MediaKind | undefined): string {
  switch (k) {
    case 'birth':
      return t(lang, 'docKindBirth');
    case 'marriage':
      return t(lang, 'docKindMarriage');
    case 'death':
      return t(lang, 'docKindDeath');
    case 'other':
      return t(lang, 'docKindOther');
    default:
      return t(lang, 'docKindPhoto');
  }
}

interface Draft {
  id: string;
  title: string;
  kind: MediaKind;
  date?: GDate;
  /** Only when adding: the picked file. */
  file?: File;
  existing?: MediaObject;
}

function Thumb({ media }: { media: MediaObject }) {
  const url = usePortraitUrl(media.id);
  if (isPdf(media.format)) return <span className="doc-thumb pdf">PDF</span>;
  return url ? <img className="doc-thumb" src={url} alt="" /> : <span className="doc-thumb empty" />;
}

export interface DocumentListProps {
  lang: Lang;
  docs: MediaObject[];
  readOnly?: boolean;
  /** Shown when the list is empty. */
  emptyText: string;
  /** A stored media record to attach or update. */
  onSave(media: MediaObject): void;
  onDelete(mediaId: string): void;
  onError(message: string): void;
}

/** The list itself plus the add/edit form; the owner decides where the records live. */
export function DocumentList(p: DocumentListProps) {
  const { lang, docs, readOnly, emptyText } = p;
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<MediaObject | null>(null);

  const pick = (file: File) => {
    const err = documentError(file);
    if (err) {
      p.onError(t(lang, err === 'too-big' ? 'fileTooBig' : 'fileUnsupported'));
      return;
    }
    setDraft({
      id: newId('M'),
      title: file.name.replace(/\.[^.]+$/, ''),
      kind: file.type === 'application/pdf' ? 'other' : 'photo',
      file,
    });
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      let format = draft.existing?.format;
      if (draft.file) {
        const prepared = await prepareDocument(draft.file);
        await mediaStore.put(draft.id, prepared.blob);
        format = prepared.format;
      }
      const media: MediaObject = {
        ...(draft.existing ?? { notes: [], extra: [] }),
        id: draft.id,
        file: RAMURE_MEDIA_SCHEME + draft.id,
        format,
        title: draft.title.trim() || kindLabel(lang, draft.kind),
        kind: draft.kind,
        date: draft.date,
      };
      if (!media.date) delete media.date;
      p.onSave(media);
      setDraft(null);
    } catch (err) {
      p.onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const form = draft && (
    <form
      className="doc-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {draft.file && <p className="muted small">{draft.file.name}</p>}
      <label className="field">
        {t(lang, 'docTitle')}
        <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} autoFocus />
      </label>
      <label className="field">
        {t(lang, 'docKind')}
        <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as MediaKind })}>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {kindLabel(lang, k)}
            </option>
          ))}
        </select>
      </label>
      <DateField lang={lang} value={draft.date} onChange={(date) => setDraft({ ...draft, date })} label={t(lang, 'docDate')} />
      <div className="row small-actions">
        <button type="submit" className="btn small primary" disabled={busy}>
          {draft.file ? t(lang, 'addDocument') : t(lang, 'save')}
        </button>
        <button type="button" className="btn small subtle" disabled={busy} onClick={() => setDraft(null)}>
          {t(lang, 'cancel')}
        </button>
      </div>
    </form>
  );

  return (
    <>
      {docs.length === 0 && !draft && <p className="muted small">{emptyText}</p>}
      <ul className="doc-list">
        {docs.map((m) =>
          draft?.existing?.id === m.id ? (
            <li key={m.id} className="doc editing">
              {form}
            </li>
          ) : (
            <li key={m.id} className="doc">
              <button type="button" className="doc-open" onClick={() => setViewing(m)} title={t(lang, 'open')}>
                <Thumb media={m} />
              </button>
              <div className="doc-body">
                <button type="button" className="doc-title" onClick={() => setViewing(m)}>
                  {m.title || kindLabel(lang, m.kind)}
                </button>
                <div className="doc-meta">
                  <span>{kindLabel(lang, m.kind)}</span>
                  {m.date && <span>· {formatDate(m.date, lang)}</span>}
                </div>
                {!readOnly && (
                  <div className="row doc-actions">
                    <button
                      type="button"
                      className="btn small subtle"
                      onClick={() => setDraft({ id: m.id, title: m.title ?? '', kind: m.kind ?? 'photo', date: m.date, existing: m })}
                    >
                      {t(lang, 'edit')}
                    </button>
                    <button type="button" className="btn small subtle danger-text" onClick={() => p.onDelete(m.id)}>
                      {t(lang, 'delete')}
                    </button>
                  </div>
                )}
              </div>
            </li>
          ),
        )}
        {draft && !draft.existing && <li className="doc editing">{form}</li>}
      </ul>
      {!readOnly && !draft && (
        <div className="row small-actions">
          <input
            ref={input}
            type="file"
            accept="image/*,application/pdf"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) pick(f);
              e.target.value = '';
            }}
          />
          <button type="button" className="btn small" onClick={() => input.current?.click()}>
            + {t(lang, 'addDocument')}
          </button>
          <span className="muted small">{t(lang, 'docHint')}</span>
        </div>
      )}
      {viewing && <Lightbox media={viewing} lang={lang} onClose={() => setViewing(null)} />}
    </>
  );
}

interface TabProps {
  tree: Tree;
  person: Individual;
  lang: Lang;
  readOnly?: boolean;
  isDraft?: boolean;
  sources: Array<{ label: string; text: string }>;
  onSaveDocument(media: MediaObject): void;
  onDeleteDocument(mediaId: string): void;
  onError(message: string): void;
}

/** The person's Documents tab: their files, then the citations. */
export function DocumentsTab(p: TabProps) {
  const { tree, person, lang, readOnly, isDraft, sources } = p;
  // The portrait belongs to the medallion and the edit form, not to this list.
  const portrait = portraitId(person, tree);
  const docs = person.mediaIds
    .filter((id) => id !== portrait)
    .map((id) => tree.media[id])
    .filter((m): m is MediaObject => !!m);
  return (
    <>
      <section>
        <h3 className="band">{t(lang, 'documents')}</h3>
        <DocumentList
          lang={lang}
          docs={docs}
          readOnly={readOnly || isDraft}
          emptyText={t(lang, isDraft ? 'draftNoDocuments' : 'noDocumentsYet')}
          onSave={p.onSaveDocument}
          onDelete={p.onDeleteDocument}
          onError={p.onError}
        />
      </section>
      {sources.length > 0 && (
        <section>
          <h3 className="band">{t(lang, 'sources')}</h3>
          <ul className="sources">
            {sources.map((s, i) => (
              <li key={i}>
                <span className="src-label">{s.label} :</span> {s.text}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
