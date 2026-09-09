> **Historical.** The hardening audit of 9 September 2026 and its passes 0–6,
> all of which shipped that day. Kept for the reasoning behind the changes, not
> as a description of the present. The current work is tracked in
> [HYGIENE_2026-09.md](HYGIENE_2026-09.md); what the app enforces today is in
> [RULES_IN_FORCE.md](RULES_IN_FORCE.md).
>
> Converted from the published artifact to Markdown on 9 September 2026 so it
> diffs, greps and reviews like the rest of the repository. Text unchanged.

# Ramure, gap analysis and refactoring plan

_9 September 2026 · state of main at commit 6715207 · three independent code reviews plus checks on the live deployment_

You asked for an honest account of what was built quickly, what that costs, and how it gets fixed. This is that account. It covers security, data integrity, the platform limits, the frontend, testing, and operations, then lays out the passes in order with what each one buys.

## Verdict

**Usable for your friend's trial, with two precautions.**

Export the tree as GEDCOM from the tree menu every few days, and keep the number of people under a few thousand until the first pass below lands. The data model, the sync core and the authorisation rules are sound. What is missing is the armour around them: hardened headers, limits that match the platform, and recovery paths when something goes wrong.

**Update, 9 September evening: passes 0 and 1 are live.**

Sign-in is invitation-only with an access-request path, media is typed from its bytes and served sandboxed, every page carries security headers, the sync limits match the platform, sign-in links and codes only work from the browser that asked, and the API is covered by 22 tests in CI. The critical items above are closed; the sync-honesty work of pass 2 is next.

**Where the shortcuts were taken, plainly.**

Speed went into features and the canvas. It did not go into: a test suite for the API and the sync engine, checking Cloudflare's hard limits against the code's own constants, security headers, an architecture that keeps the main component under control, and operational safety nets such as backups you could restore per tree. Each of those is listed below with its fix.

## What holds up

So the picture is fair, these parts came through the reviews clean: sign-in tokens are 256-bit, stored hashed, single-use and short-lived; the session cookie has the right flags; every write checks the origin; every query is parameterised; every route checks account membership and role; pushes are one atomic transaction guarded by a version counter with idempotent op ids; the edit layer is pure and deterministic, so two devices replaying the same ops converge; undo and redo are ordinary ops that sync; GEDCOM round-trips of Ramure's own files are byte-stable; TypeScript is strict with zero `any`; the dependency surface is four packages.

## Gaps, by area

### Security

| Severity | Gap                                                                                                                                             | Consequence                                                                                                                            | Fix                                                                                                                                                             |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| critical | Uploaded SVG is accepted as an image and served back on the app's own origin with no protective headers                                         | An editor can run script with any member's session: promote themselves, export every tree, delete trees                                | Allow-list JPEG, PNG, WebP, GIF, HEIC, PDF by magic bytes; serve media with nosniff, a sandboxing CSP and attachment disposition; later a separate media origin |
| critical | No security headers at all on pages or API                                                                                                      | Any injected script anywhere has free rein over trees held in the browser                                                              | Content-Security-Policy, HSTS, nosniff, frame-ancestors none, Referrer-Policy via a `_headers` file and Hono secure headers                                     |
| high     | A place name is inserted unescaped into the map tooltip; link addresses accept any scheme                                                       | Stored script through a place name; `javascript:` links in leads and resources                                                         | Escape the tooltip like the popup already is; allow only http, https and mailto at save and at render                                                           |
| high     | Sign-in link signs you in on a plain GET                                                                                                        | Mail scanners consume links (the Outlook failure your friend hit); a victim can be signed into an attacker's account by opening a link | The link lands on the app, which posts the token; bind link and code to the browser that asked                                                                  |
| high     | No rate limiting by IP; code attempts reset with each new link; anyone can lock an address out                                                  | Slow brute force of the six-digit code; denial of sign-in for a targeted member; mail quota exhaustion                                 | Per-IP limits on the auth routes, failure counting per address across links, body size limits, a daily send cap                                                 |
| high     | Sign-in and invite tokens travel in URLs, which land in Cloudflare's request logs; invites are reusable for 30 days                             | Anyone with dashboard access can join any family account                                                                               | Tokens in the URL fragment and in POST bodies; shorter, single-use invites; lower log sampling                                                                  |
| high     | An undo-style record patch can delete every record without the guard snapshot that ordinary deletes get                                         | An editor can erase a tree; recovery only by database restore                                                                          | Treat large or destructive patches as destructive: snapshot first, owner-only above a threshold                                                                 |
| medium   | No quotas on trees, snapshots or accounts; each snapshot is a full copy                                                                         | One member can fill the database for everyone                                                                                          | Retention on snapshots, caps per account, compressed documents                                                                                                  |
| medium   | Malformed JSON and unvalidated op envelopes return 500s; a dev flag could echo sign-in codes if the mail key ever went missing in production    | Noise, crashes, a takeover footgun                                                                                                     | Validate every body and envelope; honour the echo flag only on localhost                                                                                        |
| low      | Sessions never rotate or expire on idle, expired rows are never purged; viewers see every member's email; no way to delete an account or a user | Hygiene and a GDPR gap                                                                                                                 | Idle timeout, sign out everywhere, nightly purge, emails to owners only, account deletion flow                                                                  |

