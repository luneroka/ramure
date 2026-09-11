# Ramure — rules in force

**What this is.** Every non-obvious rule the app enforces, on one page, with
the reason it exists. Read it before changing behaviour, and before deciding
something looks like a bug.

**What this is not.** It is not history. `design-brief` records how the design
was arrived at, including decisions later superseded; the git log records what
changed and when. This page states only what is true _now_. Where they
disagree, this page is wrong and should be corrected — it is a summary, not a
source.

**Why it exists.** These rules live as comments scattered across forty files.
Each one is there because something went wrong once, or because a limit of the
platform forced it. Without them in one place, the next reader re-derives them
wrongly, or "simplifies" a guard that was load-bearing.

Each rule names its enforcement point. A rule enforced by the Worker cannot be
bypassed by a determined API caller. A rule marked **convention** lives in the
UI or in review, and could be broken by one — those are the ones worth
hardening first.

---

## 1. The document is the truth

**A tree is GEDCOM text, not a row set.** One `doc` column in D1 holds the
whole document; `tree_ops` holds the history that produced it. Everything else
— people counts, layouts, timelines, the map — is derived on read. This is
deliberate: a backup is a `.ged` file readable in any genealogy program, with
or without Ramure ([worker/backup.ts](../worker/backup.ts)).

**Stored documents are always Ramure's own serialisation.** An imported file
is parsed and re-serialised before it is ever stored
([worker/trees.ts](../worker/trees.ts), `trees.post('/')`), so no imported
quirk survives into storage.

**GeneWeb repairs run at import only.** The Geneanet repair pass rewrites
malformed lines; running it again on an already-repaired document could
corrupt it. It is applied on the import path and nowhere else
([src/gedcom/geneweb.ts](../src/gedcom/geneweb.ts)).

**Free text loses its control characters.** Names, account and tree names and
snapshot labels go through `cleanText`; several of them are interpolated into a
mail subject, and a value that can carry a newline has no business being there.
Multi-line fields — an access-request message, a deletion note — keep their
newlines and lose the rest.

**A batch op may not nest past 32 levels.** Flattening and replaying both
recurse, and the op log is replayed by every client, so an op nested far enough
would take out each relative's browser rather than just this Worker. The check
is a predicate that stops descending at the limit, not a measurement — a
function that measured the depth first would overflow on exactly the input it
exists to refuse.

**A record patch cannot name `__proto__`, `constructor` or `prototype`.** A
patch table arrives as JSON, where those are ordinary own properties, and
assigning one would give the table a prototype of the caller's choosing — after
which a lookup for a record that does not exist answers with a planted one
([src/tree/diff.ts](../src/tree/diff.ts)).

**A document is capped at 1.5 MB of UTF-8.** D1 stores at most 2 MB in a row,
and the row carries other columns. Measured in _bytes_, not characters —
accented French names are two bytes each and a character count would let a
document past the real limit (`MAX_DOC_BYTES`). Both the create and the push
paths check it, the push path _after_ replay, so an edit that would tip the
document over is refused rather than half-applied.

## 2. Sync: ops, versions and races

**A version is a count, not a timestamp.** `trees.version` is exactly the
number of ops applied. A client pushes the version it built on; anything else
is stale.

**A stale base is answered, not rejected.** 409 comes back carrying the ops
the client is missing, so it rebases and retries without a round trip
(`staleResponse`). The client's side of this is
[src/sync/rebase.ts](../src/sync/rebase.ts), which is pure and tested
separately from the engine.

**Conflicts resolve as "later save wins, with a notice."** A decision, not an
accident: families editing the same tree are cooperating, not competing, and a
merge UI would cost more than it is worth. The overwrite notice names who and
what, so the loss is visible rather than silent.

**A push carries at most 50 ops.** D1 binds at most 100 parameters per
statement and each op costs several (`MAX_OPS_PER_PUSH`). Longer edits go in
batches.

**Pulls are paged at 500 ops.** Both `GET /ops` and the 409 body page, and both
set `hasMore` (`PAGE`).

**Re-pushing an op is safe.** Ops already stored under the same `op_id` are
skipped, so a retry after a lost response applies nothing twice.

**The version guard on the UPDATE is the real lock.** D1 batches are
transactional, and `UPDATE … WHERE id = ? AND version = ?` catches a second
push that landed first; a zero-row result is answered as a stale base. The
`catch` around the batch handles the same race arriving as a constraint
violation on `tree_ops.seq`.

