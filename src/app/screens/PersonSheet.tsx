/**
 * The person sheet on paper: what `personSheet` decided to say, laid out in
 * blocks, measured at the paper's real size and dealt onto pages.
 *
 * The app paginates, not the browser, so that nothing but the sheet prints. The
 * charts' rule holds here too: a page with no margin leaves the browser no room
 * for its own header and footer (the address, the date), which a sheet sent to a
 * relative should not carry — and with no page margin, a second page could not
 * have a top margin of its own either. So the blocks are first laid out once, off
 * screen, at paper size; the text is set smaller, down to 85 %, if that keeps the
 * sheet on one page; only then are the blocks packed onto as many pages as they
 * take, each page a box of its own like the poster's sheets.
 *
 * Everything written comes from the tree and goes through React as text, never as
 * markup: notes, places and leads arrive in files imported from elsewhere.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { t, tf, type Lang } from '@/i18n';
import { localeOf } from '@/app/lib/format';
import { fitScale, packPages, type MeasuredBlock } from '@/print/pack';
import type { ChildRow, Mention, ParentCouple, PersonSheet, SheetEvent, SheetLead, SiblingRow, UnionBlock } from '@/print/sheet';
import { safeHref } from '@/app/screens/Leads';

export type SheetPaper = 'a4' | 'letter';
export interface SheetLayout {
  pages: number;
  /** How far the text was set down to keep the sheet on one page: 1 when it was not. */
  fit: number;
}

/** Paper in millimetres. */
export const SHEET_PAPER: Record<SheetPaper, { w: number; h: number }> = {
  a4: { w: 210, h: 297 },
  letter: { w: 215.9, h: 279.4 },
};
/** The page's top and bottom margins, in millimetres: the running head and the footer live in them. The sides are in the stylesheet. */
const TOP = 12;
const BOTTOM = 16;
/** Left free at the foot of every page, so that a line breaking a little differently in print cannot push a block off it. */
const SPARE = 2;

interface Block {
  key: string;
  /** Class names after `ps-`: what the block is, for the stylesheet. */
  kinds: string[];
  /** Never the last block on a page: a section title, a union's header. */
  keep: boolean;
  /** The first row under a title: no rule above it. */
  first: boolean;
  node: ReactNode;
}

interface Props {
  sheet: PersonSheet;
  lang: Lang;
  paper: SheetPaper;
  treeName: string;
  /** The subject's portrait, ready to draw: none when there is none to show or it is left off. */
  photo?: string;
  /** The day the sheet is printed, already written out. */
  date: string;
  discreet: boolean;
  onLayout(layout: SheetLayout): void;
  /** Holds the drawn pages, for the PDF to be made from. */
  pagesRef?: RefObject<HTMLDivElement | null>;
}