### Data integrity and the platform's real limits

| Severity | Gap                                                                                                                                                                                                          | Consequence                                                                                                                                         | Fix                                                                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| critical | The code allows 25 MB documents and pushes up to 200 ops in one query; Cloudflare D1 caps a row at 2 MB and a query at 100 bound parameters                                                                  | A tree past roughly 4,000 people, or a device returning from a day offline with 100 edits, fails to sync permanently with the edits trapped locally | Push at most 50 ops per request, drop the parameter-heavy pre-check, measure documents in bytes with a real limit and message; move documents to R2 when trees grow          |
| critical | Every push parses and re-serialises the whole document on the server; the free plan allows 10 ms of CPU per request                                                                                          | Above a few hundred people every save fails on the free plan                                                                                        | Workers Paid plan, and a Durable Object per tree holding the parsed tree, which also serialises concurrent pushes                                                            |
| high     | Two people editing the same person within the 20-second window: the second save overwrites the first, silently                                                                                               | Lost edits nobody is told about                                                                                                                     | Field-level patches keyed by event id, or a record checksum in the op so the server rejects a stale patch and the user sees a conflict                                       |
| high     | Undo replays without preconditions; a client more than 1,000 ops behind adopts the new version without the ops; a database restore leaves every client with a version ahead of the server                    | Divergent copies, dangling links, clients stuck in a 409 loop with no reset                                                                         | Preconditions and an integrity pass on record patches; paginated pulls; automatic reload from the server when versions disagree, plus a manual "recharger depuis le serveur" |
| high     | Deleting a document deletes the file immediately; undo brings back a record pointing at nothing                                                                                                              | Unrecoverable loss of a scan                                                                                                                        | Soft delete: keep the file until nothing references it for 30 days, reap server-side                                                                                         |
| high     | Import losses for files from Gramps, Ancestry or RootsMagic: name-level sources and notes, second files on a media record, second repositories, place notes, an id collision that can attach the wrong photo | Silent data loss on first import; Geneanet exports are fine                                                                                         | Keep unmodelled substructures and re-emit them; fix inline media id allocation; report every dropped field in the import report                                              |
| medium   | The parser applies GeneWeb repairs to every document, including Ramure's own, so a note typed as "Cause: …" becomes a different field after one server cycle                                                 | Client and server disagree without any edit                                                                                                         | Repairs only at import time                                                                                                                                                  |
| medium   | Saving the local copy is fire-and-forget; two tabs on the same tree overwrite each other's outbox; the browser is never asked to keep storage                                                                | Offline edits can vanish                                                                                                                            | Await persistence, lock the tree to one tab, request persistent storage, warn before closing with pending edits                                                              |
| medium   | A restore embeds the whole GEDCOM in an op; snapshots are never pruned; orphaned files are never reaped                                                                                                      | Restore fails for big trees; storage grows without bound                                                                                            | Restore by snapshot id; retention rules; a nightly reaper                                                                                                                    |
| medium   | Backups: D1 point-in-time restore exists (7 days on the free plan) but restores the whole database for every family at once; R2 has no versioning                                                            | No per-tree recovery; a deleted photo is gone                                                                                                       | Nightly per-tree export of document and op log to R2, R2 versioning on, a repair endpoint that resets versions                                                               |

