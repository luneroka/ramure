/**
 * GEDCOM line tokenizer.
 *
 * Turns raw GEDCOM text into a tree of records. Tolerant by design: it accepts
 * CRLF or LF, a UTF-8 BOM, lines far longer than the 255 characters the 5.5.1
 * spec allows (Geneanet emits 500+), and CONC/CONT continuation lines whose
 * content starts with a space (Geneanet does that too, and the space matters).
 */

export interface GedcomRecord {
  level: number;
  /** Cross-reference id of this record, e.g. "@I1@", when it defines one. */
  xref?: string;
  tag: string;
  /** Value with CONC and CONT already folded in. */
  value: string;
  children: GedcomRecord[];
  /** 1-based line number of the record's first line, for error messages. */
  line: number;
}

export interface TokenizeError {
  line: number;
  text: string;
  reason: string;
}

export interface TokenizeResult {
  records: GedcomRecord[];
  errors: TokenizeError[];
}

const LINE_RE = /^(\d{1,2})(?: (@[^@\s]+@))? ([A-Za-z0-9_]+)(?: (.*))?$/;

export function tokenize(text: string): TokenizeResult {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = text.split(/\r\n|\r|\n/);
  const roots: GedcomRecord[] = [];
  const stack: GedcomRecord[] = [];
  const errors: TokenizeError[] = [];
  let last: GedcomRecord | null = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    // Leading whitespace before the level is tolerated by most readers.
    const line = raw.replace(/^\s+/, '');
    if (line === '') continue;
    const m = LINE_RE.exec(line);
    if (!m) {
      errors.push({ line: i + 1, text: raw, reason: 'Unparseable line' });
      continue;
    }
    const level = Number(m[1]);
    const xref = m[2];
    const tag = m[3]!.toUpperCase();
    // Do not trim: a CONC value may legitimately start with a space.
    const value = m[4] ?? '';

    if (last && (tag === 'CONC' || tag === 'CONT') && level === last.level + 1) {
      last.value += tag === 'CONT' ? '\n' + value : value;
      continue;
    }

    const rec: GedcomRecord = { level, xref, tag, value, children: [], line: i + 1 };
    if (level === 0) {
      stack.length = 0;
      roots.push(rec);
    } else {
      // Pop to the parent level. A level jump (e.g. 1 then 3) attaches to the
      // deepest available parent rather than failing the whole file.
      while (stack.length && stack[stack.length - 1]!.level >= level) stack.pop();
      const parent = stack[stack.length - 1];
      if (!parent) {
        errors.push({ line: i + 1, text: raw, reason: 'Record without a level-0 parent' });
        continue;
      }
      if (level > parent.level + 1) {
        errors.push({ line: i + 1, text: raw, reason: `Level jump from ${parent.level} to ${level}` });
      }
      parent.children.push(rec);
    }
    stack.push(rec);
    last = rec;
  }
  return { records: roots, errors };
}

/** First child with the given tag, if any. */
export function child(rec: GedcomRecord, tag: string): GedcomRecord | undefined {
  return rec.children.find((c) => c.tag === tag);
}

/** All children with the given tag. */
export function children(rec: GedcomRecord, tag: string): GedcomRecord[] {
  return rec.children.filter((c) => c.tag === tag);
}

/** Value of the first child with the given tag, or undefined. */
export function childValue(rec: GedcomRecord, tag: string): string | undefined {
  const c = child(rec, tag);
  return c ? c.value : undefined;
}

/** Strip the @ signs from a pointer value such as "@I1@". */
export function pointerId(value: string): string | undefined {
  const m = /^@([^@]+)@$/.exec(value.trim());
  return m ? m[1] : undefined;
}