## 3. Destructive edits leave a way back

**Deleting or merging a person snapshots the tree first**, automatically,
labelled « Avant suppression de … » / « Avant fusion de … ». The snapshot holds
the document _as it was before_ the push.

**Bulk record patches count as destructive too.** Undo and redo travel as
`patchRecords`, which can rewrite or remove many records at once. Past 3
removals or 20 touched records a guard snapshot is taken
(`PATCH_SNAPSHOT_REMOVALS`, `PATCH_SNAPSHOT_TOUCHED`); past 20 removals only
an owner may do it at all (`PATCH_OWNER_REMOVALS`).

**Restoring a version is for owners.** `replaceTree` rewrites the whole
document, so an editor cannot issue one — checked after flattening `batch` ops,
so it cannot be smuggled inside one.

**An automatic snapshot every 100 ops** (`SNAPSHOT_EVERY`), crossing the
boundary rather than counting since the last one.

**Retention, enforced nightly** ([worker/maintenance.ts](../worker/maintenance.ts)):
the last 20 automatic snapshots per tree, guard snapshots for 90 days, named
versions for good.

**Undo patches carry record fingerprints.** A patch is refused if any record it
would rewrite has moved since — otherwise undo would silently clobber someone
else's edit ([src/tree/diff.ts](../src/tree/diff.ts)).

## 4. Who may do what

**Roles live on the account, not the tree.** An account has `owner`, `member`,
`viewer`. A tree's role is derived: account owner → tree `owner`, member →
`editor`, viewer → `viewer` (`roleOf` in [worker/trees.ts](../worker/trees.ts)).
There is no per-tree membership table and adding one would be a design change,
not a fix.

**"Not a member" is 404, "wrong role" is 403.** A non-member must not be able
to learn that a tree id exists (`requireRole`, `requireAccountRole`).

**An account always has at least one owner.** The last owner can neither demote
themselves nor leave.

**Owners see addresses; everyone else sees masked ones.** A non-owner sees
« j\*\*\*@example.org » — enough to recognise a relative, not enough to write to
them. Every surface that returns an address goes through `emailFor`
([worker/util.ts](../worker/util.ts)), the member roster and the snapshot list
alike: the rule was written once and enforced in one of the two places, and the
snapshot list quietly handed viewers real addresses until September 2026.

**Deleting a tree deletes its files immediately**, from R2 and D1 both. This is
the one place where deletion is not soft.

## 5. Sign-in

**No passwords exist anywhere.** An address receives a link and a six-digit
code, both valid 15 minutes, and either opens a 90-day session.

**Registration is invite-only, and always will be.** `mayEnter` allows an
address that already has a user, holds a live application invitation, or holds
an account owner's invitation — and nothing else. An uninvited address gets the
same answer as an invited one that mistyped, so the endpoint does not
enumerate users.

**The session cookie carries the `__Host-` prefix wherever it can.**
`workers.dev` is on the Public Suffix List, so every Worker under
`ramure.workers.dev` — staging included — is a sibling that could set a
`Domain=`-scoped cookie this origin would receive. The prefix makes that
structurally impossible. It requires `Secure`, so http development keeps the
plain names; reads accept either, which is what let the change ship without
signing anyone out. The unprefixed name is never written on an https
deployment.

**The administrator flag follows `ADMIN_EMAIL`.** It is set on that address's
sign-in and cleared from everyone else in the same statement, so changing the
setting moves the role instead of adding a second administrator who keeps it
because nothing ever took it away.

**Tokens are stored hashed.** Sessions as SHA-256 of the cookie, sign-in codes
as HMAC keyed by `CODE_PEPPER`. A database copy alone therefore does not hand
out sessions, and a six-digit code cannot be brute-forced offline from one.
`CODE_PEPPER` is set in production; without it `hmac` degrades to a plain hash,
which is acceptable in development and **not** in production.

**A link works only in the browser that asked for it.** Requesting a sign-in
sets a nonce cookie; the link and the code are refused elsewhere
(`browser_hash`). This is why a link opened on a phone after being requested on
a laptop says "other device" rather than signing you in.

**The token travels in the URL fragment**, and the app posts it. A fragment
never reaches a server or a log, and merely opening the page does nothing.