### Frontend quality

| Severity | Gap                                                                                                                                                                                                       | Consequence                                                | Fix                                                                                                                                       |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| high     | The main component is 1,567 lines with 61 hooks and 94 inline handlers, holding routing, auth, accounts, sync, editing, drafts, kinship, modes, reports, files and dialogs                                | Every change risks another; nothing in it can be tested    | Split into a UI context, a tree session, an editing hook, a drafts hook, an editor reducer and a dozen small components; target 200 lines |
| high     | No error boundary, no handler for unhandled promise rejections, twelve API calls whose failure does nothing visible; 401, 403, 404, 413 and 500 all look the same to the user                             | White screens, silent failures, no prompt to sign in again | Error boundary, distinct handling per status with a re-auth prompt on 401, a proper error surface with retry                              |
| high     | The app cannot open a cached tree when the API is unreachable, despite the offline design                                                                                                                 | The installed app is useless on a train                    | Gate on the cached session and tree, not on a network call                                                                                |
| medium   | Opening two trees in quick succession can bind one tree's screen to the other's sync engine; ids such as I1 exist in both                                                                                 | Edits applied to the wrong tree                            | A generation counter on open, and commit asserts the engine matches the open tree                                                         |
| medium   | Each edit replays the outbox twice and rewrites the whole base document to storage; a component declared inside render remounts every family row on every zoom frame; decoded portraits are never evicted | Sluggish on trees past two thousand people, memory growth  | Cache the working tree, persist base and outbox separately, hoist the row component, cap the portrait cache                               |
| medium   | Canvas is mouse-only; modals have no focus trap or Escape; menus and tabs have no keyboard navigation; grey text fails contrast at 3.6:1                                                                  | Unusable without a mouse, hard to read for some            | Keyboard handles and focus management; darker grey token                                                                                  |
| low      | 47 unused strings, dead local-storage code, French strings hard-coded outside the string table, no plural handling                                                                                        | Drift                                                      | One cleanup pass with a key-parity test                                                                                                   |

### Testing and delivery

97 unit tests cover the pure layers well: parser, dates, edits, ops, diff, rebase, layouts, checks, kinship. Nothing covers the Worker (825 lines, zero tests), the sync engine's timers and retry loop, storage, any React component, or a full user journey. CI runs lint, types, tests and build, but not formatting, dependency audit or browser tests, and deploys go from a laptop with migrations applied by hand.

Plan: Cloudflare's vitest pool for the Worker with a local D1; the sync engine made injectable so it runs under node; testing-library for the editor, the modal and the date field; one Playwright journey against the dev stack: sign in with the echoed code, import the fixture, add a child, reload, undo. The ten highest-value tests are listed in the review and several of them fail today, which is the point.

## The refactoring passes, in order

Each pass is shippable on its own and verified before the next. Estimates are working days of my time; your time is the decisions marked below.

### Pass 1, harden

Deployed to production on 9 September 2026 (migration 0007 applied). The hygiene items (session idle timeout and purge, member emails hidden from viewers, a pepper on the code hash) followed in pass 6.

- Media allow-list by magic bytes, protective headers on media, security headers on everything.

- Escape the map tooltip; allow-list link schemes.

- Push at most 50 ops; drop the parameter-heavy pre-check; byte-measured document limit with a clear message.

- Sign-in through a POST from the app page, link and code bound to the requesting browser; per-IP and per-address rate limits; body limits; the echo flag locked to localhost.

- Invite tokens in the fragment and POST bodies; single-use, 7-day invites; lower log sampling.

- Guard snapshot and owner check on destructive record patches.

