# Ramure — working agreement

Read this before touching the code. It is the contract every agent and every
human works to. It is short on purpose: the reasoning lives in `docs/`, and
this page only says what you must not get wrong.

## What this is

A family-tree builder whose whole point is the tree: one canvas, the entire
lineage. React + Vite in the browser, a single Cloudflare Worker serving both
the built app and `/api/*`, D1 for data, R2 for files, Resend for mail.

The domain object is a **GEDCOM document**. Not a row set, not a graph
database — the literal GEDCOM text is the source of truth, stored in one D1
column, and every edit is an op replayed against it. Keep it that way: a
backup is readable in any genealogy program, with or without Ramure.

Deployed at <https://ramure.ramure.workers.dev>. `main` auto-deploys through
Cloudflare Workers Builds.

## Non-negotiables

1. **Never commit a secret.** `RESEND_API_KEY` and `CODE_PEPPER` are set by
   Yoann with `wrangler secret put` and never appear in a file, a commit, or a
   conversation. `.dev.vars` holds `APP_ORIGIN` and `DEV_ECHO_LINKS` only —
   a placeholder API key there breaks sign-in.
2. **Registration is invite-only.** There is no public sign-up and there will
   never be one. Any change to the sign-in path must keep the closed door
   (`mayEnter` in [worker/admin.ts](worker/admin.ts)).
3. **Every API route authorises.** No route reads or writes a tree, an
   account or an admin surface without `requireUser` and a `requireRole` /
   `requireAccountRole` / `requireAdmin` call. There is no exception; adding a
   route without one is a security bug, not a shortcut.
4. **The full local suite passes before any merge.** See below. CI runs on
   every push to main and every pull request, but a green tick there is not a
   reason to skip the local run — it is the slower second opinion, not the
   first. Never report a check as passing that you did not run.
5. **Migrations are forward-only and numbered.** Add `migrations/00NN_*.sql`;
   never edit an applied one. When a schema changes, run `npm run db:migrate`
   against production before merging.

## The pre-merge suite

Run all of it, in order, and say in the PR that you did:

```bash
npm run lint
npm run typecheck
npm run format:check
npm test
npm run build
npm run test:worker
npx playwright test        # after: npm run build && restart npm run dev:api
./scripts/scan-secrets.sh   # gitleaks over the whole history
```

`/preflight` runs this for you.

## How work is shaped

One concern per branch, tests written with the work, then a PR merged with
`gh pr merge` so GitHub records it as merged (fast-forwarding locally leaves
PRs showing "closed"). Commit and push without asking. Commit subjects are
sentences describing the change from the reader's side — look at
`git log` and match the register; they are not conventional-commit prefixes.

## Conventions that already hold — keep them

These are not aspirations; the codebase honours them today. Breaking one is a
regression.

- **TypeScript is strict**, with `noUncheckedIndexedAccess`. There are zero
  `any` in `src/` and `worker/`. Keep it at zero.
- **Every module opens with a block comment** saying what it is _for_ and why
  it works the way it does — not what the next line does. Match that density.
- **Tests sit beside their subject**: `foo.ts` → `foo.test.ts`. Pure logic
  (`src/tree/`, `src/gedcom/`, `src/sync/`) is covered under coverage
  thresholds in [vite.config.ts](vite.config.ts); components get behaviour
  tests through Testing Library.
- **User-facing text is never inline.** Every string goes through
  [src/i18n.ts](src/i18n.ts) with `fr` and `en`. French is the default. A
  parity test fails if a key is missing a language.
- **Prose in comments and docs is British-English, plain, and explains the
  why.** No decoration, no changelog entries in code.
- **Errors carry stable codes, never prose.** `HttpError(status, code, extra?)`
  with the code registered in [worker/errorCodes.ts](worker/errorCodes.ts); the
  browser translates through `errorText()` and never branches on status or
  message. See [docs/API_ERRORS.md](docs/API_ERRORS.md).
- **The worker validates every input**: `readJson` with a byte cap,
  `requireId`, `normaliseEmail`, explicit `slice()` on every free-text field.
  Nothing reaches D1 unvalidated, and every query is parameter-bound.

## Where things live

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full map. The short
version:

| Path          | What belongs here                                                            |
| ------------- | ---------------------------------------------------------------------------- |
| `src/gedcom/` | Parse, repair, serialise, dates. Pure, no React, no DOM.                     |
| `src/tree/`   | The domain: layout, ops, kinship, audit, diff. Pure. Shared with the Worker. |
| `src/canvas/` | Canvas 2D renderer and the gesture wrapper.                                  |
| `src/sync/`   | Op-log sync: rebase core, engine, API client.                                |
| `src/store/`  | Storage interfaces and their IndexedDB implementations.                      |
| `src/app/`    | React shell, screens, hooks, UI. The only place React lives.                 |
| `worker/`     | Hono routes, auth, D1 access, mail, cron jobs.                               |
| `migrations/` | D1 schema, forward-only.                                                     |
| `docs/`       | Design brief, architecture, rules in force, plans.                           |

**`src/tree/` and `src/gedcom/` are imported by the Worker.** They must stay
free of DOM and React or the Worker build breaks. This is enforced by
`worker/tsconfig.json`, which includes exactly those two directories.

## Before you change behaviour

Read [docs/RULES_IN_FORCE.md](docs/RULES_IN_FORCE.md). It lists every
non-obvious rule the app enforces with the reason it exists, so a deliberate
decision is not "fixed" into something weaker. If the code and that page
disagree, the page is wrong — correct it in the same PR.

## What Yoann wants from you

Build and report. He decides how the app gets used, who is invited, and on
what device it is tried — do not suggest any of that. Report what was built
and what was verified, plainly.