export function PersonSheetView({ sheet, lang, paper, treeName, photo, date, discreet, onLayout, pagesRef }: Props) {
  const blocks = useMemo(() => blocksOf(sheet, lang, { photo, treeName, date }), [sheet, lang, photo, treeName, date]);
  const size = SHEET_PAPER[paper];
  const measure = useRef<HTMLDivElement>(null);
  // Fonts arrive after the first layout; the sheet is measured again once they have, or the breaks are a guess.
  const [fonts, setFonts] = useState(0);
  useEffect(() => {
    const set = typeof document !== 'undefined' ? document.fonts : undefined;
    if (!set) return;
    let alive = true;
    const again = () => alive && setFonts((n) => n + 1);
    void set.ready.then(again);
    set.addEventListener('loadingdone', again);
    return () => {
      alive = false;
      set.removeEventListener('loadingdone', again);
    };
  }, []);
  const [layout, setLayout] = useState<{ blocks: Block[]; fit: number; pages: number[][] } | null>(null);
  useLayoutEffect(() => {
    const page = measure.current?.querySelector<HTMLElement>('.ps-page');
    if (page) setLayout({ blocks, ...paginate(page, size, blocks.length) });
  }, [blocks, size, fonts]);
  const current = layout && layout.blocks === blocks ? layout : { blocks, fit: 1, pages: [blocks.map((_, i) => i)] };
  useEffect(() => onLayout({ pages: current.pages.length, fit: current.fit }), [current.pages.length, current.fit, onLayout]);

  const name = fullName(sheet, lang);
  const notices = [discreet ? t(lang, 'sheetFootDiscreet') : '', sheet.counts.private ? t(lang, 'sheetFootPrivate') : ''];
  const foot = [`${t(lang, 'sheetMadeWith')}.`, ...notices].filter(Boolean).join(' ');
  const total = current.pages.length;

  return (
    <>
      <div ref={measure} className="ps-measure" aria-hidden="true" style={{ width: `${size.w}mm` }}>
        <div className="ps-page" style={{ '--paper-w': size.w } as CSSProperties}>
          <div className="ps-flow">{blocks.map(draw)}</div>
        </div>
      </div>
      <div ref={pagesRef} className="ps-pages">
        {current.pages.map((indices, p) => (
          <div key={p} className="print-sheet portrait person-page" style={{ aspectRatio: `${size.w} / ${size.h}` }} lang={lang}>
            <div className="ps-page" style={{ '--paper-w': size.w, '--fit': current.fit } as CSSProperties}>
              {p > 0 && <div className="ps-running">{tf(lang, 'sheetContinued', { name })}</div>}
              <div className="ps-flow">{indices.map((i) => current.blocks[i]).map((b) => b && draw(b))}</div>
              <footer className="ps-foot">
                <span>{foot}</span>
                {total > 1 && <span className="ps-pageno">{tf(lang, 'sheetPageOf', { n: p + 1, total })}</span>}
              </footer>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/** Lays the blocks out at each candidate size and decides the pages; a page with no width (a test, a hidden tab) gets one page. */
function paginate(page: HTMLElement, size: { w: number; h: number }, count: number): { fit: number; pages: number[][] } {
  const all = [Array.from({ length: count }, (_, i) => i)];
  const width = page.getBoundingClientRect().width;
  if (!width) return { fit: 1, pages: all };
  const room = (size.h - TOP - BOTTOM - SPARE) * (width / size.w);
  const read = (scale: number): MeasuredBlock[] => {
    page.style.setProperty('--fit', String(scale));
    return [...page.querySelectorAll<HTMLElement>('.ps-flow > .ps-block')].map((b) => {
      const style = getComputedStyle(b);
      return {
        height: b.getBoundingClientRect().height,
        lead: (parseFloat(style.paddingTop) || 0) + (parseFloat(style.borderTopWidth) || 0),
        keepWithNext: b.dataset.keep === '1',
      };
    });
  };
  const fit = fitScale(read, room);
  if (fit !== null) return { fit, pages: all };
  return { fit: 1, pages: packPages(read(1), room) };
}

function draw(b: Block) {
  return (
    <div
      key={b.key}
      className={['ps-block', ...b.kinds.map((k) => `ps-${k}`), b.first ? 'first' : ''].join(' ').trim()}
      data-keep={b.keep ? '1' : undefined}
    >
      {b.node}
    </div>
  );
}

function fullName(sheet: PersonSheet, lang: Lang): string {
  const s = sheet.subject;
  return [s.given, s.nick ? tf(lang, 'sheetNick', { nick: s.nick }) : '', s.surname].filter(Boolean).join(' ') || '?';
}

function blocksOf(sheet: PersonSheet, lang: Lang, o: { photo?: string; treeName: string; date: string }): Block[] {
  const out: Block[] = [];
  const add = (key: string, kinds: string[], node: ReactNode, keep = false, first = false) => out.push({ key, kinds, node, keep, first });
  const title = (key: string, text: string) =>
    add(
      `title-${key}`,
      ['title'],
      <h3 className="ps-h">
        <span className="ps-h-bar" />
        {text}
        <span className="ps-h-rule" />
      </h3>,
      true,
    );

  add('head', ['head'], <Head sheet={sheet} lang={lang} {...o} />);
  if (sheet.parents.length) {
    title('parents', t(lang, 'parents'));
    sheet.parents.forEach((c, i) => add(`parents-${c.familyId}`, ['parents'], <Parents couple={c} lang={lang} />, false, i === 0));
  }
  if (sheet.siblings.length) {
    title('siblings', t(lang, 'siblings'));
    sheet.siblings.forEach((s, i) =>
      add(
        `sibling-${s.id}`,
        ['rel', 'sib', ...(s.self ? ['self'] : [])],
        <Row r={s} lang={lang} next={t(lang, 'children')} />,
        false,
        i === 0,
      ),
    );
  }
  if (sheet.unions.length) {
    title('unions', t(lang, 'sheetUnions'));
    sheet.unions.forEach((u, i) => {
      add(
        `union-${u.familyId}`,
        ['union'],
        <UnionHead u={u} n={sheet.unions.length > 1 ? i + 1 : undefined} lang={lang} />,
        u.children.length > 0,
        i === 0,
      );
      u.children.forEach((k, j) =>
        add(`child-${u.familyId}-${k.id}`, ['rel', 'kid'], <Row r={k} lang={lang} next={t(lang, 'sheetGrandchildren')} />, false, j === 0),
      );
    });
  }
  if (sheet.events.length) {
    title('events', t(lang, 'events'));
    sheet.events.forEach((e, i) => add(`event-${e.key}`, ['event'], <EventRow e={e} />, false, i === 0));
  }
  if (sheet.notes.length) {
    title('notes', t(lang, 'notes'));
    sheet.notes.forEach((n, i) => add(`note-${i}`, ['note'], <p>{n}</p>, false, i === 0));
  }
  if (sheet.sources.length || sheet.documents.length) {
    title('sources', t(lang, 'sources'));
    sheet.sources.forEach((s, i) =>
      add(
        `source-${s.n}`,
        ['item', 'source'],
        <>
          <span className="ps-mark">{s.n}</span>
          <span>
            <strong>{s.about.join(', ')}.</strong> {s.text}
          </span>
        </>,
        false,
        i === 0,
      ),
    );
    if (sheet.documents.length) {
      add('documents', ['subtitle'], <h4>{t(lang, 'tabDocuments')}</h4>, true, !sheet.sources.length);
      sheet.documents.forEach((d, i) =>
        add(
          `document-${d.id}`,
          ['item', 'document'],
          <>
            <span className="ps-mark" />
            <span>
              <strong>{d.title}</strong>
              {d.detail && `, ${d.detail}`}
            </span>
          </>,
          false,
          i === 0,
        ),
      );
    }
  }
  const { open, done } = sheet.leads;
  if (open.length || done.length) {
    title('leads', t(lang, 'sheetLeads'));
    const group = (key: string, heading: string, leads: SheetLead[], finished: boolean, first: boolean) => {
      if (!leads.length) return;
      add(`leads-${key}`, ['subtitle'], <h4>{heading}</h4>, true, first);
      leads.forEach((l, i) => add(`lead-${l.id}`, ['item', 'lead', ...(finished ? ['done'] : [])], <LeadRow l={l} />, false, i === 0));
    };
    group('open', t(lang, 'sheetToFind'), open, false, true);
    group('done', t(lang, 'sheetFound'), done, true, !open.length);
  }
  return out;
}

function Head({ sheet, lang, photo, treeName, date }: { sheet: PersonSheet; lang: Lang; photo?: string; treeName: string; date: string }) {
  const s = sheet.subject;
  return (
    <header>
      <div className="ps-kicker">
        <span>{t(lang, 'chartSheet')}</span>
        <span>{tf(lang, 'sheetTreeDated', { name: treeName, date })}</span>
      </div>
      <div className={`ps-id${photo ? ' with-photo' : ''}`}>
        {photo && (
          <span className="ps-portrait">
            <img src={photo} alt="" />
          </span>
        )}
        <div className="ps-id-text">
          <h2 className="ps-fullname">
            {[s.given, s.nick ? tf(lang, 'sheetNick', { nick: s.nick }) : ''].filter(Boolean).join(' ')}{' '}
            <span className="ps-surname">{s.surname || (s.given ? '' : '?')}</span>
            {s.unsure && <span className="ps-tag warn">{t(lang, 'unsure')}</span>}
          </h2>
          {s.occupation && <p className="ps-occupation">{s.occupation}</p>}
          {(s.lines.length > 0 || s.filiation || s.otherNames) && (
            <div className="ps-life">
              {s.lines.map((l, i) => (
                <p key={i}>{l}</p>
              ))}
              {s.filiation && <p className="ps-quiet">{s.filiation}</p>}
              {s.otherNames && <p className="ps-quiet">{s.otherNames}</p>}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function Tags({ tag, unsure, lang }: { tag?: string; unsure: boolean; lang: Lang }) {
  return (
    <>
      {tag && <span className="ps-tag">{tag}</span>}
      {unsure && <span className="ps-tag warn">{t(lang, 'unsure')}</span>}
    </>
  );
}

function Parents({ couple, lang }: { couple: ParentCouple; lang: Lang }) {
  return (
    <>
      <div className="ps-couple">
        {couple.slots.map((slot, i) => (
          <div key={i} className={`ps-parent ${i === 0 ? 'paternal' : 'maternal'}${slot.person ? '' : ' unknown'}`}>
            <span className="ps-role">{slot.role}</span>
            <span className="ps-who">
              {slot.person ? slot.person.name : slot.unknown}
              {slot.person && <Tags tag={slot.person.tag} unsure={slot.person.unsure} lang={lang} />}
            </span>
            {slot.person?.occupation && <span className="ps-occ">{slot.person.occupation}</span>}
            {slot.person?.facts.map((f, k) => (
              <span key={k} className="ps-facts">
                {f}
              </span>
            ))}
          </div>
        ))}
      </div>
      {couple.union.map((line) => (
        <p key={line} className="ps-couple-union">
          {line}
        </p>
      ))}
    </>
  );
}

/** « Claire AUBRY (née en 1976), Thomas AUBRY (né en 1979) et Sophie AUBRY (née en 1984) ». */
function people(list: Mention[], lang: Lang): string {
  const names = list.map((m) => (m.life ? `${m.name} (${m.life})` : m.name));
  return new Intl.ListFormat(localeOf(lang), { style: 'long', type: 'conjunction' }).format(names);
}

/** One sentence a line, so that nothing has to stand between them. */
function Lines({ lines, className }: { lines: string[]; className?: string }) {
  return (
    <>
      {lines.map((line, i) => (
        <span key={i} className={className ? `ps-line ${className}` : 'ps-line'}>
          {line}
        </span>
      ))}
    </>
  );
}

/** A sibling or a child: the name, then their dates, their unions and the next generation, a line each. */
function Row({ r, lang, next }: { r: SiblingRow | ChildRow; lang: Lang; next: string }) {
  return (
    <>
      <span className="ps-name">
        {r.name}
        <Tags tag={r.tag} unsure={r.unsure} lang={lang} />
      </span>
      <span className="ps-facts">
        <Lines lines={r.facts} />
        <Lines lines={r.unions} className="ps-spouse" />
        {r.children.length > 0 && (
          <span className="ps-line ps-next">
            <span className="ps-label">{next}</span>
            {people(r.children, lang)}
          </span>
        )}
      </span>
    </>
  );
}

function UnionHead({ u, n, lang }: { u: UnionBlock; n?: number; lang: Lang }) {
  const known = [u.partner?.occupation, ...(u.partner?.facts ?? [])].filter((l): l is string => !!l);
  return (
    <>
      <span className="ps-n">{n ?? ''}</span>
      <span className="ps-partner">
        <span className={`ps-name${u.partner ? '' : ' unknown'}`}>
          {u.partner ? u.partner.name : u.unknownPartner}
          {u.partner && <Tags tag={u.partner.tag} unsure={u.partner.unsure} lang={lang} />}
        </span>
        <Lines lines={u.union} className="ps-uline" />
      </span>
      <span className="ps-facts">
        <Lines lines={known} />
      </span>
    </>
  );
}

function EventRow({ e }: { e: SheetEvent }) {
  const refs = e.refs.length > 0 && <sup className="ps-ref">{e.refs.join(', ')}</sup>;
  return (
    <>
      <span className="ps-date">{e.date}</span>
      <span className="ps-what">
        {e.label}
        {e.lines.length === 0 && refs}
      </span>
      <span className="ps-detail">
        {e.lines.map((l, i) => (
          <span key={i} className={i ? 'ps-more' : undefined}>
            {l}
            {i === 0 && refs}
          </span>
        ))}
      </span>
    </>
  );
}

function LeadRow({ l }: { l: SheetLead }) {
  const href = safeHref(l.url);
  return (
    <>
      <span className="ps-mark" />
      <span>
        <strong>{l.title}</strong>
        {l.note && <span className="ps-lead-note">{l.note}</span>}
        {href && (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {href.replace(/^https?:\/\//, '').replace(/\/$/, '')}
          </a>
        )}
      </span>
    </>
  );
}
