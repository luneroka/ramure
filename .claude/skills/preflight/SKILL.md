---
name: preflight
description: Run Ramure's full pre-merge check suite locally — lint, typecheck, format, unit tests, build, Worker tests, and the Playwright journey. Use before opening or merging any PR, or whenever asked to "run the checks", "run CI", or confirm a branch is green. GitHub Actions is manual-only on this repo, so this is the only gate.
---

# Preflight

GitHub Actions on this repo runs on `workflow_dispatch` only — the account's
free minutes are gone and will not be paid for. This suite is therefore the
real gate, and it runs locally. Never report a check as green that you did not
actually run.

## Run, in this order

Stop at the first failure, fix it, then start again from the top. A later step
can only be trusted if the earlier ones passed.

```bash
npm run lint
npm run typecheck
npm run format:check
npm test
npm run build
npm run test:worker
```

`npm run typecheck` checks both projects — the app and the Worker, which have
separate tsconfigs. `npm run format:check` fails on unformatted files; fix with
`npm run format`, do not hand-edit whitespace.

## Then the end-to-end journey

Playwright runs against the **built** app served by `wrangler dev`, not the
Vite dev server. So the build above must have just succeeded, and the Worker
must be restarted so it picks up the new `dist/`:

```bash
# stop any running `npm run dev:api`, then:
npx playwright test
```

The Playwright config starts `wrangler dev --port 8787` itself with
`reuseExistingServer: true` — which is exactly the trap: a Worker left running
from before the build will serve the **old** bundle and the journey will pass
against stale code. If `dev:api` was already running, kill it first.

`e2e/global-setup.ts` applies local migrations and inserts a fresh invitation
per run, because an address only gets three sign-in mails per quarter hour.

## If the schema changed

A migration must be applied to production **before** the PR merges, or the
auto-deploy from `main` will hit a schema that does not exist yet:

```bash
npm run db:migrate:local   # verify it applies cleanly
npm run db:migrate         # production, before merging
```

## Reporting

Say which commands ran and what they returned. If you skipped a step — no
browser available for Playwright, say — state that plainly rather than
implying the suite passed whole. Then merge with `gh pr merge` so GitHub
records the PR as merged; fast-forwarding locally leaves it showing "closed".