Done when: an SVG upload is refused and existing media serve as attachments; the security headers show on the live site; a 150-edit offline session syncs; a scanner-fetched link no longer consumes the sign-in; 20 wrong codes lock for 15 minutes.

### Pass 2, make sync honest

Deployed to production on 9 September 2026 (migration 0008). Field-level person patches were replaced by the agreed rule, later save wins with a notice to the saver; restore by snapshot id was not needed once documents are capped at 1.5 MB.

- Paginated pulls with a cursor; automatic reload from the server when versions disagree; a manual "recharger depuis le serveur".

- A concurrent push returns 409 with the missing ops instead of 500; 409 always carries a version.

- Preconditions on record patches with an integrity pass; history cleared on any drop; dropped edits kept in a recoverable list with their content shown.

- Field-level person patches so two people editing different facts of one person both keep their change; a conflict message when they edit the same fact.

- GeneWeb repairs moved to import time; envelope and record validation on the server.

- Persistence awaited, one tab per tree, persistent storage requested, unload warning with pending edits.

- Soft-deleted media with a nightly reaper; restore by snapshot id; snapshot retention.

Done when: a two-device property test with random edit sequences converges every time; a database restore in the dev stack leaves clients working; deleting then undoing a document brings the file back.

### Pass 3, tests before the split

Deployed on 9 September 2026: component tests for the modal, the date field and the editor (with the stale-Escape bug fixed), string-table parity, router and history tests, escaped map popup tested; a Playwright journey (sign in by code, create the account, import the fixture, add a child, undo, redo, reload) runs in CI on every pull request; coverage thresholds on the tree, sync and GEDCOM layers.

- Worker tests with a local D1: auth codes, invites, push and 409, snapshots, roles, deletes, media, the 100-parameter and 2 MB cases.

- Sync engine under node with fake storage and a stubbed API; history and router tests; string-table parity test.

- Component tests for the editor, the modal, the date field, the map popup and tooltip, link normalisation.

- One Playwright journey in CI; formatting and dependency audit added to CI; coverage thresholds on the tree and sync layers.

Done when: CI is red on any of the bugs listed in the reviews if reintroduced.

### Pass 4, restructure the app shell

Deployed on 9 September 2026: App.tsx went from 1 629 lines to a 330-line shell; a UI context, a tree session with a generation counter (the open race is closed), one editor reducer, a workspace context read by top bar, stage, tools, hud, menus, banners, report and snapshot dialog; error boundary and rejection toast; a reload without network reopens the device copy of the last tree; counted and filled strings (tn, tf); 39 dead string keys removed. Not reached: the 250-line target (the remaining 80 lines are route wiring).

- UI context for language, theme, toast and modal; a tree session object owning the engine and media store with a generation counter; an editing hook with commit, undo and shortcuts; a drafts hook; one reducer for selection, focus, editing, mode and kinship so the eight scattered reset sequences become one.

- Top bar, stage, tools, hud, menus, banners, report and snapshot dialog as their own components; duplicated document and selection handlers merged.

- Error boundary, rejection handler, one error surface with retry, distinct handling per status with a re-auth prompt; open a cached tree offline; a fetch timeout.

- Dead code and unused strings removed; the string table gains plurals and interpolation.

Done when: the main component is under 250 lines, every prior behaviour is covered by a test, and the offline reload opens the last tree.

### Pass 5, performance, accessibility, imports

Deployed on 9 September 2026: relative row memoised, portrait cache bounded to 300, Leaflet in its own lazy chunk, zoom state kept out of the shell; keyboard on the canvas (arrows, Enter, A, R, live region), focus trap and Escape on every dialog, arrow keys in menus and tabs, grey token at 4.5:1, pinch zoom back on pages; name-level notes and sources, several files per media, several repositories per source, place substructures, inline media ids never collide, ANSEL/UTF-16/Windows-1252 by header, an import note lists the tags kept verbatim; updates by prompt. Measured on a synthetic 4,000-person tree (1,980 families, 760 KB of GEDCOM): parse 41 ms, serialize 14 ms, overview layout 132 ms, hourglass layout 2 ms, one edit with its inverse 2 ms, full audit 10 ms. Not done: a Gramps export round-trip.

