# Security audit — September 2026

_Audited 2026-09-09 against `main @ c893c34`. Report and plan only: no code was
changed, no production write was made._

Full-codebase security pass. Scope: every authentication and authorisation
path, all 49 API route handlers, the GEDCOM import and media upload surfaces,
secret handling in both environments, the deployment (CSP and headers, cookie
flags, R2 and D1 access, the nightly cron), data at rest and in backups with
their retention, the dependency tree production and development separately, and
the privacy posture of an application that holds personal data about living
people who never signed up for it.

Method: manual review of every file in `worker/`, `migrations/` and the parts of
`src/` that touch untrusted input, plus **ten live experiments** run against a
real D1 and R2 in `workerd` (`@cloudflare/vitest-pool-workers`) and against the
production deployment over HTTPS. Every claim below is marked either **verified**
— something was executed and the output observed — or **reviewed** — read and
reasoned about but not exercised. Nothing is implied to have been tested that
was not.

**Risk framing.** A private family genealogy application. Invite-only, no public
sign-up, a handful of trusted users. Not a high-value target and not worth
generic CVSS. The two outcomes that actually matter are: **a leak of family data**,
and **one relative reading another family's tree**. Severity below is calibrated
to those, and to a third that this codebase makes possible and generic scoring
would miss entirely: **losing a family's tree**. Findings are ordered by
consequence within each tier.

**Status legend:** `[ ]` open · `[~]` in progress · `[x]` done · `[-]` won't fix
(with the reason).

---

## What is already solid

Verified during this audit and needing no action. Listed explicitly so that a
later pass does not "fix" a deliberate decision into something weaker, and so
the baseline is on the record.

### Isolation between families — **verified**

The property this application exists to protect holds. A signed-in user who is
not a member of an account was pointed at fifteen endpoints belonging to another
family — the tree document, its op log, a push of new ops, its snapshots, its
media, a rename, a delete, the account roster, its storage report, its invite
form, and the administration surfaces — and every one answered `404
tree_not_found` / `404 account_not_found` / `403 administrator_only`. A
non-member cannot even learn that a tree id exists. Anonymous callers get `401
sign_in_required` on the same paths. There was no combination in which an
identifier leaked through a difference in status or body.

### Authorisation coverage — **reviewed**

