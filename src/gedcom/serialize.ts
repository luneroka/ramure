/**
 * Ramure model → GEDCOM 5.5.1 text.
 *
 * Structured sources, repositories, coordinates, pedigree, restrictions and
 * media are all written back, so a Ramure → Ramure round trip is lossless.
 * Long values are split with CONC/CONT at a safe width for readers that still
 * enforce 255-character lines.
 */

import { formatGedcomDate } from './dates';
import type { Citation, Event, Family, Individual, Lead, MediaObject, Name, Place, Repository, Source, Tree } from './model';
import type { GedcomRecord } from './tokenizer';

const MAX_LINE = 248;

const EVENT_TAG_BY_TYPE: Record<string, string> = {
  birth: 'BIRT',
  baptism: 'CHR',
  death: 'DEAT',
  burial: 'BURI',
  cremation: 'CREM',
  adoption: 'ADOP',
  marriage: 'MARR',
  divorce: 'DIV',
  engagement: 'ENGA',
  'marriage-banns': 'MARB',
  annulment: 'ANUL',
  occupation: 'OCCU',
  residence: 'RESI',
  census: 'CENS',
  education: 'EDUC',
  religion: 'RELI',
  retirement: 'RETI',
  emigration: 'EMIG',
  immigration: 'IMMI',
  naturalization: 'NATU',
  probate: 'PROB',
  will: 'WILL',
  graduation: 'GRAD',
  confirmation: 'CONF',
  'first-communion': 'FCOM',
  title: 'TITL',
  description: 'DSCR',
  custom: 'EVEN',
};

class Writer {
  private lines: string[] = [];

  line(level: number, tag: string, value = '', xref?: string): void {
    const head = xref ? `${level} ${xref} ${tag}` : `${level} ${tag}`;
    const parts = value.split('\n');
    for (let i = 0; i < parts.length; i++) {
      let chunk = parts[i]!;
      let t = i === 0 ? head : `${level + 1} CONT`;
      // Split overlong chunks with CONC, never at a leading/trailing space boundary that would be trimmed.
      while (chunk.length > MAX_LINE) {
        let cut = MAX_LINE;
        while (cut > 1 && (chunk[cut] === ' ' || chunk[cut - 1] === ' ')) cut--;
        this.lines.push(`${t} ${chunk.slice(0, cut)}`.replace(/ $/, ''));
        chunk = chunk.slice(cut);
        t = `${level + 1} CONC`;
      }
      this.lines.push(chunk === '' ? t : `${t} ${chunk}`);
    }
  }

  raw(rec: GedcomRecord, level: number): void {
    this.line(level, rec.tag, rec.value, rec.xref);
    for (const c of rec.children) this.raw(c, level + 1);
  }

  toString(): string {
    return this.lines.join('\n') + '\n';
  }
}

const ptr = (id: string): string => `@${id}@`;

export interface SerializeOptions {
  /** Written to HEAD.SOUR. */
  sourceSystem?: string;
  sourceVersion?: string;
  /** Date written to HEAD.DATE; defaults to today. */
  date?: Date;
}

export function serializeGedcom(tree: Tree, options: SerializeOptions = {}): string {
  const w = new Writer();
  writeHeader(w, tree, options);
  for (const ind of Object.values(tree.individuals)) writeIndividual(w, ind);
  for (const fam of Object.values(tree.families)) writeFamily(w, fam);
  for (const s of Object.values(tree.sources)) writeSource(w, s);
  for (const r of Object.values(tree.repositories)) writeRepository(w, r);
  for (const m of Object.values(tree.media)) writeMedia(w, m);
  for (const x of tree.extra) w.raw(x, 0);
  w.line(0, 'TRLR');
  return w.toString();
}

