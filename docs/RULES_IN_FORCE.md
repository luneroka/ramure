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

**A person's research lead is read as a source.** Leads (« Pistes ») were
folded into sources on 3 October 2026. An old `_LINK` under an INDI — in a
stored document, a backup, a version or an op recorded before then — reads as a
written source after the person's own (title, then the link on a `CONT` line,
the note as its `NOTE`; the done mark is dropped). Parsing and replaying old ops
share `leadCitation` in [src/gedcom/model.ts](../src/gedcom/model.ts), so a
device that replays such an op ends where the server's document reads. Only
`_LINK` under HEAD — the Ressources page — is still written.

**A source written in the panel is a plain GEDCOM citation**: `1 SOUR <text>`
with the link on a `CONT` line, so every genealogy program shows both. It can
be edited only while it is that (no pointer): a register record (`@S…@`) is
shared by everyone it is cited for, so one person's list only removes its
citation.

**GeneWeb repairs run at import only.** The Geneanet repair pass rewrites
malformed lines; running it again on an already-repaired document could
corrupt it. It is applied on the import path and nowhere else
([src/gedcom/geneweb.ts](../src/gedcom/geneweb.ts)).

**A file completes a tree by what its records say, never by their ids.**
« Compléter depuis un GEDCOM » recognises the file's people in the tree by
name, sex and years, and above all through their families
([src/tree/match.ts](../src/tree/match.ts)). The ids cannot be trusted: Geneanet
renumbers families on every export and keeps person numbers only while their
order happens to hold, and a stored tree keeps the ids of its own first import,
so matching on them would attach new finds to the wrong people. Only Ramure's
own random ids, coming home in an export, count as identity. A pair is accepted
only when it is the one candidate on both sides: a miss costs a duplicate, which
the checks flag and « Fusionner » repairs, while a wrong match would write a
stranger's facts onto somebody's ancestor with nothing to say so.

**A graft only adds, and the tree wins.** New people come in with their links;
recognised people gain the facts they lack, and the blank date or place of an
event the tree already knows is filled. Nothing is removed or replaced. Where
the file disagrees — a name, a sex, the date or place of a birth, baptism,
death, burial or marriage — the difference is listed in the preview and not
applied. A family that would give somebody a second set of birth parents is left
out, with the people only it connected, and the preview says how many
([src/tree/graft.ts](../src/tree/graft.ts)). The planning is the browser's; what
the Worker enforces is the op's shape — a `graft` sets records and is refused if
it would remove one.

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

**A local copy kept before 3 October 2026 is replaced, not caught up.** That
change removed `leads` from every person record and so changed every record's
fingerprint: replaying the ops recorded since would refuse every undo among
them and leave the device quietly showing another tree. A base stored under
schema 2 opens the tree, then is swapped for the server's document at the first
sync, pending edits replayed on top (`SCHEMA` in
[src/sync/engine.ts](../src/sync/engine.ts)).

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
`patchRecords`, which can rewrite or remove many records at once — people,
families, media, sources and repositories alike. Past 3
removals or 20 touched records a guard snapshot is taken
(`PATCH_SNAPSHOT_REMOVALS`, `PATCH_SNAPSHOT_TOUCHED`); past 20 removals only
an owner may do it at all (`PATCH_OWNER_REMOVALS`).

**Restoring a version is for owners.** `replaceTree` rewrites the whole
document, so an editor cannot issue one — checked after flattening `batch` ops,
so it cannot be smuggled inside one.

**Completing a tree from a file is for owners, and always leaves a version
first.** A `graft` can write hundreds of records at once, and taking it back is
a bulk removal only an owner may make, so an editor who could graft could not
undo it (`import_is_for_owners`, checked after flattening like `replaceTree`).
Whatever its size, the push keeps the document as it was, labelled « Avant
import de … » with the file's name.

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

**On a phone the top bar takes two rows, and loses nothing.** Brand, tree and
state on the first; everything you press on the second. Crammed onto one row it
could not shrink below 423 px, which scrolled the whole app sideways on a 390 px
screen — and the rule that made it fit was hiding undo, redo and the theme
button outright, which is not the same as fitting. The end-to-end journey
finishes at 390 × 844 and fails if the page scrolls sideways or if undo is not
on screen.

**What floats over the canvas is sized by the canvas, not by the window.** The
tools, the view chooser and the reading rules answer to a container query on
`.stage`: with the person panel open, a 1 024 px window leaves the stage 560 px
and they crowd exactly as they would on a phone. Two viewport media queries used
to decide this and they disagreed with each other.

**Nothing floats over the editor or a dialog.** The editor is modal at every
width, and the tools and the HUD sit at `z-index: 1001` against the dialog's 40,
so they had to be told to stand down while it is open. The checks list is not
modal but is read rather than glanced at, and takes the same treatment. So does
every dialog: on a phone the tools covered the buttons at its foot.

**A printed chart never draws a ring nobody is in, and never writes smaller
than 6 px.** Both charts trim themselves to the generations actually known, and
the fan stops adding rings once the outermost could no longer hold a name at
that size — 6 px is 4.5 pt on paper, and below it a printer gives back a smudge.
What was cut is not silent: `renderChart` returns the generations it drew and
the people it fitted, and the screen says « Cette feuille en tient 6 » rather
than leaving the reader to count rings
([src/print/charts.ts](../src/print/charts.ts)).

