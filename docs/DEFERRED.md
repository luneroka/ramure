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

## Adding an entry

Keep the shape: the work, why it was deferred, the measurable condition, and a
sketch of what doing it would look like. If the condition can be counted, add
it to `scripts/check-thresholds.mjs` so nobody has to remember to look.
