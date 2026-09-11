# Ramure — architecture

How the pieces fit and where new work goes. Written for someone (or something)
arriving cold and needing to find the right file in one hop.

## One process, two halves

A single Cloudflare Worker serves everything: the built SPA from `./dist` as
static assets, and `/api/*` from Hono routes. One origin, so no CORS, and the
session cookie just works. `run_worker_first = ["/api/*"]` in
[wrangler.toml](../wrangler.toml) is what splits the two.

```
browser                              Cloudflare Worker
┌────────────────────────┐           ┌──────────────────────────┐
│ src/app     React      │  /api/*   │ worker/index.ts   Hono   │
│ src/canvas  renderer   │ ────────► │ worker/auth       session│
│ src/tree    layout+ops │           │ worker/trees      doc+ops│──► D1
│ src/gedcom  parse/ser. │           │ worker/accounts   roles  │──► R2
│ src/sync    engine     │ ◄──────── │ worker/admin      operator│──► Resend
│ src/store   IndexedDB  │  ops/doc  │ worker/maintenance cron  │
└────────────────────────┘           └──────────────────────────┘
```

`src/tree/` and `src/gedcom/` run on **both** sides — the Worker replays the
same ops against the same parser the browser used. That shared core is why
they must never import React or touch the DOM.

## The data model in one paragraph

A tree is a GEDCOM document (one `doc` column in D1) plus a `version` — the
number of ops applied to it. Clients hold a local copy, apply ops optimistically,
and push them with the version they built on. The server replays them onto the
current document inside one D1 batch and either advances the version or answers
409 with the ops the client is missing, so it can rebase and retry. Nothing is
stored twice: `tree_ops` is the history, `doc` is the fold of that history, and
`tree_snapshots` holds occasional whole-document copies for restore.

## Module boundaries

### `src/gedcom/` — the file format

Pure functions over GEDCOM text. `tokenizer` → `parse` → `model`, and
`serialize` back out. `geneweb.ts` holds the repair pass for Geneanet exports
(applied at import only, never on stored documents). `dates.ts` and
`humanDate.ts` turn what people type ("vers 1860", "15 vendémiaire an III")
into GEDCOM dates and back.

No React, no DOM, no I/O. Everything here is unit-tested against
[fixtures/](../fixtures/).

### `src/tree/` — the domain

The rules of genealogy as this app understands them, again pure.

- `ops.ts` — the edit vocabulary. Every mutation is an `Op`; `applyOp` is the
  only way a tree changes.
- `replay.ts` — fold a sequence of ops onto a tree, separating domain
  refusals from bugs. Shared with the Worker.
- `diff.ts` — the generic inverse of any edit, with record fingerprints; this
  is how undo and redo work.
- `layout.ts` / `layoutAll.ts` — the hourglass, ancestors and descendants
  layouts. The expensive part; worker-ready by design.
- `kinship.ts`, `ancestry.ts`, `timeline.ts`, `places.ts`, `audit.ts` —
  derived views over a tree.

### `src/canvas/` — drawing

`renderer.ts` paints a `Layout` onto a Canvas 2D context at one of three
detail bands. `TreeCanvas.tsx` is the React wrapper that owns the element,
the camera and the gestures, and exposes a `TreeCanvasHandle`. Layout in,
pixels out: the renderer knows nothing about React state.

### `src/sync/` — keeping copies together

- `api.ts` — the typed HTTP client. The only place `fetch` is called.
- `rebase.ts` — the pure core: given incoming ops and local pending ops, what
  survives, what is dropped, what needs a notice.
- `engine.ts` — the stateful part: outbox, pull paging, retries, status
  transitions, storage failures. Dependencies are injected so it is testable
  under Node.
- `pendingEdits.ts` — the outbox on disk.

### `src/store/` — persistence

`types.ts` declares `TreeStore` and `MediaStore`; `local.ts` implements them
over IndexedDB; `cloudMedia.ts` is the cache-through store used when a cloud
tree is open. `index.ts` is the single swap point — components never reach
past it. `idb.ts` is the raw IndexedDB key-value layer underneath.

### `src/print/` — paper

`charts.ts` turns a tree and a subject into one sheet of SVG: the fan and the
pedigree chart. Pure, like `src/tree/`, so the same function is unit-tested and
printed. It fits the drawing to the paper rather than the other way round — the
radius follows the sweep, the rings taper outward, and a ring nobody is in is
not drawn — and it reports back how much it managed to fit.

`poster.ts` is the other half of the answer: both charts are built from a Sosa
table and so can only ever show one person's direct ancestors. The poster takes
`layoutEverything` — the same layout the canvas draws for « Vue d'ensemble » —
and tiles it over as many sheets as a readable size needs, culling each sheet to
what crosses it. `sheetPlan` is the arithmetic on its own, so the sheet limit can
be tested on a wall-sized tree without building one.

