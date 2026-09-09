# Code hygiene pass — September 2026

_Audited 2026-09-09 against `main @ 1a1ebb0`. Report and plan only: no code was
changed, no database write was made._

A read of the whole repository against the habits proven on `ccig-app` (the
adjacent project: stable error codes, rules-in-force page, boot-time config
validation, secret scanning, auditable structure) and against general practice
for a codebase that AI agents navigate daily.

## Verdict

**The code itself is in better shape than the brief implied.** TypeScript is
strict with `noUncheckedIndexedAccess`; there are **zero** `any` in `src/` and
`worker/`; no `TODO`, `FIXME` or dead-code markers anywhere; every module opens
with a block comment explaining _why_; 189 tests across 46 files all pass; lint
and Prettier are clean. Authorization is applied systematically — every tree,
account and admin route goes through `requireUser` plus a role check, and "not
a member" is a 404 while "wrong role" is a 403. Input validation is
disciplined: byte-capped JSON, magic-byte file sniffing, allow-listed link
schemes, parameter-bound SQL throughout, a real CSP. The hardening passes 0–6
did their job.

**What is missing is not code quality — it is the scaffolding around it.**
Nothing tells an arriving agent what the invariants are, the folder structure
half-committed to an organisation and stopped, the API has no stable error
contract, and the safety nets that catch mistakes automatically (secret
scanning, config validation, an enforced CI gate) are absent or unreachable.
_All three of those closed in pass 1; the CI gate came back by making the
repository public, which is what made its minutes free._

Findings are ordered by consequence. **Tier 1** can produce a production
incident or silent data loss. **Tier 2** costs correctness or agent time daily.
**Tier 3** changes no behaviour and only misleads the next reader.

**Status legend:** `[ ]` open · `[~]` in progress · `[x]` done · `[-]` won't
fix (say why).

---

## Tier 1 — can bite in production

### `[x]` H1. Nothing validates configuration at boot

_Done 2026-09-09, pass 1 — but **not** the way this finding first proposed;
see "How H1 was actually solved" below._

`CODE_PEPPER` is optional in [worker/env.ts](../worker/env.ts), and `hmac()`
in [worker/util.ts](../worker/util.ts) **silently degrades to a plain SHA-256**
when it is absent. That is correct for development and dangerous in
production: a six-digit sign-in code hashed without a pepper is a 10⁶ search
an attacker with a database copy finishes instantly. It is set in production
today — but nothing would tell anyone if a redeploy lost it. The same is true
of `RESEND_API_KEY`: its absence surfaces as a 500 at the moment someone tries
to sign in, not at deploy time.

`ccig-app` refuses to start on incomplete production settings. Ramure should
do the same: a `requireProductionConfig(env)` called once per isolate that
throws when `APP_ORIGIN` is https and a required secret is missing.

#### How H1 was actually solved

Copying ccig's boot-refusal directly would have been a mistake, and the
difference is worth recording. ccig runs in a container: a process that
refuses to start means the deploy fails and the **previous container keeps
serving**. A Worker has no equivalent — throwing from a request handler does
not roll a deployment back, it takes live traffic down. A missing
`ADMIN_EMAIL` would have taken the whole app offline for everyone already
signed in, which is far worse than the problem.

[worker/config.ts](../worker/config.ts) serves the same intent in three
graded ways instead:

1. **Log once per isolate** — every problem appears in the Workers dashboard
   on the first request, without waiting for a user to complain.
2. **Report on `/api/health`** — a one-word verdict (`ok` / `degraded` /
   `misconfigured`) so a deploy can be checked from outside. The settings at
   fault are named on the administration page only; anonymous callers get the
   verdict alone.
3. **Refuse the unsafe operation, not the app** — `requireCodePepper` makes
   `codeHash` throw in production when the pepper is missing. Sign-in fails
   loudly; tree sync, and everyone already signed in, are untouched.

Severity is calibrated to that: `fatal` means an operation refuses (only
`CODE_PEPPER`, whose absence is otherwise _invisible_ — everything keeps
working and the hashes are simply weaker). Everything else is a `warning`,
because a missing mail key breaks new sign-ins but must not break a working
app. Problems carry setting names and reasons, never values — there is a test
asserting that.

### `[x]` H2. No secret scanning, and the CI gate is unreachable

_Pass 1, 2026-09-09. The first attempt was **wrong** and is recorded here
because the mistake is the useful part; see "What H2 turned out to be"._

