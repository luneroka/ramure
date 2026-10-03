/**
 * Documents: files attached to a person or to the tree itself (scans,
 * photos, PDFs), with a small form to add or edit one. The person's tab
 * lists their sources below the files: the ones a GEDCOM brought, and the
 * ones written here, as a text, a link or both.
 */

import { useRef, useState } from 'react';
import { formatDate, type GDate } from '@/gedcom/dates';
import { sourceParts, writtenSource, type Citation, type Individual, type MediaKind, type MediaObject, type Tree } from '@/gedcom/model';
import { t, type Lang } from '@/i18n';
import { documentError, isPdf, prepareDocument } from '@/media/documents';
import { mediaStore } from '@/store';
import { newId } from '@/tree/ids';
import { portraitId, RAMURE_MEDIA_SCHEME } from '@/tree/edit';
import { DateField } from '@/app/person/fields/DateField';
import { usePortraitUrl } from '@/app/person/fields/Portrait';
import { Lightbox } from '@/app/ui/Lightbox';
import { errorText } from '@/app/lib/errorText';
import type { SourceAt, SourceRow } from '@/app/lib/lifeEvents';
import { linkParts, safeHref, shortLink } from '@/app/lib/urls';
import { LinkForm } from '@/app/ui/LinkForm';

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
      p.onError(errorText(lang, err));
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
              <button type="button" className="doc-open" onClick={() => setViewing(m)} data-tip={t(lang, 'open')}>
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
            accept="image/jpeg,image/png,image/webp,image/gif,image/heic,application/pdf"
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

/** Text with its addresses as short links: the full address is the link's title, never its width. */
function Linked({ text }: { text: string }) {
  return (
    <>
      {linkParts(text).map((p, i) =>
        'href' in p ? (
          <a key={i} className="src-link" href={p.href} title={p.href} target="_blank" rel="noopener noreferrer">
            {p.text}
          </a>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

function SourceView({ tree, citation }: { tree: Tree; citation: Citation }) {
  if (citation.sourceId) {
    const src = tree.sources[citation.sourceId];
    const text = [src?.title, citation.page, citation.text].filter(Boolean).join(' · ');
    return (
      <span className="src-text">
        <Linked text={text} />
      </span>
    );
  }
  const { text, url } = sourceParts(citation);
  const href = safeHref(url);
  return (
    <>
      {(text || citation.text) && (
        <span className="src-text">
          <Linked text={[text, citation.text].filter(Boolean).join(' · ')} />
        </span>
      )}
      {href && (
        <a className="src-link own-line" href={href} title={href} target="_blank" rel="noopener noreferrer">
          {shortLink(href)} ↗
        </a>
      )}
    </>
  );
}

interface SourceListProps {
  tree: Tree;
  lang: Lang;
  rows: SourceRow[];
  readOnly?: boolean;
  /** Add (`at` null), replace, or remove (`next` null) a source. */
  onChange(at: SourceAt | null, next: Citation | null): void;
}

/** The person's sources: each one readable, a written one editable, any one removable, and a form to add one. */
export function SourceList({ tree, lang, rows, readOnly, onChange }: SourceListProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const form = (initial: Citation | undefined, submitLabel: string, done: (c: Citation) => void) => {
    const parts = initial ? sourceParts(initial) : { text: '', url: '' };
    return (
      <LinkForm
        lang={lang}
        initial={{ title: parts.text, url: parts.url, note: initial?.notes.join('\n') }}
        titleLabel={t(lang, 'sourceText')}
        titlePlaceholder={t(lang, 'sourceTextPlaceholder')}
        urlLabel={t(lang, 'sourceUrl')}
        withNote={!!initial?.notes.length}
        submitLabel={submitLabel}
        onSubmit={(v) => {
          const next = writtenSource(v.title, v.url, v.note ? [v.note] : []);
          done(initial?.text ? { ...next, text: initial.text } : next);
          setEditing(null);
        }}
        onCancel={() => setEditing(null)}
      />
    );
  };
  return (
    <>
      {rows.length === 0 && editing !== 'new' && <p className="muted small">{t(lang, 'noSourcesYet')}</p>}
      <ul className="sources">
        {rows.map((r) =>
          editing === r.key ? (
            <li key={r.key} className="source editing">
              {form(r.citation, t(lang, 'save'), (c) => onChange(r.at, c))}
            </li>
          ) : (
            <li key={r.key} className="source">
              {r.label && <span className="src-label">{r.label}</span>}
              <SourceView tree={tree} citation={r.citation} />
              {r.citation.notes.map((n, i) => (
                <span key={i} className="src-note">
                  <Linked text={n} />
                </span>
              ))}
              {!readOnly && (
                <div className="row doc-actions">
                  {/* A register shared with other people is renamed in its own record, not from one person's list. */}
                  {!r.citation.sourceId && (
                    <button type="button" className="btn small subtle" onClick={() => setEditing(r.key)}>
                      {t(lang, 'edit')}
                    </button>
                  )}
                  <button type="button" className="btn small subtle danger-text" onClick={() => onChange(r.at, null)}>
                    {t(lang, 'delete')}
                  </button>
                </div>
              )}
            </li>
          ),
        )}
        {editing === 'new' && <li className="source editing">{form(undefined, t(lang, 'addSource'), (c) => onChange(null, c))}</li>}
      </ul>
      {!readOnly && editing !== 'new' && (
        <div className="row small-actions">
          <button type="button" className="btn small" onClick={() => setEditing('new')}>
            + {t(lang, 'addSource')}
          </button>
        </div>
      )}
    </>
  );
}

interface TabProps {
  tree: Tree;
  person: Individual;
  lang: Lang;
  readOnly?: boolean;
  isDraft?: boolean;
  sources: SourceRow[];
  onSaveSource(at: SourceAt | null, next: Citation | null): void;
  onSaveDocument(media: MediaObject): void;
  onDeleteDocument(mediaId: string): void;
  onError(message: string): void;
}

/** The person's Documents tab: their files, then their sources. */
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
      <section>
        <h3 className="band">{t(lang, 'sources')}</h3>
        <SourceList tree={tree} lang={lang} rows={sources} readOnly={readOnly || isDraft} onChange={p.onSaveSource} />
      </section>
    </>
  );
}
