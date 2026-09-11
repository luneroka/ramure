> **Historical.** This is the original design brief, written 6 September 2026
> before any code existed. It records how the design was arrived at, including
> decisions later superseded. For what is true _now_, read
> [RULES_IN_FORCE.md](RULES_IN_FORCE.md); where the two disagree, this page is
> the older one.
>
> Converted from the published artifact to Markdown on 9 September 2026 so it
> diffs, greps and reviews like the rest of the repository. Text unchanged.

Design brief · working name

# Ramure

A free family-tree builder whose whole point is the tree: one canvas, the entire lineage, pan and pinch anywhere. Geneanet shows a tree one page at a time. We show it all at once.

_Brief v1 · 6 Sept 2026 · GEDCOM native · FR + EN from day one · Static PWA first, accounts later_

## What Geneanet actually is

Geneanet is a French freemium site built on top of the open-source GeneWeb engine. Its tree builder is free and unlimited in size, with 1 GB of media storage. The paid tier sells search and records, not tree features.

| Feature                                                 | Tier    | Notes                                                                                                                                                                       |
| ------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tree of any size, GEDCOM import and export              | free    | This is how we get your friend's data out.                                                                                                                                  |
| Tree viewer                                             | free    | Page-per-person. The chart shows a fixed 4 to 7 generations from the current person, then you click someone to recenter and the page reloads. This is the "chunks" problem. |
| Printable charts (PDF)                                  | free    | Classic and fan charts, 4 to 7 generations.                                                                                                                                 |
| Browsing 1M+ member trees, collaborative indexes        | free    | The community asset. Not something we can or should clone.                                                                                                                  |
| Advanced search, automatic tree matching, weekly alerts | premium | Depends on their database of a billion indexed people.                                                                                                                      |
| Genealogy library, partner society indexes, 10 GB media | premium | Licensed content.                                                                                                                                                           |

**The honest framing.** We are not replacing Geneanet's record search. We are replacing the tree builder and viewer, which is exactly the part that frustrates your friend and exactly the part where a small team can be much better. The friend keeps using Geneanet for research and imports their finds into Ramure.

