#!/usr/bin/env node
/**
 * Tripwires for work that was deliberately deferred.
 *
 * A deferral is only honest if something notices when the reason for deferring
 * stops holding. Each entry below names the deferred work, the condition that
 * makes it worth doing, and where the reasoning lives. This runs as part of
 * /preflight and prints loudly when a trip fires.
 *
 * It never fails the build. A tripwire firing is a conversation to have with
 * Yoann, not a reason to block whatever you were actually doing — see
 * docs/DEFERRED.md.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (dir) =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !f.includes('.test.'))
    .map((f) => ({ name: join(dir, f), text: readFileSync(join(dir, f), 'utf8') }));

const workerFiles = read('worker');
const longest = workerFiles.map((f) => ({ ...f, lines: f.text.split('\n').length })).sort((a, b) => b.lines - a.lines)[0];
const sqlCount = workerFiles.reduce((n, f) => n + (f.text.match(/\b(SELECT|INSERT|UPDATE|DELETE)\b/g) ?? []).length, 0);

/** Each check reports { tripped, detail }. Keep the measure cheap and obvious. */
const checks = [
  {
    id: 'worker-repository-layer',
    what: 'Extract a repository layer in worker/ — SQL currently sits directly in route handlers.',
    why: 'Fine while the API is small. Past these sizes a route file stops being readable in one sitting, and the same query starts being written twice.',
    where: 'docs/DEFERRED.md § worker-repository-layer',
    trips: [
      { name: 'longest worker file', value: longest.lines, limit: 600, unit: 'lines', extra: longest.name },
      { name: 'inline SQL statements', value: sqlCount, limit: 200, unit: 'statements' },
    ],
  },
];

let fired = 0;
for (const c of checks) {
  const hit = c.trips.filter((t) => t.value > t.limit);
  const summary = c.trips.map((t) => `${t.name} ${t.value}/${t.limit} ${t.unit}`).join(', ');
  if (hit.length) {
    fired++;
    console.log(`\n  ⚠  TRIPWIRE: ${c.id}`);
    console.log(`     ${c.what}`);
    console.log(`     Why now: ${c.why}`);
    for (const t of hit) console.log(`     Over: ${t.name} is ${t.value}, limit ${t.limit}${t.extra ? ` (${t.extra})` : ''}`);
    console.log(`     Read: ${c.where}`);
    console.log(`     This does not block your current work. Raise it with Yoann.`);
  } else {
    console.log(`  ok  ${c.id.padEnd(26)} ${summary}`);
  }
}
console.log(fired ? `\n${fired} tripwire(s) fired — see docs/DEFERRED.md.` : '\nNo deferred work has come due.');
