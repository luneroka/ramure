/**
 * The Recherches tab: the person's own leads first (what is left to find),
 * then one button that opens the big record collections with the name and
 * years filled in.
 */

import { useState } from 'react';
import type { Individual, Lead } from '../gedcom/model';
import { t, type Lang } from '../i18n';
import { searchLinks } from '../research/links';
import { newId } from '../tree/ids';

interface Props {
  person: Individual;
  lang: Lang;
  readOnly?: boolean;
  onSaveLeads(leads: Lead[]): void;
  onNotice(message: string): void;
}

/** Only web and mail addresses are kept; anything else (javascript:, data:, file:) becomes nothing. */
export function normalizeUrl(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  return safeHref(withScheme);
}

/** The address if it is http, https or mailto, else an empty string: what an <a> may point at. */
export function safeHref(url: string | undefined): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:' ? u.href : '';
  } catch {
    return '';
  }
}

/** Add / edit form for a lead or a resource. */
export function LeadForm({
  lang,
  initial,
  titleLabel,
  urlLabel,
  withNote,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  lang: Lang;
  initial?: Partial<Lead>;
  titleLabel: string;
  urlLabel: string;
  withNote?: boolean;
  submitLabel: string;
  onSubmit(values: { title: string; url: string; note: string }): void;
  onCancel(): void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  return (
    <form
      className="doc-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim() && !url.trim()) return;
        onSubmit({ title: title.trim() || normalizeUrl(url), url: normalizeUrl(url), note: note.trim() });
      }}
    >
      <label className="field">
        {titleLabel}
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t(lang, 'leadTitlePlaceholder')} autoFocus />
      </label>
      <label className="field">
        {urlLabel}
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" inputMode="url" />
      </label>
      {withNote && (
        <label className="field">
          {t(lang, 'leadNote')}
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      )}
      <div className="row small-actions">
        <button type="submit" className="btn small primary" disabled={!title.trim() && !url.trim()}>
          {submitLabel}
        </button>
        <button type="button" className="btn small subtle" onClick={onCancel}>
          {t(lang, 'cancel')}
        </button>
      </div>
    </form>
  );
}

export function LeadsTab(p: Props) {
  const { person, lang, readOnly } = p;
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const leads = person.leads ?? [];
  const links = searchLinks(person);
  const open = leads.filter((l) => !l.done);
  const done = leads.filter((l) => l.done);

  const replace = (next: Lead[]) => p.onSaveLeads(next);
  const launch = () => {
    let blocked = false;
    for (const l of links) {
      const w = window.open(l.url, '_blank', 'noopener');
      if (!w) blocked = true;
    }
    if (blocked) p.onNotice(t(lang, 'popupBlocked'));
  };

  const row = (l: Lead) =>
    editingId === l.id ? (
      <li key={l.id} className="lead editing">
        <LeadForm
          lang={lang}
          initial={l}
          titleLabel={t(lang, 'leadTitle')}
          urlLabel={t(lang, 'leadUrl')}
          withNote
          submitLabel={t(lang, 'save')}
          onSubmit={(v) => {
            replace(leads.map((x) => (x.id === l.id ? { ...x, title: v.title, url: v.url, note: v.note || undefined } : x)));
            setEditingId(null);
          }}
          onCancel={() => setEditingId(null)}
        />
      </li>
    ) : (
      <li key={l.id} className={`lead ${l.done ? 'done' : ''}`}>
        <label className="lead-check">
          <input
            type="checkbox"
            checked={!!l.done}
            disabled={readOnly}
            onChange={(e) => replace(leads.map((x) => (x.id === l.id ? { ...x, done: e.target.checked || undefined } : x)))}
            title={t(lang, l.done ? 'leadReopen' : 'leadDone')}
          />
        </label>
        <div className="lead-body">
          {safeHref(l.url) ? (
            <a className="lead-title" href={safeHref(l.url)} target="_blank" rel="noopener noreferrer">
              {l.title}
            </a>
          ) : (
            <span className="lead-title">{l.title}</span>
          )}
          {l.note && <p className="lead-note">{l.note}</p>}
          {!readOnly && (
            <div className="row doc-actions">
              <button type="button" className="btn small subtle" onClick={() => setEditingId(l.id)}>
                {t(lang, 'edit')}
              </button>
              <button type="button" className="btn small subtle danger-text" onClick={() => replace(leads.filter((x) => x.id !== l.id))}>
                {t(lang, 'delete')}
              </button>
            </div>
          )}
        </div>
      </li>
    );

  return (
    <>
      <section>
        <h3 className="band">{t(lang, 'leads')}</h3>
        {leads.length === 0 && !adding && <p className="muted small">{t(lang, 'noLeadsYet')}</p>}
        <ul className="lead-list">
          {open.map(row)}
          {done.map(row)}
          {adding && (
            <li className="lead editing">
              <LeadForm
                lang={lang}
                titleLabel={t(lang, 'leadTitle')}
                urlLabel={t(lang, 'leadUrl')}
                withNote
                submitLabel={t(lang, 'addLead')}
                onSubmit={(v) => {
                  replace([...leads, { id: newId('L'), title: v.title, url: v.url, note: v.note || undefined }]);
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
              + {t(lang, 'addLead')}
            </button>
          </div>
        )}
      </section>
      <section>
        <h3 className="band">{t(lang, 'externalSearch')}</h3>
        {links.length === 0 ? (
          <p className="muted small">{t(lang, 'noNameNoSearch')}</p>
        ) : (
          <>
            <div className="search-links">
              {links.map((l) => (
                <a key={l.id} className="chip" href={l.url} target="_blank" rel="noopener noreferrer">
                  {l.label} ↗
                </a>
              ))}
            </div>
            <div className="row small-actions">
              <button type="button" className="btn small primary" onClick={launch}>
                {t(lang, 'launchSearch')}
              </button>
            </div>
          </>
        )}
      </section>
    </>
  );
}
