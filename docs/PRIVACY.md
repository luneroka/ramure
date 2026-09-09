# Privacy — what Ramure holds, and on what basis

_Written 2026-09-09, from findings P1, P3 and P4 of
[SECURITY_AUDIT_2026-09.md](SECURITY_AUDIT_2026-09.md). This page states what is
true now; where it and the code disagree, this page is wrong and should be
corrected in the same pull request._

Ramure is a private family-tree builder. Nobody can sign up: an address is let
in by the operator or by a family member who already has an account. There are a
handful of users.

The sharp fact about it is not the users. **It is everybody else.** A family
tree is a record of names, dates, places of birth, marriage and death, and
photographs, about people who are mostly **living, mostly not users, and mostly
unaware the record exists** — relatives entered by somebody else. That is
inherent to genealogy and it is the reason this page exists rather than a
paragraph in the README.

---

## What is held

**About a person with an account** — an email address, an optional display name,
timestamps for when the account was made and last used, and the account and tree
memberships that follow from those. Nothing else. No password (there are none),
no telephone number, no postal address, no payment details, no profile.

**About everybody recorded in a tree** — whatever the family typed: names,
dates, places, relationships, notes, sources, and any photographs or documents
uploaded against them. Ramure stores the GEDCOM document itself and reads
everything else out of it.

**Incidental to running the service** — a hashed session token; a hashed sign-in
code; a counter keyed by IP address for rate limiting, which is not a log and
keeps no history; and, when the app crashes, the error message, the stack, the
page (with the URL fragment stripped) and the browser's user-agent string.

**Not held at all** — there is no analytics, no advertising, no third-party
script of any kind, no tracking cookie, and no access log beyond what Cloudflare
keeps for its own operation.

## Where it is

| What                                 | Where                            |
| ------------------------------------ | -------------------------------- |
| The trees, accounts and sign-in data | Cloudflare D1, running in `WEUR` |
| Photographs, documents and backups   | Cloudflare R2, private buckets   |
| Sign-in and invitation mail          | Resend                           |

Two processors, then: **Cloudflare** and **Resend**. Mail carries a six-digit
code or an invitation link, never anything from a tree.

**A note on where the data sits (P3).** The database reports
`running_in_region: WEUR` — Western Europe — but that is Cloudflare's placement
rather than a binding jurisdiction: `jurisdiction` is `null`, and the R2 buckets
were created without one either. Both products can be pinned to the EU, and
**neither can be changed after creation** — moving would mean a new database and
bucket and a migration. Nothing is wrong today; the placement is on the record
here so that the choice was made knowingly rather than rediscovered later.

## How long it is kept

Every one of these is enforced by the nightly job in
[worker/maintenance.ts](../worker/maintenance.ts) and
[worker/backup.ts](../worker/backup.ts), not by intention:

| What                              | Kept                                                                |
| --------------------------------- | ------------------------------------------------------------------- |
| A session                         | 90 days, or 30 days without use, whichever comes first              |
| A sign-in link or code            | 15 minutes                                                          |
| An invitation                     | 7 days                                                              |
| A crash report                    | 30 days                                                             |
| An access request nobody answered | 90 days                                                             |
| A deleted photograph or document  | 30 days, so an undo can bring it back                               |
| Automatic tree versions           | the last 20 per tree                                                |
| « Avant suppression… » versions   | 90 days                                                             |
| Versions somebody named           | until they delete them                                              |
| Nightly copies of a tree          | 30 days — **including for up to 30 days after the tree is deleted** |
| The tree itself, and its op log   | until the family deletes it                                         |

The tree is the exception on purpose: it is the thing being built, and it is
kept until somebody removes it.

## Who can see what

- **Members of an account** see every tree in that account. Roles decide whether
  they can also change it: owner, member (may edit), viewer (read-only).
- **Nobody else can see anything.** A person who is not a member of an account
  cannot read its trees, and cannot even learn that a tree id exists — the
  answer is the same 404 either way.
- **Addresses are masked** to anyone who is not an account owner, everywhere
  they are shown: « j\*\*\*@example.org », enough to recognise a relative and not
  enough to write to them.
- **The operator (P4)** — the person who runs this deployment — can see every
  account, every tree and every nightly copy, through the administration page.
  That is not a loophole; it follows from holding the infrastructure, and it
  would be true of anybody hosting anything. It is stated here because it is not
  obvious to a relative who assumes their branch is theirs alone.

## Getting your data out, and getting it removed

**Out.** Any member can export a tree as a GEDCOM file from the tree menu. That
file _is_ the data — the whole document, readable in any genealogy program, with
or without Ramure. Portability is not a feature bolted on here; it is how the
application stores things in the first place.

**Removed.** A person with an account asks, from Paramètres, and the operator
approves. That takes their sessions, their memberships, every row carrying their
address, and any account they were the sole owner of — with its trees and its
files. What it deliberately leaves is the edit history of trees that outlive
them: `tree_ops` keeps an actor id that no longer resolves to anybody. The op
log is the family's record of how their tree was built, not a profile of the
person who left, and rewriting it would change what everyone else sees.

**The honest limit.** A person merely _recorded_ in a tree is not a user and has
no route of their own to correction or removal. They can only ask the family
member who entered them. That is a real gap, it is inherent to genealogy as a
practice, and pretending otherwise would be worse than saying it plainly.

## The legal basis, and why this page hedges

For a private family tree, shared among invited relatives, with no commercial
purpose and no sharing outside the family, the **household exemption** of the
GDPR (Article 2(2)(c) — processing "in the course of a purely personal or
household activity") is very likely to apply, and with it the obligations that
would otherwise follow from Articles 13 and 14 would not.

Two reasons that is written as a likelihood and not a conclusion.

First, the exemption is about the _activity_, not the software, and it stops
applying the moment the activity stops being domestic — if Ramure were used by a
genealogical society, a professional researcher, or anyone outside one household
sharing their own family history. Nothing in the application enforces that
boundary, and nobody would notice the day it was crossed.

Second, Article 14 — the duty to inform people whose data you obtained from
somewhere other than themselves — is the one that would bite hardest here if the
exemption did not hold, because most of the people in a tree never provided
anything. There is a genuine and commonly-relied-upon relief in Article
14(5)(b) for cases where informing them would take disproportionate effort,
which is plainly true of a nineteenth-century ancestor and arguably true of a
living second cousin. But "arguably" is doing work in that sentence.

So: the exemption is the position, this page is what would be needed if it ever
stopped holding, and writing it down costs an afternoon against a risk that is
small but not zero. **If Ramure is ever used outside one family, re-read this
section before anything else.**

## Reporting a problem

Anything about this page, or about data held in Ramure, goes to the operator —
the address in `ADMIN_EMAIL`, which is also where access requests arrive. There
is no other channel and, at this size, no need for one.
