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

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (dir) =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !f.includes('.test.'))
    .map((f) => ({ name: join(dir, f), text: readFileSync(join(dir, f), 'utf8') }));

const workerFiles = read('worker');
const longest = workerFiles.map((f) => ({ ...f, lines: f.text.split('\n').length })).sort((a, b) => b.lines - a.lines)[0];
const sqlCount = workerFiles.reduce((n, f) => n + (f.text.match(/\b(SELECT|INSERT|UPDATE|DELETE)\b/g) ?? []).length, 0);

/**
 * Development advisories that could be fixed without a held major version,
 * counted in two piles because the answer differs.
 *
 * Every advisory here lives under wrangler / miniflare /
 * @cloudflare/vitest-pool-workers, and none of it ships: the Worker bundle
 * contains none of those packages and `npm audit --omit=dev` is clean. But
 * *where* the vulnerable copy sits decides what to do about it.
 *
 * - **Ours**: a package this repository names in package.json. Nothing is
 *   holding it; update it. On 11 September 2026 this is what fired — the
 *   top-level wrangler had drifted into an advisory range and a routine bump
 *   to 4.131.0 cleared it, with the held chain untouched.
 * - **The held chain**: a copy nested inside @cloudflare/vitest-pool-workers'
 *   own node_modules, reachable only by moving that package — which
 *   .github/dependabot.yml holds because its next release needs vitest 4. A
 *   non-major fix appearing here means the hold has stopped being the reason
 *   anything is waiting.
 *
 * npm marks each advisory with `fixAvailable`: `true`, or an object with
 * `isSemVerMajor: false`, means it can be fixed without a breaking change.
 *
 * Returns null when the audit could not run at all, so "did not check" is never
 * reported as "nothing found".
 */
function fixableDevAdvisories() {
  let report;
  try {
    const raw = execFileSync('npm', ['audit', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    report = JSON.parse(raw);
  } catch (err) {
    // A non-zero exit is normal here: npm audit exits 1 when it finds anything.
    if (!err.stdout) return null;
    try {
      report = JSON.parse(err.stdout);
    } catch {
      return null;
    }
  }
  const vulns = Object.values(report.vulnerabilities ?? {});
  if (!vulns.length && !report.metadata) return null;
  const fixable = vulns.filter(
    (v) =>
      ['high', 'critical'].includes(v.severity) &&
      (v.fixAvailable === true || (typeof v.fixAvailable === 'object' && v.fixAvailable?.isSemVerMajor === false)),
  );
  const HELD = 'node_modules/@cloudflare/vitest-pool-workers/node_modules/';
  const inHeldChain = (v) => v.nodes?.length > 0 && v.nodes.every((n) => n.startsWith(HELD));
  return { ours: fixable.filter((v) => !inHeldChain(v)).length, chain: fixable.filter(inHeldChain).length };
}

const fixableDev = fixableDevAdvisories();
const auditRan = fixableDev !== null;

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
  {
    id: 'dev-dependency-advisories',
    what: 'Update the development dependency that has a fix, or lift the hold on @cloudflare/vitest-pool-workers — the count below says which.',
    why: 'None of it reaches the deployed Worker, so it waits. It stops waiting when a fix needs neither the held major nor a breaking change.',
    where: 'docs/DEFERRED.md § dev-dependency-advisories',
    trips: [
      // null means the audit could not run; report 0 rather than tripping on a guess, and say so in
      // the label so it is never mistaken for a clean result.
      {
        name: 'ours, with a fix',
        value: fixableDev?.ours ?? 0,
        limit: 0,
        unit: auditRan ? 'advisories' : 'advisories (npm audit DID NOT RUN)',
        extra: 'a package package.json names: nothing is holding these, update them',
      },
      {
        name: 'in the held chain, clearable without a major',
        value: fixableDev?.chain ?? 0,
        limit: 0,
        unit: auditRan ? 'advisories' : 'advisories (npm audit DID NOT RUN)',
        extra: 'the hold has stopped being the reason anything is waiting',
      },
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
