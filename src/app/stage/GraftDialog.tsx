/**
 * What a GEDCOM file would add to the open tree, shown before anything is
 * written: the new people, what known people gain, and where the file says
 * otherwise than the tree — which is only listed, since the tree wins.
 */

import type { ReactNode } from 'react';
import { formatDate } from '@/gedcom/dates';
import { displayName, type EventType, type Sex, type Tree } from '@/gedcom/model';
import { eventLabel, t, tf, tn, type Lang, type StringKey } from '@/i18n';
import type { Difference, Fact, GraftPlan } from '@/tree/graft';
import { lifeYears, localeOf } from '@/app/lib/format';
import { useUi } from '@/app/ui/UiContext';
import { useDialog } from '@/app/ui/useDialog';

/** Long lists stop here: the count above them says how many there are, and the rest would only scroll. */
const SHOWN = 100;

const FACTS: Record<Exclude<Fact['kind'], 'event'>, StringKey> = {
  name: 'factName',
  sex: 'factSex',
  note: 'factNote',
  source: 'factSource',
  media: 'factMedia',
  restriction: 'factRestriction',
  lead: 'factLead',
  parents: 'factParents',
  partner: 'factPartner',
  child: 'factChild',
  union: 'factUnion',
};

function eventText(lang: Lang, type: EventType, customType?: string): string {
  return type === 'custom' && customType ? customType : eventLabel(lang, type).toLocaleLowerCase(localeOf(lang));
}

const factText = (lang: Lang, f: Fact): string => (f.kind === 'event' ? eventText(lang, f.event, f.customType) : t(lang, FACTS[f.kind]));

const personName = (tree: Tree, id: string): string => {
  const p = tree.individuals[id];
  return p ? displayName(p) : '?';
};

function together(lang: Lang, names: string[]): string {
  const [a, b] = names;
  return a !== undefined && b !== undefined ? tf(lang, 'graftCouple', { a, b }) : (a ?? '?');
}

function coupleName(lang: Lang, tree: Tree, familyId: string): string {
  const f = tree.families[familyId];
  return together(
    lang,
    [f?.husbandId, f?.wifeId].filter((id): id is string => !!id).map((id) => personName(tree, id)),
  );
}

const sexText = (lang: Lang, s: Sex): string => t(lang, s === 'M' ? 'male' : s === 'F' ? 'female' : 'unknownSex');

function differenceText(lang: Lang, d: Difference): string {
  switch (d.what) {
    case 'name':
      return tf(lang, 'graftDiff', { what: t(lang, 'graftWhatName'), tree: d.inTree, file: d.inFile });
    case 'sex':
      return tf(lang, 'graftDiff', { what: t(lang, 'graftWhatSex'), tree: sexText(lang, d.inTree), file: sexText(lang, d.inFile) });
    case 'date':
      return tf(lang, 'graftDiff', {
        what: eventText(lang, d.event, d.customType),
        tree: formatDate(d.inTree, lang),
        file: formatDate(d.inFile, lang),
      });
    case 'place':
      return tf(lang, 'graftDiff', {
        what: tf(lang, 'graftWhatPlace', { event: eventText(lang, d.event, d.customType) }),
        tree: d.inTree,
        file: d.inFile,
      });
    case 'parents':
      return tf(lang, 'graftDiffParents', { names: together(lang, d.inFile) });
  }
}

interface Props {
  file: string;
  plan: GraftPlan;
  onApply(): void;
  onClose(): void;
}

export function GraftDialog({ file, plan, onApply, onClose }: Props) {
  const { lang } = useUi();
  const ref = useDialog<HTMLDivElement>(true, onClose);
  const { tree } = plan;
  const nothing = !plan.op;
  const rows = <T,>(items: T[], key: (x: T, i: number) => string, who: (x: T) => string, what: (x: T) => string): ReactNode => (
    <ul className="graft-list">
      {items.slice(0, SHOWN).map((x, i) => (
        <li key={key(x, i)}>
          <span className="graft-who">{who(x)}</span>
          {what(x) && <span className="muted small"> · {what(x)}</span>}
        </li>
      ))}
      {items.length > SHOWN && <li className="muted small">{tf(lang, 'graftMore', { n: items.length - SHOWN })}</li>}
    </ul>
  );
  const added = [...plan.added].sort((a, b) => personName(tree, a).localeCompare(personName(tree, b), localeOf(lang)));
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        ref={ref}
        className="dialog graft"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t(lang, 'graftTitle')}
      >
        <div className="report-head">
          <strong>{t(lang, 'graftTitle')}</strong>
          <span className="muted graft-file">{file}</span>
          <button className="icon-btn" onClick={onClose} aria-label={t(lang, 'close')}>
            ×
          </button>
        </div>
        <p className="muted small">{tn(lang, 'graftRecognised', plan.recognised)}</p>
        {nothing && <p>{t(lang, 'graftNothing')}</p>}
        {added.length > 0 && (
          <details className="graft-section" open>
            <summary>{tn(lang, 'graftAddedCount', added.length)}</summary>
            {rows(
              added,
              (id) => id,
              (id) => personName(tree, id),
              (id) => {
                const p = tree.individuals[id];
                return p ? lifeYears(lang, p) : '';
              },
            )}
          </details>
        )}
        {plan.completed.length > 0 && (
          <details className="graft-section" open>
            <summary>{tn(lang, 'graftCompletedCount', plan.completed.length)}</summary>
            {rows(
              plan.completed,
              (c) => c.id,
              (c) => personName(tree, c.id),
              (c) => c.facts.map((f) => factText(lang, f)).join(', '),
            )}
          </details>
        )}
        {plan.unions.length > 0 && (
          <details className="graft-section">
            <summary>{tn(lang, 'graftUnionsCount', plan.unions.length)}</summary>
            {rows(
              plan.unions,
              (c) => c.id,
              (c) => coupleName(lang, tree, c.id),
              (c) => c.facts.map((f) => factText(lang, f)).join(', '),
            )}
          </details>
        )}
        {plan.differences.length > 0 && (
          <details className="graft-section" open>
            <summary>{tn(lang, 'graftDifferencesCount', plan.differences.length)}</summary>
            <p className="muted small">{t(lang, 'graftDifferencesHint')}</p>
            {rows(
              plan.differences,
              (_d, i) => String(i),
              (d) => ('person' in d.subject ? personName(tree, d.subject.person) : coupleName(lang, tree, d.subject.family)),
              (d) => differenceText(lang, d),
            )}
          </details>
        )}
        {plan.setAside > 0 && <p className="muted small">{tn(lang, 'graftSetAside', plan.setAside)}</p>}
        {!nothing && <p className="muted small">{t(lang, 'graftSafety')}</p>}
        <div className="row modal-actions">
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            {t(lang, nothing ? 'close' : 'cancel')}
          </button>
          {!nothing && (
            <button className="btn primary" onClick={onApply}>
              {t(lang, 'graftApply')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
