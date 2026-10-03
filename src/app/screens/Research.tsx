/**
 * The Recherches tab: the big record collections, opened with the person's
 * name and years filled in. What was found goes into the Documents tab, as a
 * file or as a source.
 */

import type { Individual } from '@/gedcom/model';
import { t, type Lang } from '@/i18n';
import { searchLinks } from '@/research/links';

interface Props {
  person: Individual;
  lang: Lang;
  onNotice(message: string): void;
}

export function ResearchTab({ person, lang, onNotice }: Props) {
  const links = searchLinks(person);
  const launch = () => {
    let blocked = false;
    for (const l of links) {
      const w = window.open(l.url, '_blank', 'noopener');
      if (!w) blocked = true;
    }
    if (blocked) onNotice(t(lang, 'popupBlocked'));
  };
  return (
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
  );
}
