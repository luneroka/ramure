/** Find a person by name; accent- and case-insensitive. Enter picks the first match. */

import { useMemo, useState } from 'react';
import { displayName, type Tree } from '@/gedcom/model';
import { t, type Lang } from '@/i18n';
import { fold } from '@/util/text';

interface Props {
  tree: Tree;
  lang: Lang;
  open: boolean;
  onOpenChange(open: boolean): void;
  onPick(id: string): void;
}

export function SearchBox({ tree, lang, open, onOpenChange, onPick }: Props) {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => {
    if (query.trim().length < 2) return [];
    const q = fold(query);
    return Object.values(tree.individuals)
      .filter((i) => fold(displayName(i)).includes(q))
      .slice(0, 8);
  }, [tree, query]);
  const pick = (id: string) => {
    onPick(id);
    setQuery('');
    onOpenChange(false);
  };
  return (
    <div className={`search ${open ? 'open' : ''}`}>
      <input
        type="search"
        value={query}
        placeholder={t(lang, 'search')}
        aria-label={t(lang, 'search')}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && matches[0]) pick(matches[0].id);
          if (e.key === 'Escape') {
            setQuery('');
            onOpenChange(false);
          }
        }}
      />
      {matches.length > 0 && (
        <ul className="search-results" role="listbox">
          {matches.map((m) => (
            <li key={m.id}>
              <button onClick={() => pick(m.id)}>{displayName(m)}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
