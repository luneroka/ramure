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

**The work.** Keep the development advisories clear: those on packages
`package.json` names, and those on the copies `@cloudflare/vitest-plugin` pins
inside its own `node_modules`. None of it ships — the Worker bundle contains
none of those packages and `npm audit --omit=dev` is clean — so it waits for a
fix that needs no breaking change, and no longer.

**The migration this entry used to defer is done, 2026-11-12.** For two months
the high advisories — `sharp`, `undici`, `ws`, `miniflare`, `wrangler` — all sat
on copies pinned by `@cloudflare/vitest-pool-workers@0.12`, which held vitest
at 3. Every release that needed vitest 4 pinned a wrangler and a miniflare
still inside the advisory ranges, so moving early would have swapped one set
of vulnerable pins for another. Two critical advisories on vitest 3's own
`tinypool` made the wait untenable, and by then the package had been renamed
`@cloudflare/vitest-plugin`, whose 1.8 line pins a wrangler and a miniflare
outside every range. vitest, `@vitest/coverage-v8` and the plugin moved to
vitest 4 together; both test configurations ran against it before the hold in
[.github/dependabot.yml](../.github/dependabot.yml) came off.

**What the tripwire caught before that.** On 2026-09-11 and 2026-10-05 it fired
on packages `package.json` names, each with a routine fix out — a drifted
top-level `wrangler`, then transitive `brace-expansion`, `fast-uri` and
`serialize-javascript`. The held chain was never the reason. That is why the
measure is two counts, by where the vulnerable copy sits.

**What is left, and why.** Moderate and low advisories only: `minimatch` under
eslint and typescript-eslint, whose patched release is a major neither accepts
yet, and `deepmerge` and `glob` under vite-plugin-pwa's workbox, one of which
has no patched release at all. npm's `fixAvailable` for each is an older major
of the parent, which is a downgrade, not a fix.

**What makes it worth doing.**

| Measure                                                                       | Limit | Why that number                                                                                                    |
| ----------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------ |
| High or critical advisories on a package `package.json` names, with a fix     | **0** | Nothing is holding these. They are a routine bump and should never sit.                                            |
| High or critical advisories inside the plugin's pins, fixable without a major | **0** | The plugin pins exact wrangler and miniflare versions; a fixed release of it is a routine bump and should not sit. |

`scripts/check-thresholds.mjs` reads `fixAvailable` from `npm audit --json`:
`true`, or an object with `isSemVerMajor: false`, is npm saying the fix needs no
breaking change. It sorts each advisory by whether every one of its `nodes` sits
under `node_modules/@cloudflare/vitest-plugin/node_modules/`. When the audit
cannot run at all it says so in the label rather than reporting a clean result.

The other trigger has no cheap measure and counts for more: **any of this
becoming reachable from the deployed Worker.** That would mean one of these
packages entered `dependencies` rather than `devDependencies`, which should
never happen silently — `npm audit --omit=dev` in CI is what would say so.

**What it would look like.** A routine bump, most of the time. A major of
vitest is the one deliberate migration: the plugin's peer range ties the two,
so they move together and both test configurations run against it first.

**Recorded** 2026-09-09, from finding S9 of
[SECURITY_AUDIT_2026-09.md](SECURITY_AUDIT_2026-09.md). **Revised** 2026-09-11
after the first firing: top-level `wrangler` bumped to `^4.131.0`, the measure
split in two, and a note added on why 0.22.0 would not have cleared it.
**Revised** 2026-11-12 when the vitest 4 migration landed on
`@cloudflare/vitest-plugin`.

---

## Adding an entry

Keep the shape: the work, why it was deferred, the measurable condition, and a
sketch of what doing it would look like. If the condition can be counted, add
it to `scripts/check-thresholds.mjs` so nobody has to remember to look.