**Rate limits, all in D1**: 3 links per address per quarter hour, 20 requests
and 30 code attempts per IP per quarter hour, and 10 failed codes per address
across _every_ live link — so requesting a new one does not reset the count.
Asking for access is 5 per client per quarter hour **and 50 overall per hour**:
it mails the operator at an address the caller cannot vary, so a per-client
limit alone would not hold against many clients. Inviting is 10 per account and
20 per user per day, because inviting mails an address of the caller's choosing
from the domain that carries everyone's sign-in codes.

**Sessions expire twice over**: 90 days absolute, and 30 days idle, whichever
comes first. `last_seen_at` is touched at most hourly to keep the write cost
down.

**Users do not delete their own account.** They ask; the operator approves. A
deletion takes the person's sessions, memberships, any account they were the
sole owner of with its trees and files, and every row that carries their
address — magic links, access requests, crash reports.

**A deletion reassigns before it removes, and touches R2 last.** Four columns
named `users(id)` with no `ON DELETE` clause, so a member who had created a
tree, or an owner since demoted, could not be deleted at all — and because the
accounts and files went first, the failure destroyed the person's own genealogy
and left the person. Now `trees.owner_id`, `accounts.created_by` and
`account_invites.created_by` are handed to an owner who remains (there always is
one, since the last owner can neither be demoted nor leave), the whole of D1
happens in **one batch**, and files are deleted only once those rows are
committed. A crash therefore leaves files nothing points at, never rows pointing
at files that are gone ([worker/admin.ts](../worker/admin.ts), `deleteUser`).

**What a deletion deliberately keeps** is the family's edit history:
`tree_ops.actor_id` and `tree_snapshots.created_by` hold an opaque id that no
longer resolves to anybody. The op log is the tree's history, not a profile of
the person who left, and compacting it would rewrite what the rest of the
family sees.

## 6. Files

**The bytes decide the type, not the header.** JPEG, PNG, WebP, GIF, HEIC and
PDF are recognised by magic bytes (`sniffMediaType`); anything else is refused
with 415. **SVG is refused deliberately** — it can carry script and would run
on the app's own origin.

**A media id is written once.** Re-uploading under an existing id is a 409: the
object under an id others may have cached never changes.

**Files are served as sandboxed downloads** — `Content-Disposition:
attachment`, `nosniff`, `default-src 'none'; sandbox` — so a stored file can
never render as a page on the app's origin.

**Deletion is a mark, not a removal.** An undo can still show the file. The
nightly reaper takes it once it has been unreferenced for 30 days
(`MEDIA_GRACE_MS`), and _un_-marks a file an undo brought back.

**Files whose tree is gone entirely are swept separately.** The per-tree sweep
walks the `trees` table, so it can never visit a tree that no longer has a row —
and both deletion paths write their rows before touching R2 on purpose.
`reapOrphanedMedia` closes that by listing R2's own `trees/` prefixes and
dropping any the database does not know, the same shape as the orphaned-backup
sweep in [worker/backup.ts](../worker/backup.ts).

**10 MB per file**, checked from `content-length` before the body is read, then
again on the bytes.

**2 GB per account**, checked before the object is written
(`MAX_ACCOUNT_BYTES`). Uploading was the only unbounded write an ordinary user
had, so the first sign of a runaway would have been the bill. The total counts
**every** media row, deleted ones included, because that is what R2 is holding —
a file marked deleted stays for thirty days so an undo can bring it back, and
counting only live rows would let the same space be spent over and over inside
that window. The storage screen reports `pendingBytes` alongside the live total
so the two numbers reconcile.

**The nightly backups are deliberately not encrypted.** They hold the same
GEDCOM text as the `doc` column, in the same bucket, the same account and behind
the same credentials, and R2 already encrypts at rest; the key would have to live
in a Worker secret beside the lock. Encrypting would cost the property the whole
design exists for — that a copy is readable in any genealogy program, with or
without Ramure. What the decision rests on instead is that the buckets are
private, which `scripts/check-buckets.sh` asserts on every `/preflight` rather
than leaving to memory. The reasoning is in
[SECURITY_AUDIT_2026-09.md](SECURITY_AUDIT_2026-09.md) § S6.

**A deleted tree's backups outlive it by up to 30 days.** The sweep removes an
unknown tree's whole prefix only once _every_ dated copy is past the keep, so
deleting a tree today leaves readable copies for the rest of the season. That is
deliberate — it is what makes an accidental deletion recoverable — but "deleted"
meaning "in a month" should not be a surprise to anyone reading
[worker/backup.ts](../worker/backup.ts).