function gedcomDate(d: Date): string {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function writeHeader(w: Writer, tree: Tree, o: SerializeOptions): void {
  w.line(0, 'HEAD');
  w.line(1, 'SOUR', o.sourceSystem ?? 'RAMURE');
  w.line(2, 'VERS', o.sourceVersion ?? '0.1.0');
  w.line(2, 'NAME', 'Ramure');
  w.line(1, 'DATE', gedcomDate(o.date ?? new Date()));
  const submitterInExtra = tree.extra.find((r) => r.tag === 'SUBM' && r.xref);
  if (submitterInExtra?.xref) w.line(1, 'SUBM', submitterInExtra.xref);
  w.line(1, 'GEDC');
  w.line(2, 'VERS', '5.5.1');
  w.line(2, 'FORM', 'LINEAGE-LINKED');
  w.line(1, 'CHAR', 'UTF-8');
  if (tree.header.language) w.line(1, 'LANG', tree.header.language);
  if (tree.header.placeFormat) {
    w.line(1, 'PLAC');
    w.line(2, 'FORM', tree.header.placeFormat);
  }
  for (const n of tree.header.notes) w.line(1, 'NOTE', n);
  writeLeads(w, 1, tree.resources ?? []);
  for (const id of tree.documentIds ?? []) if (tree.media[id]) w.line(1, '_DOC', ptr(id));
}

function writeLeads(w: Writer, level: number, leads: Lead[]): void {
  for (const l of leads) {
    w.line(level, '_LINK', l.url);
    w.line(level + 1, '_ID', l.id);
    if (l.title && l.title !== l.url) w.line(level + 1, 'TITL', l.title);
    if (l.note) w.line(level + 1, 'NOTE', l.note);
    if (l.done) w.line(level + 1, '_DONE', 'Y');
  }
}

function writeName(w: Writer, n: Name): void {
  const full = `${n.given} /${n.surname}/${n.suffix ? ' ' + n.suffix : ''}`.trim();
  w.line(1, 'NAME', full);
  if (n.type) w.line(2, 'TYPE', n.type);
  if (n.prefix) w.line(2, 'NPFX', n.prefix);
  if (n.given) w.line(2, 'GIVN', n.given);
  if (n.nick) w.line(2, 'NICK', n.nick);
  if (n.surname) w.line(2, 'SURN', n.surname);
  if (n.suffix) w.line(2, 'NSFX', n.suffix);
}

function writePlace(w: Writer, level: number, p: Place): void {
  w.line(level, 'PLAC', p.text);
  if (p.lat !== undefined || p.lon !== undefined) {
    w.line(level + 1, 'MAP');
    if (p.lat !== undefined) w.line(level + 2, 'LATI', (p.lat < 0 ? 'S' : 'N') + Math.abs(p.lat));
    if (p.lon !== undefined) w.line(level + 2, 'LONG', (p.lon < 0 ? 'W' : 'E') + Math.abs(p.lon));
  }
}

function writeCitations(w: Writer, level: number, cs: Citation[]): void {
  for (const c of cs) {
    if (c.sourceId) {
      w.line(level, 'SOUR', ptr(c.sourceId));
      if (c.page) w.line(level + 1, 'PAGE', c.page);
      if (c.quality !== undefined) w.line(level + 1, 'QUAY', String(c.quality));
      if (c.date || c.text) {
        w.line(level + 1, 'DATA');
        if (c.date) w.line(level + 2, 'DATE', formatGedcomDate(c.date));
        if (c.text) w.line(level + 2, 'TEXT', c.text);
      }
    } else {
      w.line(level, 'SOUR', c.flat ?? '');
      if (c.text) w.line(level + 1, 'TEXT', c.text);
    }
    for (const n of c.notes) w.line(level + 1, 'NOTE', n);
  }
}

function writeAddress(w: Writer, level: number, address: string): void {
  const lines = address.split('\n');
  w.line(level, 'ADDR', lines[0] ?? '');
  for (const extra of lines.slice(1)) w.line(level + 1, 'CONT', extra);
}

function writeEvent(w: Writer, level: number, e: Event): void {
  const tag = e.tag || EVENT_TAG_BY_TYPE[e.type] || 'EVEN';
  w.line(level, tag, e.value ?? '');
  if (e.customType) w.line(level + 1, 'TYPE', e.customType);
  if (e.date) w.line(level + 1, 'DATE', formatGedcomDate(e.date));
  if (e.place) writePlace(w, level + 1, e.place);
  if (e.address) writeAddress(w, level + 1, e.address);
  if (e.cause) w.line(level + 1, 'CAUS', e.cause);
  if (e.age) w.line(level + 1, 'AGE', e.age);
  if (e.adoptionFamilyId) {
    w.line(level + 1, 'FAMC', ptr(e.adoptionFamilyId));
    if (e.adoptedBy) w.line(level + 2, 'ADOP', e.adoptedBy);
  }
  for (const n of e.notes) w.line(level + 1, 'NOTE', n);
  writeCitations(w, level + 1, e.citations);
  for (const m of e.mediaIds) w.line(level + 1, 'OBJE', ptr(m));
  for (const x of e.extra) w.raw(x, level + 1);
}

function writeIndividual(w: Writer, ind: Individual): void {
  w.line(0, 'INDI', '', ptr(ind.id));
  for (const n of ind.names) writeName(w, n);
  w.line(1, 'SEX', ind.sex);
  for (const e of ind.events) writeEvent(w, 1, e);
  for (const link of ind.childOf) {
    w.line(1, 'FAMC', ptr(link.familyId));
    if (link.pedigree !== 'birth') w.line(2, 'PEDI', link.pedigree);
  }
  for (const f of ind.partnerIn) w.line(1, 'FAMS', ptr(f));
  if (ind.restriction) w.line(1, 'RESN', ind.restriction);
  if (ind.unsure) w.line(1, '_UNSURE', 'Y');
  for (const n of ind.notes) w.line(1, 'NOTE', n);
  writeCitations(w, 1, ind.citations);
  for (const m of ind.mediaIds) w.line(1, 'OBJE', ptr(m));
  writeLeads(w, 1, ind.leads ?? []);
  for (const x of ind.extra) w.raw(x, 1);
}

function writeFamily(w: Writer, fam: Family): void {
  w.line(0, 'FAM', '', ptr(fam.id));
  if (fam.husbandId) w.line(1, 'HUSB', ptr(fam.husbandId));
  if (fam.wifeId) w.line(1, 'WIFE', ptr(fam.wifeId));
  for (const c of fam.childIds) w.line(1, 'CHIL', ptr(c));
  for (const e of fam.events) writeEvent(w, 1, e);
  if (fam.unionType === 'unmarried' || fam.unionType === 'civil') {
    w.line(1, 'EVEN');
    w.line(2, 'TYPE', fam.unionType === 'civil' ? 'pacs' : 'unmarried');
  }
  for (const n of fam.notes) w.line(1, 'NOTE', n);
  writeCitations(w, 1, fam.citations);
  for (const m of fam.mediaIds) w.line(1, 'OBJE', ptr(m));
  for (const x of fam.extra) w.raw(x, 1);
}

function writeSource(w: Writer, s: Source): void {
  w.line(0, 'SOUR', '', ptr(s.id));
  if (s.title) w.line(1, 'TITL', s.title);
  if (s.author) w.line(1, 'AUTH', s.author);
  if (s.abbreviation) w.line(1, 'ABBR', s.abbreviation);
  if (s.publication) w.line(1, 'PUBL', s.publication);
  if (s.text) w.line(1, 'TEXT', s.text);
  if (s.repositoryId) {
    w.line(1, 'REPO', ptr(s.repositoryId));
    if (s.callNumber) w.line(2, 'CALN', s.callNumber);
  }
  for (const n of s.notes) w.line(1, 'NOTE', n);
  for (const m of s.mediaIds) w.line(1, 'OBJE', ptr(m));
  for (const x of s.extra) w.raw(x, 1);
}

function writeRepository(w: Writer, r: Repository): void {
  w.line(0, 'REPO', '', ptr(r.id));
  w.line(1, 'NAME', r.name);
  if (r.address) writeAddress(w, 1, r.address);
  if (r.www) w.line(1, 'WWW', r.www);
  for (const n of r.notes) w.line(1, 'NOTE', n);
  for (const x of r.extra) w.raw(x, 1);
}

function writeMedia(w: Writer, m: MediaObject): void {
  w.line(0, 'OBJE', '', ptr(m.id));
  w.line(1, 'FILE', m.file);
  if (m.format) w.line(2, 'FORM', m.format);
  if (m.title) w.line(2, 'TITL', m.title);
  if (m.kind) w.line(1, '_KIND', m.kind);
  if (m.date) w.line(1, '_DATE', formatGedcomDate(m.date));
  if (m.primary) w.line(1, '_PRIM', 'Y');
  for (const n of m.notes) w.line(1, 'NOTE', n);
  for (const x of m.extra) w.raw(x, 1);
}
