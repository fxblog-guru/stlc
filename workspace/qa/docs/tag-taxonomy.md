# Tag taxonomy

The controlled tag vocabulary for all test cases and specs. Tags appear in this exact order:

```
@<type> @<module> @P<0-3> @platform:<id>… [@smoke] [@regression] [@manual] [@req:<slug>/<id>] [@ac:<slug>/<id>] [@deprecated:<slug>] [@tms:<id>] [@defect:<id>] [@quarantined:<until>] @agentic:gen
```

## Slots

| Slot | Values | Rules |
|---|---|---|
| `@<type>` | `@api` `@integration` `@e2e` `@security` `@performance` `@unit` `@accessibility` `@ui` `@mobile` `@data` | exactly one; matches the case's `<qa-root>/cases/<type>/` folder and its id stem |
| `@<module>` | kebab-case module, e.g. `@orders` | matches the case's `<module>` folder |
| `@P<n>` | `@P0` blocks release · `@P1` major · `@P2` minor · `@P3` cosmetic/rare | exactly one |
| `@platform:<id>` | `@platform:web` `@platform:android` `@platform:ios` `@platform:windows` `@platform:macos` `@platform:api` `@platform:other:<id>` | one per id on the case's `**Platform:**` line, same set (CONTRACTS §20); written at design time; `caseMeta({ platform })` puts the same tags on the spec, and they route it to its Playwright project (`web-*` · `desktop-electron` · `api`). Missing → lint warning for one minor version, with the inferred default |
| `@smoke` / `@regression` | literal, may hold both | suite membership — written ONLY by `/qa-regression` (curating-regression), which also removes them; runnable via `npm run test:smoke` / `test:regression` (Playwright types only — k6/ZAP/unit tiers run by type). **Mobile is the exception:** its suite tag is also part of the case's identity at design time (it decides the target suite file in the framework repo per §Mobile testing) and is mirrored into the spec's `describe` title, where the framework's Mocha `grep` selects on it. Quarantined cases are never selected |
| `@manual` | literal | the case is designed but deliberately not automated (e.g. screen-reader or focus-order checks, a step with no automatable surface). `Scripted` stays ❌ for life; reports count it under `manual`, never under "not automated". Written at design time only |
| `@req:<slug>/<id>` | `@req:orders/REQ-012` | one per requirement the case covers (from the analysis file; REQ ids are zero-padded). **Slug-qualified** because REQ numbers restart per feature (CONTRACTS §1); the slug is the feature that owns the REQ — usually the case's `**Feature:**`. Legacy `@req:REQ-012` is still accepted with a lint warning — rewrite it when the case is next touched |
| `@ac:<slug>/<id>` | `@ac:orders/AC-003` | optional; one per acceptance criterion of a dev handoff packet the case verifies (ids verbatim from the packet) |
| `@deprecated:<slug>` | `@deprecated:order-refunds` | the case no longer describes the product — `<slug>` is the feature whose change retired it. Written at design time together with the traceability Status `⊘ deprecated` (CONTRACTS §3); the case is kept as history, never run, never in a suite, never in a re-verify set. Not the same as ⛔ blocked (which is re-triaged every run) |
| `@tms:<id>` | `@tms:48211` (ADO) · `@tms:PROJ-1234` (Jira) | ONLY a real id: written back by `/qa-publish`, or kept by `/qa-design` when it promotes an imported case from the project's own TMS (CONTRACTS §29). Never derived from the case's NNN, never invented |
| `@defect:<id>` | `@defect:DEF-checkout-003` | reverse link to a defect — written ONLY by `/qa-defect` (reporting-defects); stays after the defect closes as history (the defect FILE's `**Status:**` is the truth) |
| `@quarantined:<until>` | `@quarantined:2026-09-30` | the case is flaky and excluded from gate counts and suites until the expiry date — written and removed ONLY by `/qa-quarantine`, always paired with a row in `<qa-root>/regression/quarantine.md` (CONTRACTS §12). Never on `@unit`, `@performance` or `@data` cases. The mirrored spec carries the same value (Playwright `caseMeta({ quarantinedUntil })`, or `@quarantine` in the mobile spec's `describe` title) so `--grep-invert @quarantined` / the framework's quarantine exclusion works |
| `@agentic:gen` | literal | marks agent-generated artifacts; drop it if a human rewrites the case |

**Defect-file tags** (on `<qa-root>/defects/**/DEF-*.md`, NOT on case files): `@tms-bug:<id>` — the real
ADO Bug work-item id or Jira issue key written back by `/qa-defect` after a confirmed push.
**TMS-side only**: `@surface:<key>` is attached to work items by `/qa-publish` for area-path /
component routing and never appears in case files.

## BLOCKED triage ("is a case worth attempting?")

Before scripting or running a case, classify it:

| Verdict | Meaning | Action |
|---|---|---|
| attempt | preconditions satisfiable in the target env | script/run normally |
| ⛔ blocked | missing env, data, dependency, or open defect | record `⛔ + reason` in the traceability Status column; re-triage EVERY run |
| skip-by-design | type disabled or out of scope per plan | note in the plan, no traceability row churn |
| ⊘ deprecated | the behaviour the case checks was removed or replaced | `@deprecated:<slug>` + Status `⊘ deprecated`; never re-triaged, never run — it is not a blocked case |

A case blocked for more than 2 consecutive runs is escalated in the run report — blocked
cases never rot silently.

## FLAKY → quarantine ("is a failure worth counting?")

| Signal | Action |
|---|---|
| `FLAKY` triage in one run (`failures.md`) | report it; the case stays ❌ and counts against the gate |
| `§Quality gates` flake budget exceeded (default: failing-then-passing unchanged twice in 5 runs) | `/qa-quarantine <TC-id> --until <date> --reason "…" --ticket <id>` — tag + ledger row; the case keeps running, gates stop counting it, suites drop it |
| `Until` reached | fix landed → `/qa-quarantine --release <TC-id>`; not fixed → a NEW grant with the reason, never a silent extension; `qa:lint` fails on an expired, unreleased row |
