/**
 * GEDCOM records → Ramure model.
 *
 * This is the generic 5.5.1 mapping. GeneWeb / Geneanet specific repairs live
 * in geneweb.ts and run afterwards.
 */

import { parseDate } from './dates';
import {
  emptyTree,
  newEvent,
  newFamily,
  newIndividual,
  type Citation,
  type Event,
  type EventType,
  type Family,
  type Individual,
  type Lead,
  type MediaKind,
  type MediaObject,
  type Name,
  type Pedigree,
  type Place,
  type Repository,
  type Sex,
  type Source,
  type Tree,
  type UnionType,
} from './model';
import { child, childValue, children, pointerId, tokenize, type GedcomRecord } from './tokenizer';
import { repairGeneWeb } from './geneweb';

const INDI_EVENT_TAGS: Record<string, EventType> = {
  BIRT: 'birth',
  CHR: 'baptism',
  BAPM: 'baptism',
  DEAT: 'death',
  BURI: 'burial',
  CREM: 'cremation',
  ADOP: 'adoption',
  OCCU: 'occupation',
  RESI: 'residence',
  CENS: 'census',
  EDUC: 'education',
  RELI: 'religion',
  RETI: 'retirement',
  EMIG: 'emigration',
  IMMI: 'immigration',
  NATU: 'naturalization',
  PROB: 'probate',
  WILL: 'will',
  GRAD: 'graduation',
  CONF: 'confirmation',
  FCOM: 'first-communion',
  TITL: 'title',
  DSCR: 'description',
  EVEN: 'custom',
  // Rarely used but valid individual attributes/events
  BARM: 'custom',
  BASM: 'custom',
  BLES: 'custom',
  CHRA: 'custom',
  ORDN: 'custom',
  NCHI: 'custom',
  NMR: 'custom',
  PROP: 'custom',
  SSN: 'custom',
  IDNO: 'custom',
  NATI: 'custom',
  CAST: 'custom',
  FACT: 'custom',
};

const FAM_EVENT_TAGS: Record<string, EventType> = {
  MARR: 'marriage',
  DIV: 'divorce',
  ENGA: 'engagement',
  MARB: 'marriage-banns',
  ANUL: 'annulment',
  DIVF: 'custom',
  MARC: 'custom',
  MARL: 'custom',
  MARS: 'custom',
  CENS: 'census',
  RESI: 'residence',
  EVEN: 'custom',
};

const EVENT_DETAIL_TAGS = new Set(['TYPE', 'DATE', 'PLAC', 'ADDR', 'CAUS', 'AGE', 'NOTE', 'SOUR', 'OBJE', 'FAMC', 'AGNC', 'RELI', 'RESN']);

export interface ParseOptions {
  /** Apply GeneWeb / Geneanet repairs after the generic mapping. Default true. */
  repairGeneWeb?: boolean;
}

export function parseGedcom(text: string, options: ParseOptions = {}): Tree {
  const { records, errors } = tokenize(text);
  const tree = emptyTree();
  for (const e of errors) {
    tree.importNotes.push({ level: 'warning', code: 'tokenize', message: `Line ${e.line}: ${e.reason}` });
  }

  // Shared NOTE records are resolved by pointer, so collect them first.
  const sharedNotes = new Map<string, string>();
  for (const r of records) if (r.tag === 'NOTE' && r.xref) sharedNotes.set(pointerId(r.xref)!, r.value);

  const ctx: Ctx = { tree, sharedNotes };

  for (const r of records) {
    const id = r.xref ? pointerId(r.xref) : undefined;
    switch (r.tag) {
      case 'HEAD':
        parseHeader(ctx, r);
        break;
      case 'INDI':
        if (id) tree.individuals[id] = parseIndividual(ctx, id, r);
        break;
      case 'FAM':
        if (id) tree.families[id] = parseFamily(ctx, id, r);
        break;
      case 'SOUR':
        if (id) tree.sources[id] = parseSource(ctx, id, r);
        break;
      case 'REPO':
        if (id) tree.repositories[id] = parseRepository(ctx, id, r);
        break;
      case 'OBJE':
        if (id) tree.media[id] = parseMedia(ctx, id, r);
        break;
      case 'NOTE':
        break; // inlined wherever referenced
      case 'TRLR':
        break;
      default:
        tree.extra.push(r);
    }
  }

  linkFamilies(tree);

  if (options.repairGeneWeb !== false) repairGeneWeb(tree);
  return tree;
}

interface Ctx {
  tree: Tree;
  sharedNotes: Map<string, string>;
}