`ccig-app` runs Gitleaks on every push and pull request. Ramure runs nothing:
[.github/workflows/ci.yml](../.github/workflows/ci.yml) is `workflow_dispatch`
only, so `npm audit` and every other check are effectively never executed
either. The local suite covers correctness, but a human or an agent running it
cannot catch a secret that has already been committed.

Gitleaks is free on public repositories and runs in seconds. This is the one
check worth having automated even with no Actions budget — it should be its
own tiny workflow, not a job inside the disabled one.

#### What H2 turned out to be

The workflow was written, pushed, and **failed on every run** — not on a
finding, but because the job never started: _"recent account payments have
failed or your spending limit needs to be increased."_

The premise was wrong. Gitleaks is free on public repositories, and
`luneroka/ramure` is **private** — so its Actions minutes are metered like
every other workflow's, and the account's are spent. A check that cannot run
is worse than no check: a permanently red mark teaches you to ignore red
marks. The workflow was removed the same hour.

Two things replaced it.

**A local scan.** [scripts/scan-secrets.sh](../scripts/scan-secrets.sh) runs
gitleaks over the whole history and is part of `/preflight`. It exits 127 with
install instructions when gitleaks is absent, so "did not run" can never be
mistaken for "found nothing". First run over 111 commits: **clean**.

**The real fix — make the repository public.** Yoann chose this on
2026-09-09. Public repositories get _unlimited_ Actions minutes, so this does
not merely restore the secret scan: it restores the **entire CI gate** that had
to be disabled, and removes the standing risk that the local suite is skipped
because a human or an agent forgot. That is the largest hygiene win available
here, and it costs nothing.

Checked before recommending it: gitleaks clean over all 111 commits; the only
`.ged` files in history are the two fixtures, whose own header states _« Arbre
entièrement fictif… Toute ressemblance avec des personnes réelles serait
fortuite »_ (the real 124-person file from a friend was never committed); and
the auth design leans on hashed tokens, a peppered code, browser binding and
rate limits rather than on obscurity.

One prerequisite, done in this pass: `ADMIN_EMAIL` held Yoann's personal
address in `wrangler.toml`. Not a credential — sign-in is invite-only and the
flag also lives in the database — but a personal address in readable source is
harvested, and it names the one account worth targeting. It is a secret now.
Public does **not** mean reusable: [COPYRIGHT.md](../COPYRIGHT.md) keeps all
rights reserved, which makes this source-available.

**Closed 2026-09-09.** The repository is public, `ADMIN_EMAIL` is a secret, and
both workflows run again: `ci.yml` (the full suite) and `secret-scan.yml`
(Gitleaks over history). `push` is limited to `main` on both — a PR branch is
already covered by the `pull_request` trigger, and listing both bare would run
every check twice on each push to an open PR.

The local suite stays in `/preflight` and stays expected before a merge: CI is
now the slower second opinion rather than the only gate.

One thing had to be fixed before the restored gate was trustworthy. The e2e job
failed twice in 23 seconds without reaching a test: `playwright install
--with-deps` runs `apt-get update`, which on the runner image also refreshes
Google's Chrome repository, and that index is rotated often enough to be caught
mid-write — apt then fails the whole install on a hash sum mismatch. Playwright
downloads its own Chromium, so that repository is never needed. `ci.yml` now
deletes the apt source, matched **by content** rather than by filename: the
first attempt guessed `google-chrome.list` and matched nothing, because noble
writes a deb822 `.sources` file instead. All four checks green afterwards.

### `[x]` H3. `coverage/` is committed to git

_Done 2026-09-09, pass 1: untracked with `git rm --cached` and added to
`.gitignore`. The files stay on disk; they are simply no longer in git._

40 files under [coverage/](../coverage/) are tracked, including
`coverage-final.json`. It is absent from [.gitignore](../.gitignore), so every
`npm run test:coverage` dirties the working tree and any PR touching coverage
carries dozens of meaningless file changes — which is exactly how a real change
gets waved through unread.

Untrack it and ignore it. Same for `dist/` (already ignored, but present) and
`test-results/` (ignored).

---

## Tier 2 — costs correctness or agent time, daily

### `[x]` H4. The API has no stable error contract

_Done 2026-09-09, pass 2. All 74 `HttpError` sites and all 11 `EditError` sites
carry a code from a registry; the response envelope gained `code` alongside
`error`; `src/app/errorText.ts` is the single translation point; the convention
is written up in [API_ERRORS.md](API_ERRORS.md). Both code sets are union
types, so TypeScript checked every site — and the tests that asserted on prose
now assert on codes, which is the point._