`text.ts` is the measuring tape both need to fit words without a DOM, and
`person.ts` the short name-and-years form they both put on a card.

### `src/app/` — the React shell

`App.tsx` is a wiring file: it decides who is signed in, which route, and
which tree, then hands everything below a `Workspace` context
(`session/Workspace.tsx`) and a UI context (`ui/UiContext.tsx`). Screens read
those; they do not thread props down.

Routing is hash-based (`router.ts`) with French paths — `#/arbre/<id>`,
`#/parametres`, `#/administration`.

Seven folders, never more than two deep, so a file's home is guessable from
its name:

| Folder     | What belongs here                                                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `screens/` | What a route renders: `Home`, `Login`, `Admin`, `Settings`, `Documents`, `Resources`, `Leads`, `MapView`, `Timeline`, `PrintPage`. |
| `person/`  | The person panel, its editor, the pickers that feed them, and `fields/` — the guided date, place and portrait inputs.              |
| `stage/`   | Everything that sits over the canvas: the top bar, the HUD, search, the add-relative menu, the hosts that mount panels.            |
| `ui/`      | Cross-cutting primitives with no domain knowledge: `Modal`, `Lightbox`, `SplitPanes`, `Menus`, `icons`, `ErrorBoundary`.           |
| `hooks/`   | The shell's state machines, one concern each (`useBoot`, `useAccounts`, `useTreeSession`, `useEditing`, `useSnapshots`…).          |
| `state/`   | What the shell knows and how it changes: `Workspace` (the context), `history`, `editorState`, `router`, `useAuth`.                 |
| `lib/`     | Pure helpers, no React: `format`, `report`, `mapPopup`, `errorText`.                                                               |

`App.tsx` stays at the root — it is the entry point and belongs to no folder.
Tests sit beside their subject.

### Imports

`@/…` across directories, `./x` within one, and never `../../`. The one
exception is the shared core — `src/tree/`, `src/gedcom/`, `src/util/` — which
uses relative imports because it is compiled into the Worker, whose build
resolves no alias. `npm run typecheck` fails if that rule is broken.

### `worker/` — the API

One Hono app, one file per surface, all mounted in `index.ts`:

| Route             | File          | Who may reach it                     |
| ----------------- | ------------- | ------------------------------------ |
| `/api/auth/*`     | `auth.ts`     | anyone (rate-limited)                |
| `/api/accounts/*` | `accounts.ts` | account members, by role             |
| `/api/trees/*`    | `trees.ts`    | tree members, by role                |
| `/api/invites/*`  | `accounts.ts` | invited addresses                    |
| `/api/admin/*`    | `admin.ts`    | `is_admin` only                      |
| `/api/errors`     | `errors.ts`   | signed-in browsers reporting crashes |

Shared: `util.ts` (ids, hashing, `HttpError`, input validation), `env.ts`
(bindings and per-request vars), `ratelimit.ts` (fixed windows in D1),
`mail.ts` (Resend, with an echo mode for development), `media.ts` (magic-byte
sniffing), `backup.ts` and `maintenance.ts` (the nightly cron).

## Request lifecycle

1. `secureHeaders` middleware, then a same-origin check on every non-GET.
2. The session cookie is hashed and looked up; `c.set('user', …)` — or `null`.
3. The route calls `requireUser`, then a role check that throws 404 for
   "not a member" and 403 for "member, wrong role".
4. Body through `readJson` with a byte cap, fields validated and clamped.
5. Work happens; failures throw `HttpError`, caught by `app.onError`.

## Where to add a thing

| You are adding…               | It goes…                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| A new kind of edit            | `src/tree/ops.ts` (the op + `applyOp` + its inverse in `diff.ts`), then the UI that builds it |
| A GEDCOM tag or dialect quirk | `src/gedcom/parse.ts` or `geneweb.ts`, with a fixture test                                    |
| A new screen                  | `src/app/`, a route in `router.ts`, strings in `i18n.ts`                                      |
| A derived view of a tree      | `src/tree/`, pure, with tests — never inside a component                                      |
| A new API surface             | a file in `worker/`, mounted in `index.ts`, with a role check and tests                       |
| A schema change               | a new `migrations/00NN_*.sql`, applied locally and remotely                                   |
| Anything drawn on the canvas  | `src/canvas/renderer.ts`, fed by a `Layout` field you add in `src/tree/layout.ts`             |

## Local development

```bash
npm run db:migrate:local   # once
npm run dev:api            # Worker on :8787 with emulated D1 and R2
npm run dev                # app on :5175, /api proxied to :8787
```

Sign-in links and codes are shown in the app instead of emailed while
`DEV_ECHO_LINKS` is set in `.dev.vars`.

Playwright runs against the **built** app served by `wrangler dev` on 8787,
not against the Vite dev server — so `npm run build` must precede it, and the
Worker must be restarted after a rebuild.