Every one of the 49 route handlers was read against its guard. **39 require a
session**, and each pairs `requireUser` with a role check — `requireRole` for
trees ([worker/trees.ts:59](../worker/trees.ts#L59)), `requireAccountRole` for
accounts ([worker/accounts.ts:28](../worker/accounts.ts#L28)), `requireAdmin`
for the operator's surfaces ([worker/admin.ts:20](../worker/admin.ts#L20)), or,
for the four self-service routes in `auth.ts`, the signed-in user's own id.
There is no route that reads or writes a tree, an account or an admin surface
without one.

**The other 10 are public, and each is public for a reason.** Eight are the
sign-in flow itself, which by definition has no session to check —
`/auth/request`, `/auth/code`, both `/auth/verify`, `/auth/logout`,
`/auth/access-request` (finding S3), `/auth/me` (which answers
`{"user":null}` when signed out), and `/api/health`. The remaining two are
`POST /api/errors` (finding S10, a deliberate decision) and
`POST /api/invites/info`, gated by possession of a 256-bit token rather than by
a session.

"Not a member" is 404 and "wrong role" is 403 throughout, which is what keeps a
tree id from being discoverable.

### Sign-in — **reviewed, one part verified**

No passwords exist anywhere. Sessions are stored as SHA-256 of the cookie and
sign-in codes as HMAC keyed by `CODE_PEPPER`, so a database copy alone yields
neither a session nor a brute-forceable code
([worker/auth.ts:31](../worker/auth.ts#L31),
[worker/auth.ts:53](../worker/auth.ts#L53)). `requireCodePepper` turns a missing
pepper into a loud refusal in production rather than a silently weaker hash.
The token travels in the URL fragment, so it never reaches a server log. A link
and a code work only in the browser that requested them (`browser_hash`).
Failed codes are counted across every live link for an address, so requesting a
new one does not reset the count. Sessions expire twice over, 90 days absolute
and 30 days idle. Registration is closed: `mayEnter` admits an existing user, a
live application invitation, or an account owner's invitation, and nothing else,
and gives an uninvited address the same answer as an invited one that mistyped.

### Input handling — **reviewed**

Every SQL statement in `worker/` is parameter-bound; there is no string
interpolation of a value into a query anywhere. `readJson` caps the body before
parsing and refuses anything that is not a JSON object. Ids go through
`requireId` against a strict pattern, emails through `normaliseEmail`, and every
free-text field is explicitly `slice()`d to a length. Media type is decided by
magic bytes and not by the declared header, and **SVG is refused on purpose**
because it can carry script and would run on the app's own origin
([worker/media.ts](../worker/media.ts)). Files are served back as
`Content-Disposition: attachment` with `nosniff` and
`default-src 'none'; sandbox`, so a stored file can never render as a page.

### Cross-site scripting — **reviewed**

There is exactly one `dangerouslySetInnerHTML` in the codebase
([src/app/screens/PrintPage.tsx:130](../src/app/screens/PrintPage.tsx#L130)) and
its input is built by `renderChart`, where every value that comes from the
document passes through `esc()` — the chart title at
[src/print/charts.ts:57](../src/print/charts.ts#L57) and every name and date
through the single `text()` emitter at
[src/print/charts.ts:151](../src/print/charts.ts#L151). The unescaped
interpolations in that file are all numeric coordinates and constants. Map
popups, which Leaflet renders as HTML, escape by hand
([src/app/lib/mapPopup.ts](../src/app/lib/mapPopup.ts)). Anchor targets are
allow-listed to http, https and mailto before rendering (`safeHref`). There is
no `eval`, no `new Function`, and no `innerHTML` outside those two places.

### Deployment headers — **verified against production**

`curl -D -` against <https://ramure.ramure.workers.dev/> confirms `public/_headers`
is honoured by Workers static assets: a full CSP with `default-src 'self'`,
`script-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`
and `frame-ancestors 'none'`; plus HSTS `max-age=31536000; includeSubDomains`,
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: strict-origin-when-cross-origin`, a `Permissions-Policy`
denying camera, microphone, geolocation and payment, and
`Cross-Origin-Opener-Policy: same-origin`.

### Cookies and CSRF — **reviewed**

The session cookie is `httpOnly`, `Secure` (whenever `APP_ORIGIN` is https),
`SameSite=Lax`, host-only and `path=/`
([worker/auth.ts:107](../worker/auth.ts#L107)). On top of `SameSite`, every
non-GET request is checked for a same-origin `Origin` header before it costs a
query ([worker/index.ts:30](../worker/index.ts#L30)). No mutating route is
reachable by GET.

### Storage exposure — **verified**

`ramure-media` and `ramure-media-staging` both report _"Public access via the
r2.dev URL is disabled"_ and _"There are no custom domains connected to this
bucket"_. The buckets are reachable only through the Worker's binding or with
Cloudflare account credentials. D1 `ramure` is running in `WEUR` with read
replication disabled.

### Configuration and secrets — **verified**

`GET /api/health` on production answers `{"ok":true,…,"config":"ok"}`, meaning
`CODE_PEPPER`, `RESEND_API_KEY`, `MAIL_FROM` and `ADMIN_EMAIL` are all set and
`DEV_ECHO_LINKS` is not. `configProblems` names settings and never values, and
reports the verdict alone to anonymous callers. Gitleaks over the whole history
— 116 commits, 4.18 MB — found **no leaks**. `.dev.vars` is git-ignored and
`.dev.vars.example` documents, with the reason, why `RESEND_API_KEY` must stay
absent from it. Staging has its own database, bucket, pepper and Resend key, and
its cron is switched off with an explicit empty list rather than by omission.

### Production dependencies — **verified**

`npm audit --omit=dev`: **0 vulnerabilities**. The production dependency tree is
four packages — hono, leaflet, react, react-dom.

### The error contract — **reviewed**

Expected failures carry a stable code from a registry
([worker/errorCodes.ts](../worker/errorCodes.ts)); the browser translates by code
and never by prose or bare status. Unexpected errors become a bare
`{"error":"server error"}` 500 with no stack or internals in the response.

---

## Findings

### HIGH

#### `[x]` S1 — Approving a deletion request can destroy the person's own family tree and then fail, leaving them with an account they asked to have removed

_Done 2026-09-09, pass 3, **without the table rebuild this finding proposed**._

_The rebuild was the wrong instrument. Dropping and recreating `trees` under
SQLite performs an implicit `DELETE` first, and `tree_ops`, `tree_snapshots` and
`media` all cascade from it — so the migration written to protect the data was
the one thing in this audit that could have destroyed all of it. `deleteUser`
now hands every reference to an owner who remains instead, computed per account
in TypeScript rather than in a subquery, so "there is nobody to inherit this" is
an error with a name rather than a `NOT NULL` violation buried in a batch. The
`NOT NULL` on `trees.owner_id` is a real invariant and stays._

_Atomicity was the other half: all of D1 now happens in a single batch, and R2
only once those rows are committed, so a crash leaves files nothing points at
rather than rows pointing at files that are gone. That is only the better
failure if something collects them, and the per-tree sweep could not — it walks
the `trees` table — so `reapOrphanedMedia` was added alongside._

_Two blockers came from the dead tables of S15, whose `created_by` columns would
have stopped a deletion just as surely; migration 0012 drops them, which is why
that finding moved into this pass. Both were empty in production, checked first._

_`worker/erasure.test.ts` covers the two shapes that failed, the half-deletion,
the full sweep of rows carrying the address, and the orphan collector. **Four of
its seven tests were confirmed to fail against the previous `deleteUser` with
`FOREIGN KEY constraint failed`**, which is the point of writing them first._

**Verified**, by executing `deleteUser` against a real D1 in three
configurations.

`deleteUser` ([worker/admin.ts:218](../worker/admin.ts#L218)) ends with a batch
that deletes the user's memberships, sessions, deletion request and finally the
`users` row. Two columns point at `users(id)` with no `ON DELETE` clause, so
SQLite's default `NO ACTION` applies and the delete raises a constraint failure:

- `trees.owner_id` — [migrations/0001_init.sql:31](../migrations/0001_init.sql#L31)
- `accounts.created_by` — [migrations/0002_accounts.sql:6](../migrations/0002_accounts.sql#L6)

`deleteUser` reassigns both, but **only** on the branch where the user was an
owner of an account that has another owner
([worker/admin.ts:231-239](../worker/admin.ts#L231-L239)). Two ordinary
situations fall outside it:

1. **A member creates a tree.** Any account member may create a tree
   ([worker/trees.ts:87](../worker/trees.ts#L87)), and it records
   `owner_id = <that member>`. The account survives their deletion, so nothing
   reassigns the column.
2. **An account creator is later demoted.** An owner may demote another owner
   ([worker/accounts.ts:111](../worker/accounts.ts#L111)), but
   `accounts.created_by` still names the person who made it.

D1 enforces foreign keys — `PRAGMA foreign_keys` returns `1`, confirmed in the
test run — so both raise
`D1_ERROR: FOREIGN KEY constraint failed: SQLITE_CONSTRAINT`.

**The failure is not clean, because the function is not atomic.** The R2 deletes
and the account deletes happen in a loop _before_ the final batch. Exercised
end to end:

> A user is the sole owner of her own account, holding a tree and a file in R2.
> She is also a member of a relative's account, where she once created a tree.
> She asks for deletion; the operator approves.
>
> ```
> >>> deleteUser threw: D1_ERROR: FOREIGN KEY constraint failed: SQLITE_CONSTRAINT
> >>> her own account still exists: false
> >>> her own tree still exists:    false
> >>> her R2 file still exists:     false
> >>> she is still a user:          true
> >>> her sessions still exist:     1
> >>> GET /api/auth/me -> 200 {"user":{"id":"Uj8c3…","email":"erin-fk@example.org",…}}
> ```

Her genealogy is gone, irreversibly and without a snapshot. Her account is not.
She is still signed in on every device. The operator sees a bare
`500 {"error":"server error"}` with nothing naming the cause, and the deletion
request stays in the queue inviting a second press of the same button.

This is the worst outcome available in this codebase: it destroys family data,
it breaks the right to erasure, and it is reached by pressing the button the
interface offers for exactly that purpose.

**Fix.** Two parts, both needed.

- Make erasure FK-complete. A forward-only migration rebuilding the two
  references — `trees.owner_id` and `accounts.created_by` — so a deleted user
  does not block the row. `SET NULL` fits `accounts.created_by` (it is
  provenance, and nothing authorises on it). `trees.owner_id` is read for
  display only, since a tree's role derives from the account (`roleOf`,
  [worker/trees.ts:49](../worker/trees.ts#L49)); either make it nullable or
  reassign it to a surviving account owner in `deleteUser` on every branch, not
  just one. Rebuilding a table under SQLite means the `_new` + copy + rename
  dance already used in [0004](../migrations/0004_viewer_role.sql) — test it on
  staging first.
- Make it atomic in the order that matters: complete every D1 deletion first,
  and only then delete from R2. A crash then leaves files with no rows — which
  the nightly reaper already handles — instead of rows with no files.

Tests to write with it: erasure of a member who created a tree, of a demoted
account creator, and of a sole owner with media, each asserting the user is gone
**and** that no surviving family's data was touched.

---

### MEDIUM

#### `[x]` S2 — The snapshot list hands every viewer the full address of whoever saved a version

_Done 2026-09-09, pass 1. Both surfaces go through one `emailFor` helper in
[worker/util.ts](../worker/util.ts) rather than repeating the condition, and
`worker/addresses.test.ts` asserts a viewer sees `c***@example.org` in the
snapshot list and the roster alike, an owner sees both whole, and a display name
still wins over any address._

**Verified.**

The masking rule — owners see addresses, everyone else sees `j***@example.org`
— is enforced on the member roster
([worker/accounts.ts:87](../worker/accounts.ts#L87)) and nowhere else.
`GET /api/trees/:id/snapshots` selects `u.email` and returns it as `by` whenever
the person has not set a display name
([worker/trees.ts:312](../worker/trees.ts#L312),
[worker/trees.ts:322](../worker/trees.ts#L322)). Nobody sets a display name at
first sign-in, so this is the default case, not the edge one.

Run against the same account, with the same viewer, in the same test:

```
>>> viewer sees roster:    ["c***@example.org", "lecteur@example.org"]
>>> viewer sees snapshots: [{ …, "by": "chef@example.org" }]
```

A read-only relative — someone deliberately given the weakest role — collects
the real addresses of everyone who has ever saved a version. The rule that was
written down is not the rule the API enforces, which is worse than not having
the rule: [RULES_IN_FORCE.md](RULES_IN_FORCE.md) §4 states it as fact.

**Fix.** Mask in the same shape as the roster: resolve the caller's account role
once and apply `maskEmail` unless they are an owner or it is their own address.
Better still, move the decision into one helper both call sites use, so a third
surface cannot drift again. Add a test that a viewer never receives an
unmasked address from any tree endpoint.

#### `[x]` S3 — `POST /api/auth/access-request` is unauthenticated with no rate limit at all

_Done 2026-09-09, pass 1. Five per client per quarter hour, and fifty overall
per hour so a distributed flood cannot outrun the per-client limit either. The
test fires seven from one caller and asserts 5 × 200 then 429, with five rows
written and no more._

**Verified**: 25 consecutive requests from one client, 25 accepted, 0 refused,
25 rows written.

[worker/auth.ts:246](../worker/auth.ts#L246) is the only sign-in-adjacent route
with no `hit()` call. The 24-hour freshness check keys on the _address_, so it
does nothing against a caller varying the address, and every new address both
inserts a row and sends mail to `ADMIN_EMAIL`.

Two consequences. The operator's inbox is an open relay target — anyone on the
internet can make Ramure send unlimited mail to Yoann's personal address, from
Ramure's own verified domain, which is how a sender reputation is destroyed and
a Resend account suspended. And `access_requests` grows without bound, holding
an attacker-chosen address and 600 characters of attacker-chosen free text per
row, all of it rendered on the administration page.

**Fix.** A per-IP `hit()` in the same shape as its neighbours — the route sits
between two that already have one — and a global cap so a distributed flood
still cannot outrun the operator's inbox. Something like 5 per IP per quarter
hour and 50 per hour overall; the honest limit is "fewer than a person would
ever need", and nobody legitimately asks for access twice in an hour.

#### `[x]` S4 — `access_requests` is never purged

_Done 2026-09-09, pass 1. `reap()` drops them after 90 days
(`KEEP_ACCESS_REQUESTS_MS`), with a test that an old one goes and a recent one
stays._

**Reviewed.** `reap()` purges magic links, sessions, rate limits, both kinds of
invitation and client errors ([worker/maintenance.ts:79-99](../worker/maintenance.ts#L79-L99)).
It does not touch `access_requests`. A request is deleted when it is turned into
an invitation ([worker/admin.ts:133](../worker/admin.ts#L133)) or declined by
hand — so the rows that persist for ever are precisely those of people who were
**refused or ignored**, the ones with no relationship to the service at all.

Keeping an address and a free-text message indefinitely for someone who was told
nothing and got nothing is the clearest storage-limitation problem in the
codebase, and with S3 it is also unbounded.

**Fix.** Purge in `reap()` alongside the rest — 90 days is generous for
"someone asked and we have not decided". Say the number on the administration
page so the operator knows the queue empties itself.

#### `[x]` S5 — Any signed-in user can send unlimited mail to arbitrary addresses through the app's verified sender

_Done 2026-09-09, pass 1. Ten invitations per account per day and twenty per
user per day — the second because one person may own several accounts. Tested
by sending twelve and expecting ten then 429._

**Reviewed.** Any signed-in user may create an account
([worker/accounts.ts:48](../worker/accounts.ts#L48)) and is its owner. An owner
may invite any address ([worker/accounts.ts:146](../worker/accounts.ts#L146)),
which sends mail immediately. There is no rate limit and no cap on invitations
per account, per hour, or per lifetime. Re-inviting the same address revokes the
previous invitation and sends again, so even the one-live-invitation rule does
not bound the mail.

The trust model says the users are family. But the invited relative who becomes
an owner is one step removed, this is the only route in the application that
makes it send mail to an address of the caller's choosing, and the cost of
abuse lands on the sending domain — which is Yoann's, and which also carries the
sign-in mail everyone depends on.

**Fix.** A per-account and per-user limit on invitations sent, in the D1
counters already there. Ten a day per account is far past what a family needs.

#### `[ ]` S6 — Nightly backups are plaintext GEDCOM in R2, and the case for encrypting them is narrower than it looks

**Reviewed**, with the bucket configuration **verified**.

[worker/backup.ts:43](../worker/backup.ts#L43) writes each tree's document to
`backups/<treeId>/<day>.ged` unencrypted, every night. The comparison in the
brief is ccig-app, which pipes `pg_dump` through AES-256 before anything touches
disk. The difference between the two situations is worth stating rather than
copying the answer across.

**What encryption would not buy here.** ccig's backups leave the machine that
made them and land in a second bucket with separate credentials — the encryption
protects a copy in transit to somewhere less controlled. Ramure's backups sit in
the same R2 bucket, in the same Cloudflare account, behind the same credentials
as the D1 database that holds _the identical GEDCOM text_ in `trees.doc`.
Anyone who can read the bucket can read the database. R2 already encrypts at
rest with AES-256 server-side. And the decryption key would have to live in a
Worker secret so that `GET /api/admin/backups/:treeId/:day` can serve a readable
file — putting the key in the same account as the lock. Against the threat that
actually justifies encryption at ccig, this buys close to nothing.

**What it would buy.** One thing, and it is real: R2 has an exposure mode D1
does not. A bucket can be made public with a single toggle or a custom domain,
and if that ever happened every family's complete genealogy would be
world-readable at a guessable path. Both buckets are private today — verified
above — but that is a setting, not a property, and it is a one-way door on the
wrong side.

**Recommendation.** Encrypt, but rank it below S1–S5 and adopt it as a
deliberate trade, not a reflex — it costs the property that makes this design
good, that a backup is _"readable in any genealogy program, with or without
Ramure"_ ([CLAUDE.md](../CLAUDE.md)). The version that keeps both: encrypt the
dated copies with AES-256-GCM through WebCrypto under a `BACKUP_KEY` secret,
have the admin download route decrypt on the way out so the operator still gets
a plain `.ged`, and write down — in [STAGING.md](STAGING.md) beside the other
secrets — that losing `BACKUP_KEY` loses the backups. Weigh that against
D1's own point-in-time recovery, which already covers the failure these copies
exist for.

Two things should happen whichever way this goes:

- **Write the retention down.** A deleted tree's backups survive it. The sweep
  at [worker/backup.ts:63-78](../worker/backup.ts#L63-L78) removes an unknown
  tree's whole prefix only once _every_ dated copy is past the 30-day cutoff, so
  a tree deleted today keeps readable copies of itself for up to 30 more days.
  That is defensible — it is what makes an accidental delete recoverable — but
  it is nowhere in [RULES_IN_FORCE.md](RULES_IN_FORCE.md), and "delete" meaning
  "in a month" must not be a surprise.
- **Make bucket privacy a checked property, not a remembered one.** The two
  `wrangler r2 bucket` commands used above, in a script beside
  `scan-secrets.sh`, turn it into something `/preflight` can assert.

#### `[ ]` S7 — Nothing caps how much a family can store

**Reviewed.** `PUT /api/trees/:id/media/:mediaId`
([worker/trees.ts:362](../worker/trees.ts#L362)) enforces 10 MB per file and
nothing else. No quota per tree, per account or per deployment.
`GET /api/accounts/:id/storage` measures usage but no writer consults it. Any
editor can upload until the R2 bill or the free tier says otherwise, and the
first anyone would know is a bill.

Not an attack so much as a missing floor — but it is also the only unbounded
write path an ordinary user has.

**Fix.** A per-account byte quota checked before the `put`, refused with a
registered code so the browser can say which limit was reached. The query that
computes it already exists in `/storage`.

---

### LOW, and decisions

#### `[ ]` S8 — `style-src 'unsafe-inline'` in the CSP

[public/_headers:3](../public/_headers#L3). Present because React writes inline
`style` attributes, which `style-src` governs. Honestly sized: with no HTML
injection sink reachable — all of them escape, see _What is already solid_ — the
attacker who could exploit this could already do worse, so this is defence in
depth and not a hole.

It can still be narrowed for free. Split the directive: `style-src 'self'
https://fonts.googleapis.com` blocks an injected `<style>` element, while
`style-src-attr 'unsafe-inline'` keeps React's attribute styles working. The
`unsafe-inline` that remains then covers only style attributes, which cannot
load or execute anything. Verify the built app in a browser afterwards —
`unsafe-inline` in a CSP fails silently by design.

#### `[ ]` S9 — Ten development vulnerabilities, six high, all in one held dependency chain

**Verified**: `npm audit --omit=dev` → 0. `npm audit` → 10 (1 low, 3 moderate,
6 high). Every one of them is under `wrangler` / `miniflare` /
`@cloudflare/vitest-pool-workers`: `sharp` (libvips and libheif),
`undici`, `ws`, `esbuild`.

Dev-only is not the same as harmless, and it is not a user-facing emergency
either. None of this ships: the Worker bundle contains none of these packages,
and production audits clean. The exposure that is real is a developer's own
machine — the `esbuild` advisory lets any page the developer visits read from
the local dev server while it is running, and `sharp`/libheif needs a hostile
image to reach miniflare's image emulation, which Ramure never invokes. So:
worth fixing, not worth interrupting anything for.

The part that deserves the attention is **why it cannot be fixed today, and what
notices when it can**. `npm audit fix --force` wants
`@cloudflare/vitest-pool-workers@0.22.0`, which needs vitest 4, which
[.github/dependabot.yml](../.github/dependabot.yml) holds at 3 on purpose —
that hold was added on 2026-09-09 after a Dependabot pull request that could not
install at all. The hold is right. What is missing is that nothing watches for
the day it stops being necessary, so the dev tree stays vulnerable by inertia
rather than by decision.

**Fix.** An entry in [DEFERRED.md](DEFERRED.md) with the condition written as
something measurable — _a `@cloudflare/vitest-pool-workers` release whose peer
range admits the vitest major we are on_ — and a check in
`scripts/check-thresholds.mjs` that runs `npm audit --json` and trips when a dev
advisory is fixable without a held major. That converts a silent hold into a
tripwire, which is the pattern this repository already uses.

See also S16: CI would not report these even if they were fixable.

#### `[x]` S10 — `POST /api/errors` is unauthenticated, and should stay that way

_Closed 2026-09-09, pass 2, as a decision rather than a change of behaviour. The
route stays open; the reasoning is now in the module comment and in
[RULES_IN_FORCE.md](RULES_IN_FORCE.md) §8 so it is not re-litigated as an
oversight. Both guards it asked for shipped: `clipUrl` strips the fragment in
the Worker as well as the browser, tested with a planted `#signin=` token, and
the per-client limit is paired with 200 per hour overall._

**Decided: keep, with two changes.**

The endpoint takes a crash report from any caller, rate-limited 20 per 15
minutes per IP ([worker/errors.ts:21](../worker/errors.ts#L21)).

Requiring a session would defeat it. The reports worth having most are the ones
from a browser that broke _before or during_ sign-in — a boot failure, a bad
service-worker update, a crash on the login screen — and there is no session to
authenticate at that moment. Gating it would silently blind the operator to
exactly the class of bug that leaves someone unable to get in, and there is
nothing here worth stealing: it is write-only, reads back only to an
administrator, and purges after 30 days.

Checked while deciding: the browser strips the URL fragment before sending
(`location.href.replace(/#.*$/, '#…')`,
[src/app/lib/report.ts:17](../src/app/lib/report.ts#L17)), so a sign-in token in
the address bar cannot ride along in a crash report. That was the failure mode
that would have changed this decision, and it is already closed — but by the
client alone, which is the weak half of the argument.

Two changes to make while writing the decision down:

- **Strip the fragment server-side too.** `clip(body.url, 300)` stores whatever
  it is given; a browser is not the only thing that can post here. One line, and
  it means the guarantee no longer depends on the client.
- **Add a global ceiling** beside the per-IP one. 20 per 15 minutes per IP is
  meaningless against many IPs, and each row is roughly 5 KB of
  attacker-controlled text in a 5 GB database.

Record the decision in [RULES_IN_FORCE.md](RULES_IN_FORCE.md) so it is not
re-litigated as an oversight.

#### `[x]` S11 — An unvalidated path parameter reaches a SQL `LIKE` pattern

_Done 2026-09-09, pass 1. Bound to `/^[0-9a-f]{12}$/`, the shape the list hands
out. The test walks `%`, `_`, `a%`, `../etc`, an upper-case id and a short one,
expects `400 bad_id` for each, and checks all three invitations survive._

**Verified.** `DELETE /api/accounts/:id/invites/:inviteId` matches with
`token_hash LIKE ?` on `inviteId + '%'`
([worker/accounts.ts:225](../worker/accounts.ts#L225)) and never validates the
parameter, so `%` and `_` arrive as wildcards. Sending `%` revoked all three
live invitations in one call:

```
>>> live invites before: 3
>>> DELETE /api/accounts/<id>/invites/% -> 200; live invites after: 0
```

The blast radius is small — the route is owner-only and scoped by `account_id`,
so an owner can only do to their own invitations what they could already do one
at a time. It is listed because it is the one place in the Worker where an
unvalidated value reaches a pattern rather than a bound value, and the codebase's
own rule is that ids go through `requireId`.

**Fix.** `if (!/^[0-9a-f]{12}$/.test(inviteId)) throw new HttpError(400, 'bad_id')`
— the value is a hex prefix of a hash.

#### `[x]` S12 — A deeply nested `batch` op overflows the stack

_Done 2026-09-09, pass 2. `MAX_OP_DEPTH` is 32, checked in the loop that
already walks the envelopes. Written as a predicate that stops descending at
the limit rather than a function that measures depth — the first attempt
measured first and would have overflowed on exactly the input it exists to
refuse. The test pushes the same 50 000-level op that used to answer 500 and
expects `400 op_too_deep`, then checks a three-level batch still applies._

**Verified.** An editor pushing one op nested 50 000 `batch` levels deep gets a
`500 {"error":"server error"}`; the trace names `flat` at
[worker/trees.ts:214](../worker/trees.ts#L214), which recurses with no depth
limit. `applyOp` recurses over the same structure
([src/tree/ops.ts:161](../src/tree/ops.ts#L161)).

The push is rejected, so nothing is stored and no other client sees it — the
server-side failure is what protects the browsers. But that protection is
accidental: it depends on `workerd`'s stack budget being no larger than a
browser's. An op nested deep enough to break a phone and shallow enough to
survive `flat()` would be stored and then replayed into every relative's tab.

**Fix.** A depth cap in the op validation loop that already walks the envelopes
([worker/trees.ts:176](../worker/trees.ts#L176)), refused with a registered code.
Batches are built by the UI a handful deep; 32 is far past any real one.

#### `[x]` S13 — `applyRecordPatch` assigns client-supplied keys directly

_Done 2026-09-09, pass 2. `RESERVED_KEYS` skips `__proto__`, `constructor` and
`prototype`. The test builds the patch with `JSON.parse` rather than an object
literal, which matters more than it looks: `__proto__` in a literal sets the
prototype and creates no own property, so the first version of this test passed
with the guard removed and proved nothing. Parsed from the wire — how an op
actually arrives — it is an own property, and the test now fails without the
fix. Confirmed at the same time that `Object.prototype` itself is never
touched, as the finding said._

**Reviewed.** `applyTable` writes `out[id] = value` for every key in a
client-supplied patch table ([src/tree/diff.ts:74](../src/tree/diff.ts#L74)).
A key of `__proto__` therefore reaches an assignment that invokes the setter and
replaces `out`'s prototype.

This is not global prototype pollution — `Object.prototype` is untouched, and
`Object.keys`/`Object.values`/`Object.entries` on the result see only own
properties, so serialisation is unaffected. The reachable effect is that a
lookup like `tree.individuals[x]` can return an attacker-planted object for an
id that does not exist, which `repairLinks` consults
([src/tree/diff.ts:106](../src/tree/diff.ts#L106)). The outcome is a corrupted
document by someone who is already an editor of that tree — which is why it is
LOW and not higher.

**Fix.** Skip `__proto__`, `constructor` and `prototype` in `applyTable`, and
say in a comment why the guard is there so it is not tidied away. Note that
this runs on both sides, so a test belongs with it.

#### `[x]` S14 — Small hardening, worth doing together

_Done 2026-09-09, pass 2, all six. The `__Host-` prefix reads both names and
writes only the prefixed one, so no session was ended; `worker/sessions.test.ts`
drives a real sign-in against an https environment and asserts the prefix,
`Secure`, no `Domain`, and that a cookie under the old name still
authenticates. The administrator flag is cleared from everyone else in the same
statement that sets it. `cleanText` takes control characters out of every field
that reaches a mail subject and leaves newlines in the two that are multi-line.
`secureHeaders` now passes `DENY` and the year-long HSTS, matched to
`public/_headers` and asserted in a new `worker/index.test.ts`. `readJson`
measures bytes — which changed which error an oversized document gets, so the
create route's cap moved to twice `MAX_DOC_BYTES` to leave room for the
specific answer to win. The dead `if (row.email)` branch is gone._

Each is a few lines; none justifies its own pass.

- **`__Host-` on the session cookie.** [worker/auth.ts:107](../worker/auth.ts#L107)
  sets a host-only cookie, which is right, but `workers.dev` is on the Public
  Suffix List — making `ramure.workers.dev` the registrable domain and
  `ramure.ramure.workers.dev` and `ramure-staging.ramure.workers.dev` siblings
  under it. A sibling Worker can set a `Domain=ramure.workers.dev` cookie that
  production would then receive. Only Yoann's own Workers live there, so this is
  hardening rather than a hole — but the `__Host-` prefix makes it structurally
  impossible for a cookie of that name to come from anywhere but the exact
  origin, and it costs a rename. It invalidates live sessions, so ship it when
  a sign-out is acceptable.
- **`is_admin` is never cleared.** [worker/auth.ts:99](../worker/auth.ts#L99)
  sets the flag on every sign-in by `ADMIN_EMAIL` and nothing ever removes it, so
  changing `ADMIN_EMAIL` adds an administrator instead of moving the role. Clear
  it from anyone else in the same statement.
- **Control characters survive into mail subjects.** `name`
  ([worker/auth.ts:236](../worker/auth.ts#L236)) is trimmed and clipped but
  keeps newlines, and it is interpolated into the subject of an invitation
  ([worker/admin.ts:121](../worker/admin.ts#L121),
  [worker/accounts.ts:181](../worker/accounts.ts#L181)). Resend takes JSON and
  builds the header itself, so this is not header injection — but stripping
  `[\p{C}]` on the way in costs one regex and removes the question.
- **API and asset responses disagree on their headers.** **Verified**: `/`
  answers `X-Frame-Options: DENY` and HSTS `max-age=31536000`, while `/api/*`
  answers `SAMEORIGIN` and `max-age=15552000` from Hono's `secureHeaders`
  defaults ([worker/index.ts:23](../worker/index.ts#L23)). JSON with `nosniff`
  cannot be framed usefully, so nothing is exposed — but one origin serving two
  different HSTS lifetimes is a trap for whoever reads it next. Pass the same
  values in `secureHeaders`.
- **`readJson` buffers before it measures.** [worker/util.ts:64](../worker/util.ts#L64)
  trusts `content-length` when present, then reads the whole body with
  `req.text()` before checking `text.length` — which counts characters, not
  bytes, so a multi-byte body can exceed the cap it appears to honour.
  Cloudflare's own 100 MB request limit is the real backstop. Measure with
  `TextEncoder` as `docBytes` already does, and note that the sizes here are
  advisory.
- **An account invitation with no address is never spent.**
  [worker/accounts.ts:279](../worker/accounts.ts#L279) marks an invitation used
  only `if (row.email)`. No route creates one without an address today —
  `normaliseEmail` throws first — so this is a dead branch, but it is a dead
  branch that reads as "reusable for seven days by anyone holding the link".
  Remove the condition, or say in a comment why it is there.

#### `[x]` S15 — Two dead tables still hold role data

_Done 2026-09-09, **moved into pass 3** rather than pass 4: `tree_members.user_id`
and `invites.created_by` both reference `users(id)`, so a row in either would
block a deletion exactly as S1's columns did. Dropped by migration
0012 — safe because nothing references either table, so the drop cascades
nowhere, and both were empty in production and staging. Applied to staging
first, where the remaining fourteen tables were confirmed intact._

**Reviewed.** `tree_members` and `invites` ([migrations/0001_init.sql](../migrations/0001_init.sql))
were superseded by accounts in 0002 and are referenced by no query in `worker/`
— confirmed by grep. Rows from before the migration may still name who had which
role on which tree. They authorise nothing, so this is tidiness rather than
exposure, but stale authorisation data is exactly the kind of thing that misleads
someone reading the schema to work out who can see what.

**Fix.** A forward-only migration dropping both. Staging first; it is empty, so
the migration proves only that it runs, and production is where it matters.

#### `[ ]` S16 — CI's dependency check is weaker than it reads

`.github/workflows/ci.yml` runs `npm audit --audit-level=critical --omit=dev`.
Production high-severity advisories therefore pass silently, and development
ones are never examined at all — which is why the ten in S9 have never appeared
on a build.

**Fix.** `--audit-level=high` on the production audit, and a second
non-blocking `npm audit` over the whole tree whose output is visible in the log.
Keep it non-blocking: a held major (S9) must not turn every build red, which is
the mistake [HYGIENE_2026-09.md](HYGIENE_2026-09.md) §H2 already records paying
for once.

#### `[ ]` S17 — The secret-scan script argues from a premise that is no longer true

[scripts/scan-secrets.sh:4-8](../scripts/scan-secrets.sh#L4-L8) explains that it
runs locally _"rather than in CI on purpose: the repository is private, so
GitHub Actions minutes are metered"_. The repository has been public since
2026-09-09 and `.github/workflows/secret-scan.yml` runs Gitleaks on every push
and pull request. The reasoning is stale in the one place someone would read it
before deciding whether the check matters.

**Fix.** Rewrite the header to say what is true: it runs in both places, locally
as the first gate and in CI as the second opinion.

---

## Privacy and GDPR

The application holds names, dates and places of birth, marriage and death,
photographs and documents about **living people who never consented and in most
cases will never know the record exists** — relatives entered by someone else.
That is the sharpest privacy fact about Ramure and it deserves stating plainly
rather than being folded into a severity tier.

**What is already right.** Data minimisation is good: an account holds an
address, an optional display name and timestamps, and nothing else — no
telephone number, no IP log beyond a rate-limit key, no analytics, no tracker,
no third-party script. Portability is covered by design, since the export is
GEDCOM and the whole architecture exists to keep it that way. Retention is
enforced rather than aspirational for sessions, magic links, snapshots, media
and client errors. Addresses are masked from non-owners (with S2 the one
exception). The processors are two — Cloudflare and Resend — and mail carries a
code, never tree content. D1 runs in `WEUR` (**verified**).

**What is missing.**

1. **`[ ]` P1 — There is no privacy notice anywhere.** Not in the app, not in
   `docs/`, not in the README. Nothing states what is held, for how long, on
   whose infrastructure, or who to ask. Articles 13 and 14 require it, and
   Article 14 is the one that bites here because most data subjects are the
   relatives, not the users. There is a real argument that Article 2(2)(c) — the
   purely personal or household activity exemption — covers a private family
   tree among invited relatives, and it may well hold for Ramure as it stands.
   But that argument has to be _made and written down_, because it stops holding
   the moment the app is used outside one household, and nobody will notice the
   day it does. One page in `docs/`, plus a short section reachable from
   Paramètres, is proportionate to the whole risk.

2. **`[x]` P2 — Erasure is broken (S1) and partial where it works.**
   _Done 2026-09-09, pass 3. A deletion now also takes the person's
   `client_errors`, `access_requests` and `magic_links` rows. The honest limit
   the finding named is unchanged and now written into
   [RULES_IN_FORCE.md](RULES_IN_FORCE.md) §5: `tree_ops.actor_id` and
   `tree_snapshots.created_by` keep an opaque id that resolves to nobody,
   because the op log is the family's history rather than a profile, and a
   person recorded in a tree is not a user and still has no route to erasure._ Beyond the
   constraint failure, `deleteUser` leaves `client_errors.user_id` pointing at
   a user who no longer exists — no foreign key was declared
   ([migrations/0010_client_errors.sql](../migrations/0010_client_errors.sql)) —
   and leaves any `access_requests` row for that address in place. Both are
   small; both belong in the same fix, because "we deleted you" should not have
   exceptions nobody wrote down. Note the honest limit: a person recorded in a
   family tree is not a user and has no route to erasure at all, which is
   inherent to genealogy and should be stated in P1 rather than pretended away.

3. **`[ ]` P3 — Jurisdiction was decided by default, and cannot be changed
   later.** **Verified**: `ramure` reports `jurisdiction: null` and happens to
   run in `WEUR`; both R2 buckets were created without a jurisdiction. D1 and R2
   both support pinning to the EU, and **neither can be changed after creation**
   — moving would mean a new database and bucket and a data migration. Nothing
   is wrong today. It is worth one line in the privacy note saying where the
   data sits and that the placement is Cloudflare's default rather than a
   guarantee, so the choice is on the record rather than rediscovered later.

4. **`[ ]` P4 — The operator can read every family's tree.**
   `GET /api/admin/backups/:treeId/:day` serves any tree's document to an
   administrator with no membership check
   ([worker/admin.ts:171](../worker/admin.ts#L171)), and `/api/admin/overview`
   lists every user, account and tree. This is correct — the operator is the
   data controller and holds the infrastructure regardless — but it is not
   obvious to a relative who assumes their branch is theirs, and it is exactly
   what a privacy notice exists to say out loud. Not a finding to fix; a fact to
   publish.

---

## Remediation plan

Ordered safest-first, in the shape [HYGIENE_2026-09.md](HYGIENE_2026-09.md)
established: one branch per pass, one concern each, tests written with the work,
`/preflight` green before the merge and said so in the PR, merged with
`gh pr merge`, verified against production after it deploys. The schema passes
go to staging first.

Passes 1 and 2 are ordered ahead of S1 deliberately. S1 is the most serious
finding, and it is also the only one needing a schema change — the cheap
containment lands first so that nothing is waiting on the careful work.

| Pass | Branch                          | Findings            | Risk     | Why here                                                                                                                                                                      |
| ---- | ------------------------------- | ------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `security-1-limits-and-masking` | S2, S3, S4, S5, S11 | Low      | No schema, no migration, no behaviour anyone relies on. Closes the two live abuse paths and the leak that contradicts a written rule, in one reviewable diff.                 |
| 2    | `security-2-input-hardening`    | S10, S12, S13, S14  | Low      | Small guards and one decision written down. Independent of everything else; lands while pass 3 is being thought about.                                                        |
| 3    | `security-3-erasure`            | **S1**, P2          | **High** | The one destructive finding, and the only one needing a table rebuild. Its own branch, its own review, staging before production, with the three erasure tests written first. |
| 4    | `security-4-quotas-and-backups` | S6, S7, S15         | Medium   | The storage decisions, together with the migration dropping the dead tables. S6 needs Yoann's call on encrypting before this starts.                                          |
| 5    | `security-5-supply-chain`       | S8, S9, S16, S17    | Low      | CSP narrowing, the dependency tripwire, the CI audit level, the stale script header. Last because none of it changes what the running app does.                               |
| 6    | `security-6-privacy-notice`     | P1, P3, P4          | Low      | Prose. Lands last so it can describe the retention and deletion behaviour the earlier passes actually leave in place, rather than what was intended.                          |

### Rules for the passes

- **Pass 3 goes to staging first**, exercised there through the real approval
  path before `npm run db:migrate` touches production. Migrations are
  forward-only; the table rebuild is a new numbered file, never an edit.
- **No production data is copied to staging.** Import a tree through the app if
  one is needed.
- **Verify in production after each deploy** — curl the endpoint, do not assume
  the deploy worked.
- Tick findings here as they land, and correct
  [RULES_IN_FORCE.md](RULES_IN_FORCE.md) in the same PR wherever a pass changes
  what it describes — S2 and S6 both make it wrong today.

### Decisions taken

Both were delegated on 2026-09-09, with the constraint that Yoann was away from
his machine and could not set a secret or approve a sign-out.

- **S6 — do not encrypt; assert the bucket instead.** Reasoning in the finding.
  The short form: the encryption would guard a copy that sits beside the
  plaintext original, under the same credentials, with the key in the same
  account — while costing the property CLAUDE.md names as the point of the
  design, that a backup is readable in any genealogy program. `r2.dev` does not
  permit listing either, so even an accidental exposure yields nothing without
  knowing a tree id. Marked `[-]`, with `scripts/check-buckets.sh` making
  privacy a checked property rather than a remembered one. It is also the only
  answer that needs no secret, which matters while nobody can set one.
- **S14, `__Host-` cookie — adopt it, and sign nobody out.** Reads accept both
  names, writes set only the prefixed one. Live sessions keep working, new
  sign-ins are hardened, and the legacy name dies of its own accord within 90
  days.

### Deliberately not in scope

- **Rewriting the sync engine, the layout or the GEDCOM parser.** They are the
  most tested code here and this audit found nothing wrong with them.
- **A per-tree membership table.** Roles deriving from the account is a design
  decision ([RULES_IN_FORCE.md](RULES_IN_FORCE.md) §4), the isolation tests
  confirm it holds, and changing it is a product change, not a security fix.
- **A rate-limiting product, a WAF, or Turnstile.** The D1 counters are
  sufficient for this load; S3 and S5 are missing calls to a mechanism that
  already exists, not a missing mechanism.

---

_Audit performed with Claude Code. Re-run `npm audit`, the two `wrangler r2
bucket` privacy checks and the isolation tests at each dependency bump and each
new exposed endpoint, and re-check this document's assumptions when either
changes._