function parseHeader(ctx: Ctx, r: GedcomRecord): void {
  const h = ctx.tree.header;
  const sour = child(r, 'SOUR');
  if (sour) {
    h.sourceSystem = sour.value || childValue(sour, 'NAME');
    h.sourceVersion = childValue(sour, 'VERS');
  }
  const gedc = child(r, 'GEDC');
  if (gedc) h.gedcomVersion = childValue(gedc, 'VERS');
  h.charset = childValue(r, 'CHAR');
  h.language = childValue(r, 'LANG');
  h.date = childValue(r, 'DATE');
  const plac = child(r, 'PLAC');
  if (plac) h.placeFormat = childValue(plac, 'FORM');
  h.notes = notesOf(ctx, r);
  ctx.tree.resources = leadsOf(r);
  ctx.tree.documentIds = children(r, '_DOC')
    .map((c) => pointerId(c.value))
    .filter((id): id is string => !!id);
}

/** _LINK <url> / 2 TITL / 2 NOTE / 2 _DONE Y : a research lead or resource. */
function leadsOf(r: GedcomRecord): Lead[] {
  return children(r, '_LINK').map((l, i) => ({
    id: childValue(l, '_ID') ?? `L${i + 1}`,
    url: l.value,
    title: childValue(l, 'TITL') ?? l.value,
    note: childValue(l, 'NOTE') || undefined,
    done: childValue(l, '_DONE') === 'Y' || undefined,
  }));
}

function notesOf(ctx: Ctx, r: GedcomRecord): string[] {
  return children(r, 'NOTE').map((n) => {
    const id = pointerId(n.value);
    if (id && ctx.sharedNotes.has(id)) return ctx.sharedNotes.get(id)!;
    return n.value;
  });
}

function mediaOf(ctx: Ctx, r: GedcomRecord): string[] {
  const ids: string[] = [];
  for (const o of children(r, 'OBJE')) {
    const id = pointerId(o.value);
    if (id) {
      ids.push(id);
      continue;
    }
    // Inline OBJE (5.5.1 allows FILE directly under the event). Promote to a media record.
    const file = childValue(o, 'FILE');
    if (file) {
      const newId = `M${Object.keys(ctx.tree.media).length + 1}`;
      const fileRec = child(o, 'FILE')!;
      ctx.tree.media[newId] = {
        id: newId,
        file,
        format: childValue(fileRec, 'FORM') ?? childValue(o, 'FORM'),
        title: childValue(o, 'TITL') ?? childValue(fileRec, 'TITL'),
        notes: notesOf(ctx, o),
        extra: [],
      };
      ids.push(newId);
    }
  }
  return ids;
}

function citationsOf(ctx: Ctx, r: GedcomRecord): Citation[] {
  return children(r, 'SOUR').map((s) => {
    const id = pointerId(s.value);
    const c: Citation = { notes: notesOf(ctx, s) };
    if (id) {
      c.sourceId = id;
      c.page = childValue(s, 'PAGE');
      const q = childValue(s, 'QUAY');
      if (q !== undefined && q !== '') c.quality = Number(q);
      const data = child(s, 'DATA');
      if (data) {
        const d = childValue(data, 'DATE');
        if (d) c.date = parseDate(d);
        c.text = childValue(data, 'TEXT');
      }
    } else {
      c.flat = s.value;
      const t = childValue(s, 'TEXT');
      if (t) c.text = t;
    }
    return c;
  });
}

function parsePlace(r: GedcomRecord): Place {
  const p: Place = { text: r.value, parts: r.value.split(',').map((s) => s.trim()) };
  const map = child(r, 'MAP');
  if (map) {
    const lati = childValue(map, 'LATI');
    const long = childValue(map, 'LONG');
    const num = (v: string | undefined): number | undefined => {
      if (!v) return undefined;
      const m = /^([NSEW])?\s*(-?\d+(?:\.\d+)?)$/i.exec(v.trim());
      if (!m) return undefined;
      const n = Number(m[2]);
      return /[SW]/i.test(m[1] ?? '') ? -n : n;
    };
    p.lat = num(lati);
    p.lon = num(long);
  }
  return p;
}

function parseAddress(r: GedcomRecord): string {
  const lines = [
    r.value,
    ...children(r, 'ADR1').map((c) => c.value),
    ...children(r, 'ADR2').map((c) => c.value),
    ...children(r, 'ADR3').map((c) => c.value),
  ];
  const city = childValue(r, 'CITY'),
    post = childValue(r, 'POST'),
    stae = childValue(r, 'STAE'),
    ctry = childValue(r, 'CTRY');
  const tail = [post, city].filter(Boolean).join(' ');
  return [...lines.filter(Boolean), tail, stae, ctry].filter(Boolean).join('\n');
}