**The poster is the only drawing that shows everybody.** The fan and the
pedigree chart are built from a Sosa table, so a sibling, a second husband or a
childless great-aunt can never appear on them — on the test fixture the best
possible fan reaches 21 of 33 people. « Arbre entier » draws
`layoutEverything`, the same layout as the canvas overview, and tiles it. Each
card carries its person's id in the SVG, which is what makes "everyone is on
here" a thing a test asserts rather than a claim.

**A poster is capped at 60 sheets.** Past that it stops being a poster and
becomes a ream, so the drawing shrinks instead — but never below what one sheet
would have taken, and the screen says it happened. Each sheet holds only the
cards and lines that cross it: the alternative, every sheet carrying the whole
drawing behind a clip, is tens of megabytes on a large tree.

**Printing hides the rest of the app with `display: none`, not
`visibility`.** A hidden box still takes its space, which was harmless while a
single sheet was pinned over the page with `position: fixed`, and prints blank
pages the moment a poster has several sheets. The sheets print in flow, one page
each, with `break-after: page`.

**The person sheet downloads as a PDF; it does not go through the print
dialog.** It is a file to keep or send to a relative, and printing it is the
reader's business. The PDF is made in the browser, so nothing about the family
leaves the device and it works offline once the sheet's fonts have been seen
([src/app/screens/sheetPdf.ts](../src/app/screens/sheetPdf.ts)). It is painted
from the laid-out pages rather than from the sheet's data, so it cannot differ
from the preview: each line of text is drawn where the browser broke it.

**The sheet and its PDF share their font files.** The static faces in
`public/fonts/sheet` (Public Sans, Newsreader, IBM Plex Mono, all OFL, with their
licences beside them) are what the screen sets the sheet in and what the PDF
embeds; kerning, ligatures and synthesised styles are off on the sheet because
the PDF draws plain advances. Set the sheet in another face, or let the browser
kern, and lines drawn in the PDF overrun the places measured for them.

**The person sheet is paginated by the app.** Its blocks are measured off
screen at the paper's real size and packed onto page-sized boxes
([src/print/pack.ts](../src/print/pack.ts)): a section title or a union's header
never ends a page, and the space above a block is dropped when it opens one.
Each box becomes one page of the PDF, with its running head and page number.

**The person sheet stays on one page when shrinking the text by 15 % at most
does it.** Past that it takes the pages it needs at full size, and the line
under the options says which happened (« texte resserré à 90 % »). A sheet
squeezed below 85 % stops being comfortable to read on paper; a second page
is not.

**The person sheet holds back living relatives only when asked, and never the
subject.** « Discrétion pour les vivants » is off by default: the sheet exists
to share facts with family. When it is ticked, a living relative keeps a name
and a birth year and loses the day, the place and the occupation. The person
the sheet is about is always printed in full — they were chosen. A relative the
file marks private (`RESN privacy` or `confidential`) is held back whatever the
box says, because that mark was made on purpose by whoever entered them.

**The person sheet carries the subject's photo unless « Photo » is unticked.**
The box is ticked by default and offered only when the app can show the
portrait: an imported file often names pictures it does not carry, and a box
that changes nothing reads as broken. Unticked, the sheet is laid out as if
there were no portrait — the name takes its place rather than leaving a gap —
and the PDF, made from those pages, has no picture in it at all.

**The person sheet is written in words, never in genealogical signs.**
« Né le 4 févr. 1921 à Brest », « Mariés en 1919 », « Claire AUBRY (née en 1976) »: no °, †, ~ or x, no dash for a missing date. The sheet is read by
relatives, not genealogists, and the first version printed a lone « x » under a
husband's name that read as a mistake to the person it was made for. A marriage
known to have happened and nothing else says so — « Mariés, date et lieu
inconnus ». A test fails if a sign comes back
([src/print/sheet.test.ts](../src/print/sheet.test.ts)). Places on a relative's
line are written short and without the postal or INSEE code Geneanet puts in
them; the subject's events keep the place as the file has it.

**The Fiche tab and the printed sheet list the same events.** Both read
`eventRows` ([src/app/lib/lifeEvents.ts](../src/app/lib/lifeEvents.ts)): the
same rows, union events included, birth first, then by year, undated last.

**A ring is written one way, not per person.** Labels are planned for a whole
ring — flat, along the arc, or along the radius, at one size and one level of
detail — because a band where one name lies flat and the next stands on end
reads as a mistake. The consequence is deliberate: one long surname makes its
whole ring drop to initials.

**The person editor is drawn at the root of the page, not inside the panel.**
The panel clips its content (`overflow: hidden`). The editor's backdrop used to
escape that clip by being positioned against the whole app, which is correct
and which every browser but Safari draws correctly: once the form is long enough
to scroll, Safari gives its body a layer of its own and clips that layer to the
panel, so the form came up blank between its title and its buttons. It is
rendered through a portal into `document.body`
([src/app/person/PersonEditor.tsx](../src/app/person/PersonEditor.tsx)); a test
fails if it is ever put back inside the element that opens it.

**The person panel belongs to the canvas route.** It is not rendered over the
printable charts, the resources page or settings, where it only took half the
screen away from what those pages exist to show.

**Dismissed audit checks travel with the tree.** They are `_DISMISS` keys in
the document, so a dismissal holds for the whole family rather than one device.
A viewer, who cannot write, keeps them locally instead.

**Link schemes are allow-listed** before anything is rendered as an anchor
(`safeHref` in [src/app/lib/urls.ts](../src/app/lib/urls.ts)), and map popups are
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
