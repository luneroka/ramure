import { useMemo, useState } from 'react';
import { displayName, findEvent, type Tree } from '../gedcom/model';
import { t, type Lang } from '../i18n';

interface Props {
  tree: Tree;
  lang: Lang;
  /** Ids that must not be offered. */
  exclude?: string[];
  onPick(id: string): void;
  onCancel(): void;
  hint?: string;
}

/** Small search box that resolves to one person. */
export function PersonPicker({ tree, lang, exclude = [], onPick, onCancel, hint }: Props) {
  const [q, setQ] = useState('');
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 1) return [];
    const ex = new Set(exclude);
    return Object.values(tree.individuals)
      .filter((i) => !ex.has(i.id) && displayName(i).toLowerCase().includes(s))
      .slice(0, 10);
  }, [q, tree, exclude]);
  return (
    <div className="picker">
      {hint && <p className="muted small">{hint}</p>}
      <input
        autoFocus
        type="search"
        value={q}
        placeholder={t(lang, 'pickPerson')}
        aria-label={t(lang, 'pickPerson')}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
          if (e.key === 'Enter' && matches[0]) onPick(matches[0].id);
        }}
      />
      <ul className="people picker-results">
        {matches.map((m) => {
          const b = findEvent(m.events, 'birth')?.date?.date?.year,
            d = findEvent(m.events, 'death')?.date?.date?.year;
          return (
            <li key={m.id}>
              <button className="link-person" onClick={() => onPick(m.id)}>
                <span className={`sex-dot ${m.sex}`} aria-hidden="true" />
                <span className="link-name">{displayName(m)}</span>
                {(b || d) && <span className="link-years">{[b, d].filter(Boolean).join('–')}</span>}
              </button>
            </li>
          );
        })}
        {q.trim() && matches.length === 0 && <li className="muted small">{t(lang, 'noMatch')}</li>}
      </ul>
      <div className="row">
        <button className="btn" onClick={onCancel}>
          {t(lang, 'cancel')}
        </button>
      </div>
    </div>
  );
}