function parseEvent(ctx: Ctx, r: GedcomRecord, type: EventType): Event {
  const e = newEvent(type, r.tag);
  if (r.value && r.value !== 'Y') e.value = r.value;
  for (const c of r.children) {
    switch (c.tag) {
      case 'TYPE':
        e.customType = c.value;
        break;
      case 'DATE':
        e.date = parseDate(c.value);
        break;
      case 'PLAC':
        e.place = parsePlace(c);
        break;
      case 'ADDR':
        e.address = parseAddress(c);
        break;
      case 'CAUS':
        e.cause = c.value;
        break;
      case 'AGE':
        e.age = c.value;
        break;
      case 'FAMC': {
        e.adoptionFamilyId = pointerId(c.value);
        const by = childValue(c, 'ADOP');
        if (by === 'HUSB' || by === 'WIFE' || by === 'BOTH') e.adoptedBy = by;
        break;
      }
      case 'NOTE':
      case 'SOUR':
      case 'OBJE':
        break; // handled below
      default:
        e.extra.push(c);
    }
  }
  e.notes = notesOf(ctx, r);
  e.citations = citationsOf(ctx, r);
  e.mediaIds = mediaOf(ctx, r);
  return e;
}

function parseName(r: GedcomRecord): Name {
  const raw = r.value.trim();
  const m = /^([^/]*)\/([^/]*)\/(.*)$/.exec(raw);
  let given = raw,
    surname = '';
  let suffix: string | undefined;
  if (m) {
    given = m[1]!.trim();
    surname = m[2]!.trim();
    const tail = m[3]!.trim();
    if (tail) suffix = tail;
  }
  const n: Name = { given, surname };
  const givn = childValue(r, 'GIVN'),
    surn = childValue(r, 'SURN');
  if (givn !== undefined) n.given = givn;
  if (surn !== undefined) n.surname = surn;
  const npfx = childValue(r, 'NPFX'),
    nsfx = childValue(r, 'NSFX');
  if (npfx) n.prefix = npfx;
  if (nsfx ?? suffix) n.suffix = nsfx ?? suffix;
  const nick = childValue(r, 'NICK');
  if (nick) n.nick = nick;
  const type = childValue(r, 'TYPE');
  if (type) n.type = type;
  return n;
}

function parseIndividual(ctx: Ctx, id: string, r: GedcomRecord): Individual {
  const ind = newIndividual(id);
  for (const c of r.children) {
    if (c.tag === 'NAME') {
      ind.names.push(parseName(c));
      continue;
    }
    if (c.tag === 'SEX') {
      const s = c.value.trim().toUpperCase().charAt(0);
      ind.sex = s === 'M' || s === 'F' ? (s as Sex) : 'U';
      continue;
    }
    if (c.tag === 'FAMC') {
      const fid = pointerId(c.value);
      if (fid) ind.childOf.push({ familyId: fid, pedigree: parsePedigree(childValue(c, 'PEDI')) });
      continue;
    }
    if (c.tag === 'FAMS') {
      const fid = pointerId(c.value);
      if (fid) ind.partnerIn.push(fid);
      continue;
    }
    if (c.tag === 'RESN') {
      ind.restriction = c.value.trim().toLowerCase();
      continue;
    }
    if (c.tag === '_UNSURE') {
      if (c.value.trim().toUpperCase() === 'Y') ind.unsure = true;
      continue;
    }
    if (c.tag === 'NOTE' || c.tag === 'SOUR' || c.tag === 'OBJE' || c.tag === '_LINK') continue;
    const et = INDI_EVENT_TAGS[c.tag];
    if (et) {
      ind.events.push(parseEvent(ctx, c, et));
      continue;
    }
    ind.extra.push(c);
  }
  ind.notes = notesOf(ctx, r);
  ind.citations = citationsOf(ctx, r);
  ind.mediaIds = mediaOf(ctx, r);
  ind.leads = leadsOf(r);
  return ind;
}

function parsePedigree(v: string | undefined): Pedigree {
  const s = (v ?? '').trim().toLowerCase();
  if (s === 'birth' || s === 'adopted' || s === 'foster' || s === 'step' || s === 'sealing') return s;
  return s === '' ? 'birth' : 'unknown';
}

