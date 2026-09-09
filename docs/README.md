# Ramure documentation

Start here.

## For anyone changing the code

| Document | Read it when |
|---|---|
| [../CLAUDE.md](../CLAUDE.md) | Always, first. The working agreement: non-negotiables, the pre-merge suite, the conventions that hold. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | You need to find the right file, or decide where new code goes. |
| [RULES_IN_FORCE.md](RULES_IN_FORCE.md) | Before changing behaviour, and before deciding something looks like a bug. Every non-obvious rule with the reason it exists. |

## Plans and audits

| Document | What it is |
|---|---|
| [HYGIENE_2026-09.md](HYGIENE_2026-09.md) | The current code-hygiene audit and its five-pass execution plan. Findings are ticked off as they land. |
| [gap-analysis.html](gap-analysis.html) | The September 2026 hardening audit. Passes 0–6 are all shipped. Historical, kept for the reasoning. |
| [design-brief.html](design-brief.html) | Why the app exists and how the design was arrived at, including decisions later superseded. Historical. |

## Reference

| Document | What it is |
|---|---|
| [deploy-cloudflare.md](deploy-cloudflare.md) | Deploying the Worker, D1 and R2. |
| [phase0-geneanet-roundtrip.md](phase0-geneanet-roundtrip.md) | What Geneanet's GEDCOM export gets wrong and what the repair pass does about it. |

## A note on precedence

`RULES_IN_FORCE.md` states what is true **now**. The design brief and the gap
analysis record how decisions were arrived at, including ones since reversed.
Where they disagree, the rules page wins — and if the rules page disagrees with
the code, the rules page is wrong and should be corrected in the same PR.
