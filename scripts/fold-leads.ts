/**
 * Rewrites the stored trees so a person's research leads (`_LINK` under an
 * INDI) are written as the sources they now are, with a backup, a proof that
 * nothing was lost, and a way back.
 *
 * The app already reads an old `_LINK` as a source, so this changes nothing a
 * person sees; it makes the stored GEDCOM — what a backup or an export carries
 * to another program — say it now rather than at the tree's next edit.
 *
 *   npx vite-node scripts/fold-leads.ts -- backup  --remote   every tree, to backups/fold-leads-<time>/
 *   npx vite-node scripts/fold-leads.ts -- check   --remote --dir <backup>   what would change, proved
 *   npx vite-node scripts/fold-leads.ts -- apply   --remote --dir <backup>   a version per tree, then the rewrite
 *   npx vite-node scripts/fold-leads.ts -- revert  --remote --dir <backup>   the backed-up documents put back
 *
 * Only a tree that has a person's lead is touched. Its version stays: the
 * document reads as the same tree before and after, which `check` proves, so
 * no device has anything to catch up on. Every write is guarded by that
 * version, so a tree edited since the backup is refused rather than overwritten.
 * The backup holds family data: it stays on this machine (git-ignored).
 */

import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { leadCitation, type Tree } from '../src/gedcom/model';
import { parseGedcom } from '../src/gedcom/parse';
import { serializeGedcom } from '../src/gedcom/serialize';
import { childValue, children, tokenize } from '../src/gedcom/tokenizer';

interface Row {
  id: string;
  name: string;
  version: number;
  doc: string;
  people: number;
}

interface Plan {
  id: string;
  name: string;
  version: number;
  leads: number;
  before: string;
  after: string;
}

const SNAPSHOT_LABEL = 'Avant conversion des pistes';
/** D1 refuses a statement past 100 kB; a document is written in one. */
const MAX_STATEMENT = 95_000;

const [command, ...rest] = process.argv.slice(2).filter((a) => a !== '--');
const where = rest.includes('--remote') ? '--remote' : rest.includes('--local') ? '--local' : fail('say --remote or --local');
const dirAt = rest.indexOf('--dir');
const dir = dirAt >= 0 ? rest[dirAt + 1]! : undefined;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function d1(args: string[]): unknown {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'ramure', where, '--json', ...args], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  return JSON.parse(out);
}