function parseFamily(ctx: Ctx, id: string, r: GedcomRecord): Family {
  const fam = newFamily(id);
  for (const c of r.children) {
    if (c.tag === 'HUSB') {
      fam.husbandId = pointerId(c.value);
      continue;
    }
    if (c.tag === 'WIFE') {
      fam.wifeId = pointerId(c.value);
      continue;
    }
    if (c.tag === 'CHIL') {
      const cid = pointerId(c.value);
      if (cid) fam.childIds.push(cid);
      continue;
    }
    if (c.tag === 'NOTE' || c.tag === 'SOUR' || c.tag === 'OBJE') continue;
    const et = FAM_EVENT_TAGS[c.tag];
    if (et) {
      fam.events.push(parseEvent(ctx, c, et));
      continue;
    }
    fam.extra.push(c);
  }
  fam.unionType = inferUnionType(fam);
  fam.notes = notesOf(ctx, r);
  fam.citations = citationsOf(ctx, r);
  fam.mediaIds = mediaOf(ctx, r);
  return fam;
}

function inferUnionType(fam: Family): UnionType {
  if (fam.events.some((e) => e.type === 'marriage')) return 'married';
  return 'unknown';
}

function parseSource(ctx: Ctx, id: string, r: GedcomRecord): Source {
  const s: Source = { id, title: '', notes: [], mediaIds: [], extra: [] };
  for (const c of r.children) {
    switch (c.tag) {
      case 'TITL':
        s.title = c.value;
        break;
      case 'AUTH':
        s.author = c.value;
        break;
      case 'ABBR':
        s.abbreviation = c.value;
        break;
      case 'PUBL':
        s.publication = c.value;
        break;
      case 'TEXT':
        s.text = c.value;
        break;
      case 'REPO':
        s.repositoryId = pointerId(c.value);
        s.callNumber = childValue(c, 'CALN');
        break;
      case 'NOTE':
      case 'OBJE':
        break;
      default:
        s.extra.push(c);
    }
  }
  s.notes = notesOf(ctx, r);
  s.mediaIds = mediaOf(ctx, r);
  return s;
}

function parseRepository(ctx: Ctx, id: string, r: GedcomRecord): Repository {
  const rep: Repository = { id, name: childValue(r, 'NAME') ?? '', notes: notesOf(ctx, r), extra: [] };
  const addr = child(r, 'ADDR');
  if (addr) rep.address = parseAddress(addr);
  rep.www = childValue(r, 'WWW');
  for (const c of r.children) if (!['NAME', 'ADDR', 'WWW', 'NOTE'].includes(c.tag)) rep.extra.push(c);
  return rep;
}

function parseMedia(ctx: Ctx, id: string, r: GedcomRecord): MediaObject {
  const fileRec = child(r, 'FILE');
  const m: MediaObject = { id, file: fileRec?.value ?? '', notes: notesOf(ctx, r), extra: [] };
  m.format = (fileRec && childValue(fileRec, 'FORM')) ?? childValue(r, 'FORM');
  m.title = (fileRec && childValue(fileRec, 'TITL')) ?? childValue(r, 'TITL');
  const kind = childValue(r, '_KIND');
  if (kind && ['birth', 'marriage', 'death', 'photo', 'other'].includes(kind)) m.kind = kind as MediaKind;
  const date = childValue(r, '_DATE');
  if (date) m.date = parseDate(date);
  if (childValue(r, '_PRIM') === 'Y') m.primary = true;
  for (const c of r.children) if (!['FILE', 'FORM', 'TITL', 'NOTE', '_KIND', '_DATE', '_PRIM'].includes(c.tag)) m.extra.push(c);
  return m;
}

/**
 * Make family links symmetric: every CHIL implies a FAMC, every HUSB/WIFE a
 * FAMS, and vice versa. Files in the wild are frequently one-sided.
 */
export function linkFamilies(tree: Tree): void {
  for (const fam of Object.values(tree.families)) {
    for (const pid of [fam.husbandId, fam.wifeId]) {
      if (!pid) continue;
      const p = tree.individuals[pid];
      if (p && !p.partnerIn.includes(fam.id)) p.partnerIn.push(fam.id);
    }
    for (const cid of fam.childIds) {
      const c = tree.individuals[cid];
      if (c && !c.childOf.some((l) => l.familyId === fam.id)) c.childOf.push({ familyId: fam.id, pedigree: 'birth' });
    }
  }
  for (const ind of Object.values(tree.individuals)) {
    for (const fid of ind.partnerIn) {
      const f = tree.families[fid];
      if (!f) continue;
      if (f.husbandId !== ind.id && f.wifeId !== ind.id) {
        if (!f.husbandId && ind.sex === 'M') f.husbandId = ind.id;
        else if (!f.wifeId && ind.sex === 'F') f.wifeId = ind.id;
        else if (!f.husbandId) f.husbandId = ind.id;
        else if (!f.wifeId) f.wifeId = ind.id;
      }
    }
    for (const link of ind.childOf) {
      const f = tree.families[link.familyId];
      if (f && !f.childIds.includes(ind.id)) f.childIds.push(ind.id);
    }
  }
}

export { EVENT_DETAIL_TAGS };