The Worker throws free-text English messages — `'not allowed'`, `'tree not
found'`, `'other device'`, `'invitation required'` — and the browser
distinguishes them by **HTTP status alone**:

```ts
// src/app/hooks/useInvites.ts:25
toast(t(lang, err instanceof ApiError && err.status === 403 ? 'signinOtherDevice' : 'signinExpired'));
```

But the sign-in path throws at least three different 403s (`'other device'`,
`'invitation required'`, `'cross-site request'`), so two of the three produce
a message that is simply wrong. Worse, one site matches the English prose
directly:

```ts
// src/app/hooks/useDrafts.ts:56
err.message === 'choose a family' ? t(lang, 'chooseFamily') : err.message;
```

— which also means raw English error text can reach a French user's screen.

Adopt `ccig-app`'s convention: every expected error carries a stable
`code`, the browser translates by `code` and never by prose or bare status.
`HttpError` already has an `extra` bag to carry it, and `ApiError` already
keeps the parsed body, so this is additive — no route needs restructuring, and
the two can coexist during migration.

### `[x]` H5. `src/app/` is half-organised

_Done 2026-09-09, pass 4: 37 root files into seven folders, `App.tsx` alone at
the root. Moves only — verified below._

_Shape decided by Yoann on 2026-09-09: **by kind, shallow** — the layout below,
not a feature-first tree. Feature-first (`features/tree/components/…`) was
considered and rejected for two reasons. This app's core is **one screen**, so
its features are not separable the way billing and inventory are: the canvas,
the `Workspace` context and the person panel touch each other constantly, and
the boundaries would be artificial. And the repository is worked on mostly by
agents, for which a shallow tree is materially better — a file's home is
guessable from its name, `ls src/app/` stays informative, and there are fewer
wrong path guesses. Do not re-open this without a reason that answers both._

The directory is committed to an organisation it never finished — **37 files
at the root against 36 in subfolders**. `stage/`, `ui/`, `fields/`, `hooks/`
and `session/` exist, but the root still mixes four different kinds of thing:

(Two things that look like disorder here are not. Tests sitting beside their
subject is the _dominant_ TypeScript convention — the Vitest default — and only
looks odd next to ccig-app, which follows the pytest convention of a separate
`tests/` tree. And the rest of `src/` — `gedcom/`, `tree/`, `canvas/`, `sync/`,
`store/` — is cleanly separated already. The mess is one room, not the house.)

| Kind                 | Files at `src/app/` root                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| Top-level screens    | `Home`, `Login`, `Admin`, `Settings`, `Documents`, `Resources`, `Leads`, `MapView`, `Timeline`, `PrintPage` |
| Reusable widgets     | `Modal`, `Lightbox`, `SplitPanes`, `Menus`, `PersonPicker`, `PersonRow`                                     |
| Domain panels        | `PersonPanel`, `PersonEditor`                                                                               |
| Pure logic, no React | `format`, `history`, `report`, `router`, `editorState`, `mapPopup`, `useAuth`                               |

`session/` holds exactly one file. An agent asked to "change the settings
screen" has no way to guess whether it is at the root, in `stage/`, or in
`session/` without listing the directory — and `SettingsHost` in `stage/`
versus `Settings` at the root is a genuine coin-flip.

Proposed shape, moves only, no logic changes:

```
src/app/
  screens/     Home Login Admin Settings Documents Resources Leads MapView Timeline PrintPage
  person/      PersonPanel PersonEditor PersonPicker PersonRow  (+ fields/ moves under here)
  stage/       unchanged — what sits over the canvas
  ui/          + Modal Lightbox SplitPanes Menus   (cross-cutting primitives)
  hooks/       unchanged
  state/       history editorState router useAuth  (was session/ + loose root files)
  lib/         format report mapPopup               (pure helpers)
```

### `[x]` H6. Two test files do not sit beside their subject

_Done 2026-09-09, pass 4: `DateField.test.tsx` now sits in `person/fields/`
beside its subject, and `links.test.ts` is `screens/Leads.test.ts` — named after
what it actually tests, and no longer a second file called `links.test.ts`._

The repo's rule is `foo.ts` → `foo.test.ts`, honoured everywhere except:

- `src/app/DateField.test.tsx` tests `src/app/fields/DateField.tsx` — one
  directory away.
- `src/app/links.test.ts` tests `normalizeUrl` and `safeHref` from
  **`Leads.tsx`**, while an unrelated `src/research/links.ts` has its own
  `src/research/links.test.ts`. Two files named `links.test.ts` testing
  different things, one of them named after neither its subject nor its
  location.

