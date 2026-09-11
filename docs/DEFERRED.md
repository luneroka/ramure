# Deferred work

Work that was considered, judged not worth doing **yet**, and given a condition
that says when it becomes worth doing.

A deferral without a trigger is just something forgotten on purpose. Each entry
here names a measurable condition, and `scripts/check-thresholds.mjs` evaluates
the mechanical ones on every `/preflight` run. When a tripwire fires it prints
loudly and blocks nothing — it is a conversation to have, not a task to start
in the middle of something else.

**If you are an agent and a tripwire fired:** finish what you were asked to do,
then tell Yoann which one fired and what it would take. Do not begin the
deferred work uninvited, and do not stay quiet about it either.

---

## `worker-repository-layer`

**The work.** Extract a repository layer in `worker/`. SQL currently sits
directly inside route handlers — there is no equivalent of ccig-app's
`app/repositories/`, and no ORM.

**Why it was deferred.** It is genuinely fine at this size. Nine route files
averaging ~200 lines, and each query is read in the same screen as the rule it
serves, which makes the routes unusually easy to follow. Adding a layer now
would cost indirection and buy nothing.

**What makes it worth doing.** Either of:

| Measure                                | Limit         | Why that number                                                                                          |
| -------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------- |
| Longest file in `worker/`              | **600 lines** | `trees.ts` was 414 when this was written. Past 600 a route file stops being readable in one sitting.     |
| Inline SQL statements across `worker/` | **200**       | 142 when written. Past 200 the same query starts being written twice, and a schema change means hunting. |

A third trigger has no cheap measure but counts for more than either: **the
same query written in two places, then changed in only one.** If you find that,
the layer is overdue whatever the counters say.

**What it would look like.** `worker/repositories/*.ts`, one module per table
group, each exporting functions that take the `D1Database` and typed arguments
and return typed rows. Routes keep the authorisation checks and the rules; they
stop holding SQL. Migrate one surface at a time — `trees.ts` first, since it is
the largest — never all at once.

**Recorded** 2026-09-09, after the hygiene passes. Raised by Yoann as
"mark this down for later, and find a way for this to be triggered once a
certain threshold is reached".

---

## `dev-dependency-advisories`

**The work.** Lift the hold on `@cloudflare/vitest-pool-workers` in
[.github/dependabot.yml](../.github/dependabot.yml) and clear the development
advisories that come with it.

**Why it was deferred.** `npm audit` reports ten, six of them high — `sharp`
(libvips and libheif), `undici`, `ws`, `esbuild` — and every one lives under
wrangler / miniflare / `@cloudflare/vitest-pool-workers`. **None of it ships.**
The Worker bundle contains none of those packages and `npm audit --omit=dev` is
clean. The realistic exposure is a developer's own machine: the `esbuild`
advisory lets a page the developer visits read from the local dev server while
it is running, and `sharp` needs a hostile image reaching miniflare's image
emulation, which Ramure never invokes.

And it cannot be fixed today. `npm audit fix --force` wants
`@cloudflare/vitest-pool-workers@0.22.0`, which needs vitest 4, which
`dependabot.yml` holds at 3 on purpose — that hold was added on 2026-09-09 after
a Dependabot pull request that could not install at all, because the package is
`0.x` and npm treats 0.12 → 0.22 as a minor bump carrying a peer dependency on
the next vitest major.

**What the tripwire caught, 2026-09-11 — and it was not the hold.** The count
went to one, and the advisory was on **our own** top-level `wrangler`, which had
drifted into the range `4.16.0 – 4.130.0`. Nothing was holding it: `4.131.0`
was published and clear, and a routine bump fixed it. The held chain was not
involved.

That is worth stating because the hold had been assumed to be the only thing
standing between the tree and a fix, and it is not. So the measure is now two
counts, by where the vulnerable copy sits: a package `package.json` names, which
is ours to update today, or a copy nested inside
`@cloudflare/vitest-pool-workers`' own `node_modules`, which only moves when
that package does.

**Checked at the same time: the held major would not clear any of this.**
`@cloudflare/vitest-pool-workers@0.22.0` pins `wrangler 4.124.0` and
`miniflare 5.20260815.0-alpha`, and both sit **inside** the advisory ranges
(`4.16.0 – 4.130.0` and `3.20250204.0 – 5.20260908.0-alpha`). Doing the vitest-4
migration today would swap one set of vulnerable pins for another and clear only
the `esbuild` advisory, which is `low`. npm's own `fixAvailable` names 0.22.0 as
the fix for `sharp`, `undici`, `ws` and `miniflare`; on these exact pins it is
wrong. The hold is therefore still right, but for a different reason than the
one first written down: **upstream has not shipped a fixed release**, rather than
**we are refusing the one that exists**.

**What makes it worth doing.**

| Measure                                                                    | Limit | Why that number                                                                                                       |
| -------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------- |
| High or critical advisories on a package `package.json` names, with a fix  | **0** | Nothing is holding these. They are a routine bump and should never sit.                                               |
| High or critical advisories inside the held chain, fixable without a major | **0** | Any at all means the hold has stopped being the reason anything is waiting, and the migration below becomes the work. |

`scripts/check-thresholds.mjs` reads `fixAvailable` from `npm audit --json`:
`true`, or an object with `isSemVerMajor: false`, is npm saying the fix needs no
breaking change. It sorts each advisory by whether every one of its `nodes` sits
under `node_modules/@cloudflare/vitest-pool-workers/node_modules/`. When the
audit cannot run at all it says so in the label rather than reporting a clean
result.

The other trigger has no cheap measure and counts for more: **any of this
becoming reachable from the deployed Worker.** That would mean one of these
packages entered `dependencies` rather than `devDependencies`, which should
never happen silently — `npm audit --omit=dev` in CI is what would say so.

**What it would look like.** One deliberate migration, not a routine bump:
vitest 3 → 4 and `@cloudflare/vitest-pool-workers` together, since the peer
range ties them. Both test configurations run against it before the hold comes
off dependabot.

**Recorded** 2026-09-09, from finding S9 of
[SECURITY_AUDIT_2026-09.md](SECURITY_AUDIT_2026-09.md). **Revised** 2026-09-11
after the first firing: top-level `wrangler` bumped to `^4.131.0`, the measure
split in two, and the note above added about what 0.22.0 actually pins.

---

## Adding an entry

Keep the shape: the work, why it was deferred, the measurable condition, and a
sketch of what doing it would look like. If the condition can be counted, add
it to `scripts/check-thresholds.mjs` so nobody has to remember to look.
