/**
 * The small form for something with a name and an address: a person's source,
 * a link on the Ressources page. Either field alone is enough; the address is
 * kept only if it is a web or mail one (`normalizeUrl`).
 */

import { useState } from 'react';
import { t, type Lang } from '@/i18n';
import { normalizeUrl } from '@/app/lib/urls';

export interface LinkValues {
  title: string;
  url: string;
  note: string;
}

export function LinkForm({
  lang,
  initial,
  titleLabel,
  titlePlaceholder,
  urlLabel,
  withNote,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  lang: Lang;
  initial?: Partial<LinkValues>;
  titleLabel: string;
  titlePlaceholder?: string;
  urlLabel: string;
  withNote?: boolean;
  submitLabel: string;
  onSubmit(values: LinkValues): void;
  onCancel(): void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const empty = !title.trim() && !url.trim();
  return (
    <form
      className="doc-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!empty) onSubmit({ title: title.trim(), url: normalizeUrl(url), note: note.trim() });
      }}
    >
      <label className="field">
        {titleLabel}
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={titlePlaceholder} maxLength={500} autoFocus />
      </label>
      <label className="field">
        {urlLabel}
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" inputMode="url" maxLength={2000} />
      </label>
      {withNote && (
        <label className="field">
          {t(lang, 'linkNote')}
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
        </label>
      )}
      <div className="row small-actions">
        <button type="submit" className="btn small primary" disabled={empty}>
          {submitLabel}
        </button>
        <button type="button" className="btn small subtle" onClick={onCancel}>
          {t(lang, 'cancel')}
        </button>
      </div>
    </form>
  );
}