Two open-source projects already do the builder part well and are worth an afternoon each before committing: [Gramps Web](https://www.gramps-project.org/web/) and [webtrees](https://webtrees.net/). Both are self-hosted, GEDCOM-based, and mature on data entry. Neither has a canvas that feels like a map on a phone. If the canvas is the product, building our own is justified. If it is not, host webtrees and stop.

## The design idea: the tree is a map

Treat the lineage like a map application treats a city. The full tree is laid out once, and the viewport is the only thing that moves. Zooming out collapses cards into names, then into dots, so a 3,000-person tree still reads. Zooming in reveals photos and dates. Nothing ever reloads.

### Principles

- **Everything is on one surface.** Ancestors above the focus person, descendants below, in an hourglass. Tapping a person re-centres the hourglass with an animation. The old centre stays visible so you never lose your place.

- **Level of detail, not pagination.** Three zoom bands: full card, name only, dot. The generation ruler on the left stays fixed so you always know which generation you are looking at.

- **Touch is the first input.** One finger pans, two fingers pinch, tap selects, long press opens the add menu, double tap re-centres. Tap targets are at least 44 px at the default zoom.

- **Editing happens on the canvas.** Every card has plus handles for parent, spouse, child and sibling. The person panel slides in from the right. Every edit is undoable.

- **The data is always yours.** GEDCOM export is one tap and never gated. The app works offline.

### Views

| View        | Shows                                               | When                                                    |
| ----------- | --------------------------------------------------- | ------------------------------------------------------- |
| Hourglass   | Ancestors up, descendants down, from a focus person | Default. This is the launch view.                       |
| Pedigree    | Ancestors only, binary tree to the right            | Research mode: which lines are still empty.             |
| Descendants | All descendants of one couple with spouses          | Family reunions and cousin-finding.                     |
| Fan         | Ancestors in concentric arcs                        | Printing and sharing; the only view Geneanet does well. |
| Timeline    | Lifespans as bars against years and events          | Later phase.                                            |

Live sketch · hourglass view

Drag to pan, scroll or pinch to zoom, tap a person to re-centre on them. Zoom out until the cards become names.

> Example family, invented for this sketch. Cards, connectors and the generation ruler are drawn on a Canvas 2D element, the same approach proposed for the product.

## What we store

The model follows GEDCOM 7 so that import and export are lossless and so the vocabulary matches what genealogists already know. Individuals never point at each other directly. They connect through families, which is what makes step-parents, second marriages and unknown fathers representable.

**Individual**

: Names (several, with type), sex, living flag, events, notes, media, citations.

**Family**

: Two partners at most, a union event (marriage, civil union, none), an ordered list of children with relationship type (birth, adopted, foster).

**Event**

: Type, date, place, description, citations. Dates are GEDCOM dates: exact, approximate, ranges, "before 1850", French Republican calendar.

**Place**

: Hierarchical (hamlet, commune, department, country) with optional coordinates.

**Source and citation**

: A source is a register or book. A citation is the page in it, with a quality grade.

**Media**

: Photos and scans, attached to people, events or sources. Object storage, not the database.

**Tree**

: Owner, collaborators with roles, privacy rule for living people, default focus person.

## How it is built

Two decisions shape everything else. First, the app is local-first: the whole tree lives in the browser, layout runs in a worker, and the server is only for accounts, sync and sharing. That is why the canvas is instant and why hosting can stay free. Second, we ship a viewer before we ship an editor, because a viewer over a Geneanet export is already the feature your friend is missing.

### Client

- TypeScript, Vite, React for panels and forms.

- Canvas 2D for the tree. Cards are drawn, not DOM nodes, so ten thousand people stay smooth. Selected card gets a DOM overlay for accessibility.

- Layout in a Web Worker, per view, from the focus person. Recomputed only when the tree changes.

- Gestures with pointer events, so mouse, trackpad, pen and touch share one code path.

- IndexedDB for the tree, a GEDCOM parser we own, PWA manifest for install and offline.

- i18n with French and English strings from the first commit.

### Server, phase 3 onward

- Postgres on Supabase's free tier: auth, row-level security, storage for media, 500 MB database and 1 GB files.

- Sync as an append-only change log per tree. Last-writer-wins per field is enough for a family of editors.

- Static hosting on Cloudflare Pages, free, no server to maintain.

- Escape hatch: the schema is plain Postgres, so moving off Supabase is a dump and restore.

### Why not SVG or a graph library

SVG with one element per person works to a few hundred cards, then pinch-zoom on a phone stutters. General graph libraries such as Cytoscape or React Flow lay out arbitrary graphs and fight you on the hourglass shape. The layouts we need are simple trees from a focus person, which is a few hundred lines we can own and tune for touch.

## Execution plan

Five phases, each one usable on its own. Weeks assume one developer part time. Phase 1 is the moment your friend stops being frustrated.

**Phase 0**Week 1

### Get the real data in hand

- Your friend exports their tree from Geneanet as GEDCOM. Keep the raw file as the test fixture for everything that follows.

- Write the GEDCOM 5.5.1 and 7 parser and serialiser with round-trip tests on that file. Geneanet adds custom tags; preserve unknown ones untouched.

- Define the TypeScript model above and the layout output shape.

**Done when**Import then export gives back a file Geneanet accepts without loss.

**Phase 1**Weeks 2 to 4

### The canvas viewer

- Hourglass layout in a worker, Canvas 2D renderer with three detail bands, generation ruler.

- Pan, pinch, wheel zoom, tap to re-centre with animation, fit to screen, minimap.

- Search box that flies to a person. Read-only person panel with events, sources and photos.

- Load a GEDCOM from disk, keep it in IndexedDB, deploy as a static PWA.

**Done when**Your friend opens their full tree on a phone and browses it end to end without a page load.

**Phase 2**Weeks 5 to 7

### Editing on the canvas

- Add parent, spouse, child, sibling from card handles. Edit names, events, places, notes in the panel.

- Undo and redo across every edit. Merge two duplicate people.

- GEDCOM export, one tap. Automatic local snapshots so nothing is ever lost.

- Pedigree and descendants views.

**Done when**Your friend builds in Ramure and only visits Geneanet to search records.

**Phase 3**Weeks 8 to 10

### Accounts, sync and sharing

- Sign in with email link. Trees sync across devices through the change log.

- A family account: several people sign in with their own email and share the same trees, joined through invite links. Administrators manage members.

- Photo upload to object storage, shown on cards at high zoom.

- Versions: one saved automatically every 100 edits, plus named versions saved on purpose, all restorable and undoable.

**Done when**Two relatives edit the same tree from two phones and both see the result. _Reached on 6 September 2026, on Cloudflare (Workers, D1, R2) rather than Supabase._

**Phase 4**In progress

### The things that make it better, not just free

Sequence agreed on 6 September 2026, each step shippable on its own. Nothing here adds chrome to the canvas: new views sit behind one corner button.

1. **Split person panel.** _Shipped 6 September 2026._ The hero stays fixed; below it the panel splits vertically. Top half: Fiche (timeline, notes) and Famille (parents, siblings, unions, children). Bottom half: Documents (records, scans, photos, PDFs, with the citations alongside) and Recherches (the person's own leads first, then one button that launches the external searches). A draggable divider, 60/40 by default, double-click to reset, either half collapsible to its tab strip; on phones a single four-tab strip. Tabs reset on every open; only the divider position is remembered per device. « Modifier » still takes the whole panel.

2. **Consistency checks.** _Shipped 6 September 2026._ The live « Vérifications » grow to cover impossible orders (death before birth, burial before death, baptism before birth), marriages under 14 or after a death, spouses more than 40 years apart, siblings less than nine months apart, events outside a plausible lifespan, people without any date, duplicate children. Each entry carries a severity and a « Corriger » that opens the right editor; the tree menu shows a count.

3. **Leads, documents, research.** _Shipped 6 September 2026._ Per person: leads (title, address, note, done), documents uploaded to the same storage as portraits (type from a short list, optional date and event, 10 MB per file, images downsized), any image usable as portrait. « Lancer les recherches » opens Geneanet, FamilySearch, Filae and the archives with name and years filled in, falling back to a list of links when the browser blocks tabs. Per tree: a « Ressources » page (bar button before the search, and the tree menu) with links and documents that belong to the whole tree (custom `_DOC` pointers under HEAD). Storage usage shown in Paramètres. Everything stored in the tree as custom GEDCOM tags, synced and versioned. _As built: leads and resources are `_LINK` records (with `_ID`, `TITL`, `NOTE`, `_DONE`); documents are `OBJE` records with `_KIND` (birth, marriage, death, photo, other), `_DATE` and `_PRIM Y` on the portrait, so a scan attached first never becomes the face on the card. Deleting a document removes the file for everyone after a confirmation; leads and resources are undoable like any edit. Filae has no stable search URL, so its link opens the site with the name in the query and may land on the home page._

4. **Relationship calculator.** _Shipped 7 September 2026: « Lien de parenté » in the person panel, a sentence in a banner over the canvas, the path lit and framed with the rest faded; blood ties by nearest common ancestor, spouses and in-laws, else the shortest family path._ Pick two people, get the relationship in words (cousine germaine, arrière-grand-oncle, épouse du neveu) and the path lit on the canvas with the rest dimmed.

5. **Timeline view.** _Shipped 7 September 2026 as « Frise »: bars by generation with birth order, hatched when dates are approximate, fading when the end is a guess, accent edge when living, diamonds for marriages, undated people listed apart; native scrolling, ⌘/Ctrl-wheel zoom, corner button toggling Arbre and Frise._ One bar per person across the years, grouped by generation, marriage marks; same selection and panel as the tree. Reached through one corner button that cycles Arbre, Carte, Frise.

6. **Map view.** _Shipped 9 September 2026 as « Carte » (Leaflet on OpenStreetMap tiles, dimmed in dark mode): one pin per place sized by its events, popup listing who was born, married or died there, the selected person's places in amber; « Localiser les lieux » geocodes the places lacking coordinates one at a time (French communes first, then Photon) and writes them back as an undoable, synced edit._ Places pinned, each listing who was born, married or died there. Requires a one-time, gentle geocoding of existing places, saved back into the tree.

7. **Printable charts.** Added 6 September 2026. _Shipped 9 September 2026;
   reworked 11 September 2026 after use — the fan was fixed to half the page
   width, which left a portrait sheet nearly two thirds blank, and it stopped at
   six generations. Now the radius is fitted to the sheet for a chosen sweep
   (half, three quarters, whole circle) and centred, the rings taper outward,
   labels are planned a ring at a time and shrink by dropping dates then the
   given name, empty rings are never drawn, paper can be A4, A3 or US Letter,
   the subject is chosen on the page instead of back on the canvas, and a line
   under the options says how many people and generations the sheet actually
   holds._ Two paper layouts of a person's ancestry, the way Geneanet offers them: an « Éventail » (fan chart, the person at the centre, parents in the first ring, then grandparents, up to five or six generations depending on the paper) and a classic grouped chart (boxes in rows, one generation per row). Both are laid out to fit one A4 sheet, portrait or landscape, with names and dates sized so they stay legible when printed. Previewed on screen first, then exported as PDF (vector, print quality) and as PNG for sharing. Options: number of generations, dates on or off, a title line with the tree name and date. Later, the same engine can tile a larger tree across several sheets.

**Polish batch, 6 September 2026.** The person editor became a sectioned modal (Identité with a segmented sex control and the portrait, Parcours, Notes, Suivi) with one quiet control scale across the app and a thin accent focus ring instead of the browser's. Guided dates fit a narrow pane on one line. A person can be flagged « À vérifier » (custom tag `_UNSURE Y`): dashed amber card with a « ? » badge, hollow dot when zoomed out, tag in the panel. The portrait is set only from the medallion or the edit form; documents never become the face and the portrait is not listed among documents. The language switch left the bar (French by default, changeable in Paramètres) and the tree is renamed only from its menu.

Parked: a shared, opt-in index of deceased people across Ramure accounts so families researching the same ancestors can find each other (only worth it once there are users; privacy design first). Dropped: Gramps and webtrees importers, since both export GEDCOM. Later, before calling the product finished: a responsiveness pass on phones.
_Done 11 September 2026: the app no longer scrolls sideways at any width from
320 px up; the top bar takes two rows on a phone and keeps undo, redo and the
theme button, which it had been hiding; the search opens under the bar rather
than below the canvas, where its results were off the bottom of the page; the
person sheet gives the editor the whole screen and the floating tools move above
it instead of sitting on its fields; and what floats over the canvas is laid out
by a container query on the stage, so an open panel in a wide window gets the
same treatment as a phone._

## Risks and open decisions

- **Pedigree collapse.** When cousins marry, one person appears twice in the ancestor tree. The hourglass draws them twice and links the duplicates with a dotted line. That is what paper charts do and it is fine.

- **Very wide descendant trees.** Eight children each with eight children is wide. Branches collapse with a tap and the minimap shows where you are.

- **Geneanet's GEDCOM quirks.** Their export mixes encodings and custom tags. Phase 0 exists to find out how bad it is before anything is built on it.

- **Free-tier hosting limits.** Supabase pauses idle free projects after a week. Acceptable for a family, and the local-first design means the app still works while the server wakes up.

- **Decision needed: name.** Ramure is a placeholder. It is a French word for the branches of a tree, and it is short. Check the domain before growing attached.

- **Decision needed: scope of "clone".** This brief deliberately drops record search and community trees. If those matter to your friend, the answer is a Geneanet link from each person's panel, not a rebuild.

Sources consulted for the Geneanet comparison

- [Geneanet, Free or Paid? Explanations](https://en.geneanet.org/genealogyblog/post/2019/01/geneanet-free-or-paid-explanations), including their 2024 reply on free-tier limits.

- [How To Change Your Geneanet Family Tree Display Mode](https://en.geneanet.org/genealogyblog/post/2015/06/how-to-change-your-geneanet-family-tree-display-mode)

- [Printable Family Tree Template](https://en.geneanet.org/help/printable-family-tree-template) and [Family Tree Magazine's guide to Geneanet](https://familytreemagazine.com/websites/geneanet/)
