/**
 * Ramure's domain model. It follows GEDCOM's vocabulary (individuals connect
 * through families, events carry dates, places and citations) so that import
 * and export stay lossless, while being plain JSON-friendly objects that the
 * canvas, the editor and IndexedDB can all share.
 */

import type { GDate } from './dates';
import type { GedcomRecord } from './tokenizer';

export type Sex = 'M' | 'F' | 'U';

export interface Name {
  /** Given names, space separated. Empty string when unknown. */
  given: string;
  surname: string;
  /** Prefix such as "Dr", suffix such as "Jr", when present. */
  prefix?: string;
  suffix?: string;
  nick?: string;
  /** GEDCOM name type: birth, married, aka, immigrant, maiden... */
  type?: string;
}

export interface Place {
  /** Full text, components separated by ", ". */
  text: string;
  /** Components split on commas, most specific first. Empty strings are preserved. */
  parts: string[];
  lat?: number;
  lon?: number;
}

export interface Citation {
  sourceId?: string;
  page?: string;
  /** 0-3 per GEDCOM QUAY. */
  quality?: number;
  date?: GDate;
  text?: string;
  /**
   * Citation that arrived as flat text (Geneanet does this) rather than a
   * structured source pointer. Kept verbatim.
   */
  flat?: string;
  notes: string[];
}

/** Internal event types. Anything else is kept under `custom` with its GEDCOM tag. */
export type EventType =
  | 'birth' | 'baptism' | 'death' | 'burial' | 'cremation' | 'adoption'
  | 'marriage' | 'divorce' | 'engagement' | 'marriage-banns' | 'annulment' | 'separation'
  | 'occupation' | 'residence' | 'census' | 'education' | 'religion' | 'retirement'
  | 'emigration' | 'immigration' | 'naturalization' | 'probate' | 'will'
  | 'graduation' | 'confirmation' | 'first-communion' | 'title' | 'description'
  | 'custom';

export interface Event {
  type: EventType;
  /** Original GEDCOM tag, e.g. "EVEN" for custom events or "CHR" vs "BAPM". */
  tag: string;
  /** Human label for custom events (GEDCOM TYPE). */
  customType?: string;
  /** Free value on the event line, e.g. the occupation text, the Y of "BIRT Y". */
  value?: string;
  date?: GDate;
  place?: Place;
  address?: string;
  cause?: string;
  age?: string;
  /** For adoption: which family and which parents adopted. */
  adoptionFamilyId?: string;
  adoptedBy?: 'HUSB' | 'WIFE' | 'BOTH';
  notes: string[];
  citations: Citation[];
  mediaIds: string[];
  /** Unrecognised substructures, preserved for re-export. */
  extra: GedcomRecord[];
}

export type Pedigree = 'birth' | 'adopted' | 'foster' | 'step' | 'sealing' | 'unknown';

export interface ChildLink {
  familyId: string;
  pedigree: Pedigree;
}

export interface Individual {
  id: string;
  names: Name[];
  sex: Sex;
  events: Event[];
  notes: string[];
  citations: Citation[];
  mediaIds: string[];
  /** Families in which this person is a child. */
  childOf: ChildLink[];
  /** Families in which this person is a partner. */
  partnerIn: string[];
  /** GEDCOM RESN: privacy, locked, confidential. */
  restriction?: string;
  extra: GedcomRecord[];
}

export type UnionType = 'married' | 'unmarried' | 'civil' | 'unknown';

export interface Family {
  id: string;
  husbandId?: string;
  wifeId?: string;
  childIds: string[];
  unionType: UnionType;
  events: Event[];
  notes: string[];
  citations: Citation[];
  mediaIds: string[];
  extra: GedcomRecord[];
}

export interface Source {
  id: string;
  title: string;
  author?: string;
  abbreviation?: string;
  publication?: string;
  text?: string;
  repositoryId?: string;
  callNumber?: string;
  notes: string[];
  mediaIds: string[];
  extra: GedcomRecord[];
}

export interface Repository {
  id: string;
  name: string;
  address?: string;
  www?: string;
  notes: string[];
  extra: GedcomRecord[];
}

export interface MediaObject {
  id: string;
  file: string;
  format?: string;
  title?: string;
  notes: string[];
  extra: GedcomRecord[];
}

export interface Header {
  sourceSystem?: string;
  sourceVersion?: string;
  gedcomVersion?: string;
  charset?: string;
  language?: string;
  date?: string;
  placeFormat?: string;
  notes: string[];
}

/** One thing the importer changed or could not keep. Shown to the user after import. */
export interface ImportNote {
  level: 'info' | 'warning';
  code: string;
  message: string;
  /** Record ids involved, for linking from the report. */
  ids?: string[];
}

export interface Tree {
  header: Header;
  individuals: Record<string, Individual>;
  families: Record<string, Family>;
  sources: Record<string, Source>;
  repositories: Record<string, Repository>;
  media: Record<string, MediaObject>;
  /** Top-level records we do not model (SUBM, SUBN, unknown), preserved. */
  extra: GedcomRecord[];
  importNotes: ImportNote[];
}

export function emptyTree(): Tree {
  return {
    header: { notes: [] },
    individuals: {},
    families: {},
    sources: {},
    repositories: {},
    media: {},
    extra: [],
    importNotes: [],
  };
}

export function newEvent(type: EventType, tag: string): Event {
  return { type, tag, notes: [], citations: [], mediaIds: [], extra: [] };
}

export function newIndividual(id: string): Individual {
  return { id, names: [], sex: 'U', events: [], notes: [], citations: [], mediaIds: [], childOf: [], partnerIn: [], extra: [] };
}

export function newFamily(id: string): Family {
  return { id, childIds: [], unionType: 'unknown', events: [], notes: [], citations: [], mediaIds: [], extra: [] };
}

/** Place text for display: empty components (e.g. an unknown hamlet) are dropped. */
export function placeText(p: Place | undefined): string {
  if (!p) return '';
  const parts = p.parts.filter((s) => s.length);
  return parts.length ? parts.join(', ') : p.text;
}

/** Convenience: first event of a type. */
export function findEvent(events: Event[], type: EventType): Event | undefined {
  return events.find((e) => e.type === type);
}

/** Display name: "Given SURNAME". */
export function displayName(ind: Individual): string {
  const n = ind.names[0];
  if (!n) return '?';
  const parts = [n.given, n.surname].filter((s) => s && s.length);
  return parts.length ? parts.join(' ') : '?';
}