Rename to `Leads.test.ts` and move `DateField.test.tsx` into `fields/`.

### `[x]` H7. Configured dev port and actual dev port disagree

_Done 2026-09-09, pass 5: `port: 5175, strictPort: true`. A busy port now fails
loudly instead of sliding to another one and sending sign-in redirects to an
origin where the session cookie does not exist._

[vite.config.ts](../vite.config.ts) asks for `port: 5173`. Docker holds 5173
on Yoann's machine, so Vite falls through to 5175 — which is what `.dev.vars`
hard-codes as `APP_ORIGIN`. It works by luck: anything else claiming 5174
first shifts Vite again and sign-in redirects land on the wrong origin, with
no error that names the cause.

Pin it: `port: 5175, strictPort: true`. A loud failure beats a silent
misconfiguration.

### `[x]` H8. No `.dev.vars.example`

_Done 2026-09-09, pass 1: [.dev.vars.example](../.dev.vars.example), with the
reason `RESEND_API_KEY` must stay absent spelled out._

`.dev.vars` is correctly git-ignored, and correctly never contains a real key
— but nothing in the repository records what it must contain. A fresh clone
(or a fresh agent) cannot start the API without being told. `ccig-app` tracks
`.env.example` and `.env.production.example` for exactly this reason.

Two lines, no secrets: `APP_ORIGIN=http://localhost:5175` and
`DEV_ECHO_LINKS=1`, with a comment saying `RESEND_API_KEY` is deliberately
absent because echo mode replaces it locally.

### `[x]` H9. The two main design documents are HTML artifacts

_Done 2026-09-09, pass 3. Both are Markdown now, converted with a purpose-built
parser rather than by hand so nothing was reworded in passing. Verified by
diffing the prose word-for-word: the only words not carried across were each
file's `<title>`, which both `<h1>`s already say, plus the "Fit" and "Re-centre"
button labels of the design brief's interactive canvas demo — page chrome, not
document text. Each file gained a header saying it is historical and pointing at
what is true now. With `docs/` all Markdown, it also left `.prettierignore`, so
the documentation is format-checked like the code._

[docs/design-brief.html](design-brief.html) (46 KB) and
[docs/gap-analysis.html](gap-analysis.html) (30 KB) are published-artifact
HTML. They are excluded from both Prettier and ESLint, they do not diff
usefully, and an agent grepping for a decision reads markup instead of prose —
at roughly four times the token cost of the same text.

Convert both to Markdown in the repo as the source of truth. The published
artifacts stay where they are for reading; the repo copy is what agents and
`git blame` work on.

---

## Tier 3 — misleads the reader, changes nothing

### `[x]` H10. The `@/*` alias is configured and never used

_Done 2026-09-09, pass 4. Adopted: **352** aliased imports, and **zero**
`../../` climbs remain (was 105). One deliberate exception — the shared core
(`src/tree/`, `src/gedcom/`, `src/util/`) keeps relative imports, because it is
compiled into the Worker and the Worker's build resolves no alias. That is not
a convention anyone has to remember: `npm run typecheck` fails on a `@/…` there
with `TS2307: Cannot find module`, which was tested by breaking it on purpose
and watching it fail._

Declared in [tsconfig.json](../tsconfig.json) _and_
[vite.config.ts](../vite.config.ts), used **zero** times. Meanwhile 105 imports
climb with `../../`. Either adopt it in `src/app/` (where the nesting is
deepest and the restructure in H5 will deepen it further) or delete both
declarations. A configured-but-unused alias invites an agent to use it in one
file and produce an inconsistent codebase.

Recommendation: adopt it, as part of H5 — the moves rewrite those import paths
anyway.

### `[-]` H11. `src/styles.css` is 3252 lines in one file

_**Won't fix as proposed** — 2026-09-09, pass 5. The finding asked for a split
into `src/styles/`. Doing it would have made the file harder to navigate, not
easier, and the reasoning is worth keeping._

_A split has to preserve cascade order, so the files must be contiguous slices
of the original. But the rules for one component are **not** contiguous: the
person panel alone lives in five clusters between lines 390 and 2167, and menu
rules run from 703 to 3254. A file called `person.css` would therefore hold one
fifth of the person styles, with the rest scattered through `account.css` and
`screens.css` — names that actively lie._

