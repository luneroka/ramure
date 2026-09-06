# Ramure

A free family-tree builder whose whole point is the tree: one canvas, the entire lineage, pan and pinch anywhere. Built as an alternative to Geneanet's page-per-person viewer.

Everything runs in the browser. A tree is a GEDCOM file kept in IndexedDB; nothing leaves the device.

## Status

Phases 1 and 2 of the plan in `docs/design-brief.html`: viewer and editor.

- GEDCOM 5.5.1 import with a dedicated repair pass for Geneanet (GeneWeb) exports, see `docs/phase0-geneanet-roundtrip.md`.
- Hourglass canvas: ancestors above, descendants below, partners beside. Pan, pinch, wheel zoom, tap to select, tap again to re-centre.
- Three detail bands (cards, names, dots) so large trees stay readable.
- Person panel with events, parents, siblings, unions, children, notes and sources.
- Search, import report, French and English, installable as a PWA, works offline.
- GEDCOM export of what was imported, with Ramure's structured model.
- Editing on the canvas: add-relative handles on the selected card (parents, partner, child, sibling), person and union editors, link or unlink existing people, merge duplicates, delete.
- Undo / redo (⌘Z, ⇧⌘Z), automatic snapshots on this device with a restore dialog, start a tree from scratch.
- Dates typed as people write them ("vers 1860", "entre 1880 et 1885", "15 vendémiaire an III") and stored as GEDCOM dates.
- Hourglass, ancestors and descendants views.

## Run it

```bash
npm install
npm run dev
```

Then open the printed URL. From a phone on the same Wi-Fi, use the "Network" address.

```bash
npm test          # parser, layout
npm run typecheck
npm run build     # static site in dist/
```

## Run the API locally

```bash
npm run db:migrate:local   # once
npm run dev:api            # Worker on :8787 with emulated D1 and R2
npm run dev                # app on :5173, /api proxied to the Worker
```

Sign-in links are shown in the app instead of emailed while `DEV_ECHO_LINKS` is set in `wrangler.toml`.

## Deploy

See `docs/deploy-cloudflare.md`. One Worker serves the app and the API; D1 holds the trees and op logs, R2 the portraits.

## Layout

```
src/gedcom/    tokenizer, dates, model, parse, geneweb repairs, serialize
src/tree/      hourglass layout (pure, worker-ready)
src/canvas/    Canvas 2D renderer and gesture wrapper
src/app/       React shell, library, person panel, share dialog
src/sync/      op log sync: rebase core, engine, API client
src/store/     storage interfaces: local IndexedDB, cloud media cache
worker/        Cloudflare Worker: auth, trees, ops, invites, media
migrations/    D1 schema
fixtures/      the phase 0 round-trip files, used by the tests
docs/          design brief and findings
```