- Cached working tree and incremental persistence; the family row hoisted out of render; bounded portrait cache; the map and Leaflet loaded lazily; render no longer triggered per zoom frame.

- Keyboard access to cards and handles, focus traps and Escape on every dialog, arrow keys in menus and tabs, contrast fix on the grey token, pinch zoom re-enabled on pages.

- Foreign-dialect imports: keep name-level sources and notes, multiple files per media, multiple repositories, place substructures; fix the inline media id collision; ANSEL decoding; every dropped field reported.

- Service worker updates by prompt, so an open tab never runs old code against a new API.

Done when: a 4,000-person synthetic tree edits without visible lag; a Gramps export round-trips with no unreported loss.

### Pass 6, hygiene left over from pass 1

Deployed on 9 September 2026 (migration 0009, CODE_PEPPER secret set): sessions end after thirty days without use and the reaper purges them; « Se déconnecter partout » in Paramètres closes every session; the roster shows addresses to owners only, others see « j***@example.org »; sign-in code hashes are keyed with the pepper.

### Operations, in parallel

half a day of setup, then ongoing

- Workers Paid plan for CPU headroom and 30-day point-in-time restore, and a Durable Object per tree.

- Nightly per-tree exports to R2 — done 9 September 2026: each changed tree is copied as GEDCOM to `backups/<tree>/<day>.ged` after the reaper, kept thirty days (the newest always, a deleted tree's copies for the same season), listed and downloadable from the administration page. R2 object versioning and a repair endpoint remain.

- Your own domain for the app and the mail links; a DMARC record on the sending domain, which is the missing piece behind the Outlook warning (DKIM and SPF are already in place).

- Error reporting from the browser and dependency updates on a schedule — done 9 September 2026: crashes, unhandled rejections and window errors reach `/api/errors` (capped, rate-limited, no personal data) and are read on the administration page; Dependabot opens grouped pull requests every Monday. A staging Worker with its own database and migrations run from CI with an export first remain: both need Cloudflare resources and API tokens that Yoann creates.

## Decisions taken on 9 September

- **Paid plan.** Treated as available: the code assumes Workers Paid and does not work around the free-plan CPU ceiling. Yoann upgrades from the dashboard the day the limit is hit.

- **Domain.** Wanted, on hold until a name is chosen. Everything that depends on it (media origin, staging, mail links) is written so that switching is a configuration change.

- **Conflict policy.** Later save wins with a notice to the person whose edit was overwritten.

- **Data rights.** In pass 2. Users do not delete their own account: they request it from Paramètres and Yoann approves.

- **Closed registration.** Nobody can sign up on their own. Yoann sends an invitation, the person signs in from it, and they are in. This is pass 0 below.

### Pass 0, closed door

Deployed to production on 9 September 2026 (migration 0006 applied)

- An _administrateur de l'application_ flag on users; Yoann's user carries it. An « Administration » page reachable from the avatar menu for that user only.

- Application invitations: the admin enters an address, the app mails « Yoann vous invite sur Ramure » with a link and a code, valid seven days, single use. The address is allowed to sign in from that moment; the first sign-in creates the user.

- Sign-in refuses any address that is neither an existing user nor invited, with a neutral message that does not reveal which.

- Family-account invitations keep working, but only for addresses already allowed into the application. Owners see that rule when they create one.

- Deletion requests: a user asks from Paramètres, the request lands on the admin page, Yoann approves or declines; approval removes the user, their memberships, and any account and trees they were the sole owner of, plus the R2 files.

- Admin page lists users, pending invitations, deletion requests, and the storage each account uses.

Done when: an unknown address cannot obtain a sign-in mail; an invited address can; an account invite link does nothing for an unknown address; a deletion runs end to end from request to approval.

## Until then

Your friend can keep entering data. Export the GEDCOM from the tree menu every few days and keep the files; that is a complete, portable copy of everything except uploaded documents, which stay in storage and are not deleted by any of the planned changes. Ask them to save on one device at a time until pass 2, since two devices editing the same person in the same minute can drop one side today.