_Grouping them honestly means reordering, and that is the dangerous option:
**27 selectors are declared more than once** (`.panel` three times, `.topbar`,
`.union`, `textarea:focus` twice each), so source order decides which
declaration wins. Reordering changes that silently, and a screenshot would not
catch a specificity conflict on a state nobody photographed._

_What was done instead, at no risk: an index at the top listing every section in
source order, so the file is navigated by searching for a banner rather than
scrolled; and the one section named after **when** it was written — « Phase 2:
editing » — renamed for **what** it styles. The reasoning is repeated in the
file itself so the next reader does not re-propose the split._

_Revisit only alongside a deliberate CSS refactor with visual regression
coverage, which is a project, not hygiene._

Sectioned by comment banners, which is better than nothing, but one section is
named `/* ---------- Phase 2: editing ---------- */` — organised by _when it
was written_ rather than what it styles. Finding the rule for a component
means scrolling or grepping a guessed class name.

Split by concern into `src/styles/` (`base`, `canvas`, `panel`, `forms`,
`menus`, `screens`, `print`) with one `styles.css` importing them. Purely
mechanical; no cascade order changes if the import order matches today's file
order.

### `[x]` H12. `src/db.ts` sits outside the abstraction that owns it

_Done 2026-09-09, pass 4: it is `src/store/idb.ts`, inside the abstraction that
is its only caller._

`src/store/` exists precisely so that nothing reaches past it to raw storage —
and `src/db.ts`, the IndexedDB layer it wraps, sits at the `src/` root beside
`i18n.ts` and `main.tsx`, as though it were a top-level concern. It is
imported only by `src/store/local.ts`. Move it to `src/store/idb.ts`.

### `[x]` H13. No LICENSE

_Decided by Yoann 2026-09-09: free of charge, not free to reuse.
[COPYRIGHT.md](../COPYRIGHT.md) states all rights reserved, with the reason the
source is published at all. Deliberately reversible — it can be opened up
later; MIT could not have been taken back._

The README calls Ramure "a free family-tree builder". With no licence file the
repository is, legally, all rights reserved — the opposite of what it says.
Pick one deliberately (MIT if "free" means free to reuse; none, stated
explicitly, if it means free of charge only).

### `[x]` H14. `.claude/launch.json` points at the wrong port

_Done 2026-09-09, pass 5, with H7._

It launches `npm run dev` expecting port 5173; see H7. Fold into that fix.

---

## Execution plan

Five branches, in this order. Each is one PR, each ends with the full
preflight suite green, each is independently revertible. The order matters:
the safety nets land before the invasive moves, so a mistake in pass 4 is
caught by something.

| Pass | Branch                  | Findings                                     | Risk     | Why here                                                                                                                                                                   |
| ---- | ----------------------- | -------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `hygiene-1-safety-nets` | H1, H2, H3, H8, H13                          | Low      | Nothing structural. Config validation and secret scanning must exist _before_ the passes that move files around.                                                           |
| 2    | `hygiene-2-error-codes` | H4                                           | Medium   | Touches every route and several call sites, but purely additive. Needs its own PR to be reviewable.                                                                        |
| 3    | `hygiene-3-docs`        | H9, plus wiring the new docs into the README | Low      | Prose only. Lands before the restructure so the architecture map is available while reviewing it.                                                                          |
| 4    | `hygiene-4-structure`   | H5, H6, H10, H12                             | **High** | Pure file moves and import rewrites. Verified by the test suite passing unchanged — if a test needed editing beyond its import path, something moved that should not have. |
| 5    | `hygiene-5-styles`      | H11, H7, H14                                 | Low      | Mechanical CSS split plus the port pin. Last because it is the easiest to eyeball and the easiest to defer.                                                                |

### Rules for the passes

- **Pass 4 changes no logic.** Not one line inside a function body. Moves and
  import paths only. If a diff shows anything else, split it out.
- **No pass touches behaviour** except pass 2, which changes what an error
  response _carries_ — never its status code.
- Run `/preflight` before each merge and say in the PR that it passed.
- After each pass, tick its findings above and update the memory note on pass
  status.

### Deliberately not in scope

- **Rewriting the sync engine, layout or GEDCOM parser.** They are the most
  tested code in the repository and they work.
- **Adding a component library or CSS framework.** The hand-written CSS is
  coherent and small; replacing it is a redesign, not hygiene.
- **Turning CI back on.** Actions minutes are exhausted and will not be paid
  for. The Gitleaks workflow in pass 1 is the single exception, and it costs
  seconds.
- **Splitting `worker/` further.** Nine route files averaging 200 lines is
  already the right size.