## 7. The browser side

**A reload never flashes the sign-in card.** The session lives in a cookie, so
every load has to ask the Worker who is signed in, and for that round trip the
browser knows nothing. `useAuth` answers `restoring`, `authenticated` or
`unauthenticated` — three states, because "nobody is signed in" and "nobody has
asked yet" are different answers, and the shell shows the door only for the
settled one. While restoring it shows a single quiet line and no branding: a
card that appears for 150 ms reads as being signed out, not as loading.

**A slow answer falls back to the last known identity after 2.5 seconds.**
`api.me()` gives up after twenty; being offline fails at once, but a stalled
network sits between the two, and a device that already knows whose it is should
open its copy of the tree rather than hold the session screen
(`RESTORE_GRACE_MS`). The real answer still lands and corrects it. Only the
first check waits behind that screen — a later `refresh()`, the sync engine
reporting the session gone, must not put it back over a working app.

**Every user-facing string goes through `t()`** with `fr` and `en`. French is
the default; the switch is in Paramètres only. A test fails on a key missing a
language.

**The canvas has three detail bands** — cards, names, dots — so a large tree
stays readable. Which band is chosen is a function of zoom, not of a setting.

**A new app version waits for consent while an edit is in flight.** The service
worker uses `skipWaiting: false`; the update banner asks only when something is
pending, and applies silently otherwise — an edit in progress is never cut
short.

**A printed chart never draws a ring nobody is in, and never writes smaller
than 6 px.** Both charts trim themselves to the generations actually known, and
the fan stops adding rings once the outermost could no longer hold a name at
that size — 6 px is 4.5 pt on paper, and below it a printer gives back a smudge.
What was cut is not silent: `renderChart` returns the generations it drew and
the people it fitted, and the screen says « Cette feuille en tient 6 » rather
than leaving the reader to count rings
([src/print/charts.ts](../src/print/charts.ts)).

**A ring is written one way, not per person.** Labels are planned for a whole
ring — flat, along the arc, or along the radius, at one size and one level of
detail — because a band where one name lies flat and the next stands on end
reads as a mistake. The consequence is deliberate: one long surname makes its
whole ring drop to initials.

**The person panel belongs to the canvas route.** It is not rendered over the
printable charts, the resources page or settings, where it only took half the
screen away from what those pages exist to show.

**Dismissed audit checks travel with the tree.** They are `_DISMISS` keys in
the document, so a dismissal holds for the whole family rather than one device.
A viewer, who cannot write, keeps them locally instead.

**Link schemes are allow-listed** before anything is rendered as an anchor
(`safeHref` in [src/app/Leads.tsx](../src/app/Leads.tsx)), and map popups are
escaped by hand — Leaflet takes HTML.

**One writing tab per tree.** The engine takes an exclusive lock per tree; a
second tab on the same tree opens read-only rather than letting two outboxes
race.

## 8. Deliberate — do not "fix" these

- Hash routing with French paths (`#/arbre/…`). The app is a single Worker
  asset bundle; hash routes keep the back button honest without server rules.
- The 409-with-ops response shape. It looks like an error carrying a payload
  because that is exactly what it is.
- `people` is denormalised onto `trees`. Counting individuals means parsing the
  document; the list screen would parse every tree otherwise.
- The op log is never compacted. It is the audit trail, and it is cheap.
- Rate limits in D1 rather than a rate-limiting product. It is one more binding
  and one more bill for a load this small.
- **`POST /api/errors` accepting a report with no session.** The reports worth
  having most come from a browser that broke before or during sign-in, when
  there is no session to check; requiring one would hide exactly the bugs that
  leave somebody unable to get in. It is write-only, reads back to the operator
  alone, and is purged after thirty days. The two guards that pays for live in
  the Worker rather than the browser: the URL fragment is stripped server-side
  too, because a sign-in token travels there and a browser is not the only thing
  that can post here, and the per-client limit is paired with an overall one.
- `DEV_ECHO_LINKS` returning the link and code in the response body. It is
  gated three times over — no `RESEND_API_KEY`, the flag set to `1`, and the
  request host being `localhost` or `127.0.0.1` (`echoMode`) — and it is the
  only way to test sign-in without burning mail quota.