function query<T>(sql: string): T[] {
  const res = d1(['--command', sql]) as Array<{ results: T[] }>;
  return res[0]!.results;
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;
const readTrees = () => query<Row>('SELECT id, name, version, doc, people FROM trees ORDER BY id');
const load = (): Row[] => JSON.parse(readFileSync(join(dir ?? fail('say --dir <backup folder>'), 'trees.json'), 'utf8')) as Row[];

/** A person's leads as the old document wrote them. */
function leadsIn(doc: string): Array<{ person: string; url: string; title?: string; note?: string }> {
  return tokenize(doc).records.flatMap((r) =>
    r.tag === 'INDI'
      ? children(r, '_LINK').map((l) => ({
          person: r.xref!.replace(/@/g, ''),
          url: l.value,
          title: childValue(l, 'TITL'),
          note: childValue(l, 'NOTE') || undefined,
        }))
      : [],
  );
}

/**
 * What a tree is to the app. Left out: the reading notes, which describe the
 * file rather than the family, and where in the file a kept-verbatim record
 * stood (`line`), which moves when any line before it does.
 */
const meaning = (t: Tree): unknown =>
  JSON.parse(JSON.stringify({ ...t, importNotes: [] }, (k, v: unknown) => (k === 'line' ? undefined : v)));

/** The rewrite of one tree and the proof it loses nothing; throws, naming what failed. */
function plan(row: Row): Plan | null {
  const leads = leadsIn(row.doc);
  if (!leads.length) return null;
  const before = parseGedcom(row.doc);
  // Keep the header's date: only the leads move.
  const stamped = new Date(`${/^1 DATE (.+)$/m.exec(row.doc)?.[1] ?? ''} 12:00`);
  const after = serializeGedcom(before, Number.isNaN(stamped.getTime()) ? {} : { date: stamped });
  const again = parseGedcom(after);
  const problems: string[] = [];
  if (!isDeepStrictEqual(meaning(again), meaning(before))) problems.push('the rewritten document reads as a different tree');
  if (leadsIn(after).length) problems.push('a lead is still written as _LINK');
  for (const l of leads) {
    const want = leadCitation({ title: l.title ?? l.url, url: l.url, note: l.note });
    const has = again.individuals[l.person]?.citations.some((c) => c.flat === want.flat && want.notes.every((n) => c.notes.includes(n)));
    if (!has) problems.push(`${l.person}: « ${l.title ?? l.url} » is not among the sources`);
  }
  if (again.resources.length !== before.resources.length) problems.push('the tree resources changed');
  if (Object.keys(again.individuals).length !== row.people) problems.push('the number of people changed');
  if (problems.length) throw new Error(`${row.id} (${row.name}): ${problems.join('; ')}`);
  return { id: row.id, name: row.name, version: row.version, leads: leads.length, before: row.doc, after };
}

function plans(rows: Row[]): Plan[] {
  return rows.map(plan).filter((p): p is Plan => !!p);
}

function report(rows: Row[], list: Plan[]): void {
  console.log(`${rows.length} trees, ${list.length} with a person's research leads.`);
  for (const r of rows) {
    const p = list.find((x) => x.id === r.id);
    console.log(
      `  ${r.id}  ${r.name.padEnd(28)} v${r.version}  ${r.people} people  ` +
        (p ? `${p.leads} lead(s) → sources, checked: same tree, every lead found` : 'nothing to change'),
    );
  }
}

/** Refuses when the live tree moved since the backup: the backup would not be what is replaced. */
function sameAsBackup(backup: Row[]): void {
  const live = new Map(readTrees().map((r) => [r.id, r]));
  for (const b of backup) {
    const l = live.get(b.id);
    if (!l || l.version !== b.version || sha(l.doc) !== sha(b.doc)) fail(`${b.id} changed since the backup: take a new one.`);
  }
}

function runSql(statements: string[], name: string): void {
  for (const s of statements)
    if (Buffer.byteLength(s) > MAX_STATEMENT) fail(`a statement is ${Buffer.byteLength(s)} bytes, over D1's limit`);
  const file = join(dir!, name);
  writeFileSync(file, statements.join('\n'));
  d1(['--file', file, '--yes']);
}

switch (command) {
  case 'backup': {
    const rows = readTrees();
    const out = join('backups', `fold-leads-${new Date().toISOString().replace(/[:.]/g, '-')}${where === '--local' ? '-local' : ''}`);
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'trees.json'), JSON.stringify(rows, null, 1));
    writeFileSync(
      join(out, 'hashes.txt'),
      rows.map((r) => `${r.id} v${r.version} ${sha(r.doc)} ${Buffer.byteLength(r.doc)} bytes ${r.people} people`).join('\n') + '\n',
    );
    console.log(`Backed up ${rows.length} trees to ${out}`);
    report(rows, plans(rows));
    break;
  }
  case 'check': {
    const rows = load();
    sameAsBackup(rows);
    report(rows, plans(rows));
    break;
  }
  case 'apply': {
    const rows = load();
    sameAsBackup(rows);
    const list = plans(rows);
    report(rows, list);
    if (!list.length) break;
    const now = Date.now();
    runSql(
      list.flatMap((p) => [
        `INSERT INTO tree_snapshots (id, tree_id, version, doc, created_at, label, created_by) SELECT ${quote(
          `S${randomBytes(8).toString('hex').slice(0, 11)}`,
        )}, id, version, doc, ${now}, ${quote(SNAPSHOT_LABEL)}, NULL FROM trees WHERE id = ${quote(p.id)} AND version = ${p.version};`,
        `UPDATE trees SET doc = ${quote(p.after)}, updated_at = ${now} WHERE id = ${quote(p.id)} AND version = ${p.version};`,
      ]),
      'apply.sql',
    );
    const live = new Map(readTrees().map((r) => [r.id, r]));
    for (const p of list) {
      const l = live.get(p.id);
      if (l?.doc !== p.after) fail(`${p.id}: the stored document is not the checked rewrite — run revert.`);
    }
    writeFileSync(join(dir!, 'applied.json'), JSON.stringify(list.map(({ id, version, after }) => ({ id, version, after: sha(after) }))));
    console.log(`Rewrote ${list.length} tree(s); each stored document is the checked one, with a version « ${SNAPSHOT_LABEL} » kept.`);
    break;
  }
  case 'revert': {
    const rows = new Map(load().map((r) => [r.id, r]));
    const applied = JSON.parse(readFileSync(join(dir!, 'applied.json'), 'utf8')) as Array<{ id: string; version: number; after: string }>;
    const live = new Map(readTrees().map((r) => [r.id, r]));
    for (const a of applied) {
      const l = live.get(a.id);
      if (!l || l.version !== a.version || sha(l.doc) !== a.after)
        fail(`${a.id} was edited since: restore « ${SNAPSHOT_LABEL} » from its versions instead.`);
    }
    runSql(
      applied.map((a) => `UPDATE trees SET doc = ${quote(rows.get(a.id)!.doc)} WHERE id = ${quote(a.id)} AND version = ${a.version};`),
      'revert.sql',
    );
    const after = new Map(readTrees().map((r) => [r.id, r]));
    for (const a of applied) if (after.get(a.id)?.doc !== rows.get(a.id)!.doc) fail(`${a.id}: not put back.`);
    console.log(`Put back ${applied.length} tree(s) exactly as backed up.`);
    break;
  }
  default:
    fail('backup | check | apply | revert');
}
