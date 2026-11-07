---
name: curating-regression
description: Use to curate @smoke/@regression from run evidence, and to quarantine or release a flaky case (/qa-regression, /qa-quarantine).
version: 1.1.0
---

# Curating Regression (+ quarantine mode)

> Profile first, by section (`profile.mjs`) — `§Test types`, `§Quality gates` (flake budget →
> quarantine), the tag taxonomy at `<qa-root>/docs/tag-taxonomy.md`. QA root defaults to `<qa-root>/`.
> Contract: CONTRACTS §6 (tag writers), §12 (quarantine).

## Prime directive — a suite is a maintained selection, not an accumulation
Running everything forever is how regression suites die. Selection follows written rules; every
inclusion AND exclusion is recorded with its reason, so next quarter's curator (possibly you)
knows why. A flaky case is never deleted, skipped, or retried to green — it is quarantined in the
open, with an expiry.

## Action
- **Suite mode** (`/qa-regression`): create or update `<qa-root>/regression/regression-suite.md` (the
  manifest) and tag the selected case files `@smoke` / `@regression`.
- **Quarantine mode** (`/qa-quarantine`): append a row to `<qa-root>/regression/quarantine.md` and tag the
  case `@quarantined:<until>` (and its mirrored spec's `caseMeta()` `quarantinedUntil`), or release it.

## Inputs — resolve before curating (STOP conditions)
1. All plans' traceability tables (0 features with run history → STOP: "suites are curated from
   evidence — run features through /qa-run first").
2. Defect files (defect-prone areas earn seats; `**Status:**` from the file), latest reports,
   `<qa-root>/regression/quarantine.md` (unreleased rows = excluded), `<qa-root>/defects/ESCAPES.md` (escape
   areas earn seats).
3. Existing manifest (update — record removals explicitly, never silently drop).

## Suite mode

### Step 1: Selection rules — applied in order
| Tier | Rule |
|---|---|
| **@smoke** (target: ≤ 10 min wall-clock) | P0 only · pass-stable (last 3 runs ✅) · one case per critical flow, prefer e2e for UI truth + api for speed elsewhere · one accessibility axe case per P0 screen when the type is enabled |
| **@regression** | all P0/P1 pass-stable cases · every case whose REQ area has an OPEN or recently-closed defect (defects mark fragile ground) · every backfill case of an `ESCAPES.md` row (an escape area is fragile by definition) · integration seams touched by >1 feature |
| **Excluded** | `@deprecated:` cases / `⊘ deprecated` rows (retired — never a seat, `qa:lint` errors otherwise) · `@quarantined:` cases (unreleased ledger row) · `@manual` cases (no runner) · ⛔ blocked · cases never run (no evidence of value yet) · P2/P3 unless defect-adjacent |

A case can hold both tags. Every exclusion of a P0/P1 case carries a written reason.

### Step 2: Size & time budget check
Estimate suite runtime from the latest run durations in `<qa-root>/runs/` (`results.json` / `junit.xml`
durations when present). @smoke over budget → cut by "one per flow" until it fits, recording what
was cut and why it's covered elsewhere. No duration data → state the budget as unverified.

### Step 3: Write the manifest
`<qa-root>/regression/regression-suite.md`:
`| Case ID | Feature | Type | Tier(s) | Why selected | Last 3 runs |` grouped @smoke first, then
**Excluded with reasons** (P0/P1 only — quarantined ones cite their ledger `Until`), then
**Runtime estimate**, then **Curation log** (dated entry per update: added/removed/quarantine
effects/why). Rows within each tier are **sorted by Case ID** — two curators on different branches
then edit different lines. One manifest per bundle (curation is one cross-feature pass, run after a
sign-off), not one per module.

**Suites shrink too.** Each pass also removes: deprecated cases (always), cases whose module the
latest impact notes mark as replaced, and P2/P3 seats with no defect adjacency — each with a
curation-log reason. A suite that only grows is not curated.

### Step 4: Tag the case files
Append `@smoke`/`@regression` to each selected case's `**Tags:**` line; REMOVE the tag from cases
dropped this round (the curation log records it). Tags follow `<qa-root>/docs/tag-taxonomy.md` slot order;
the tiers run via `npm run test:smoke` / `npm run test:regression` (Playwright grep, `@quarantined`
grep-inverted — covers e2e/api/integration/accessibility; k6/ZAP/unit cases stay in the manifest and
run by type). Mirror the tag change into the spec's `caseMeta()` `suites` / `quarantinedUntil` for Playwright types so the grep
matches the runner. **Mobile cases:** their suite tag is part of the design (it decides the framework
suite file) — suite mode may ADD `@regression` to a mobile case but records that the staged spec's
`describe` title and Target path must be regenerated (`/qa-script --type mobile`); it never edits a
spec inside the framework repo.

## Quarantine mode (`/qa-quarantine`)

### Q1: Eligibility + evidence (STOP conditions)
- Type ∈ e2e / api / integration / security-spec / accessibility. **Never** `unit`
  (NON-DETERMINISTIC test defect → `/qa-script --type unit` regen) or `performance` (finding).
- Evidence: run-id(s) whose `failures.md` triage the case `FLAKY`, or the `§Quality gates` flake
  budget met (default: failed-then-passed unchanged twice in 5 runs). None → STOP.
- `--until` ≤ today + 30 days; non-empty `--reason`; `--ticket` or the reason says why none.
- One unreleased row per case at a time — an extension = release the old row (or let it expire) and
  append a NEW row with the new reason.

### Q2: Quarantine writes (exactly these)
1. `<qa-root>/regression/quarantine.md`: append `| <Case ID> | <today> | <until> | <reason> | <run-ids> | <ticket | —> | — |`.
2. The case's `**Tags:**` line: add `@quarantined:<until>` in slot order; REMOVE `@smoke`/`@regression`
   if present and log it in the manifest's curation log (the case is out of the suites until released).
3. The mirrored spec's `caseMeta()` (Playwright types: `quarantinedUntil`): the same `@quarantined:<until>` value so
   `--grep-invert @quarantined` excludes it and `test:quarantined` keeps running it. Mobile: append
   `@quarantine` to the STAGED spec's `describe` title (the framework excludes it from gating suites
   and still runs it nightly with `INCLUDE_QUARANTINE=true`); the framework-repo copy is updated by the
   developers from the HANDOFF Notes (`quarantined until <date>`), never by this bundle.
4. `npm run qa:lint` — tag ↔ ledger consistency, bounds, expiry.

### Q3: Release writes
Only with evidence: the last 3 runs of the case ✅ (cite run-ids), or the user explicitly accepts
releasing an unfixed case (quote it in the row's `Reason` suffix `— released unfixed by <role>`).
Fill `Released` = today; remove the tag from case + spec; lint. The next suite-mode run may re-seat
the case from fresh evidence.

### Q4: List
Unreleased rows with: Case ID · priority (from traceability) · since · until · days left · ticket ·
last 3 statuses. Expired-and-unreleased rows are printed first with `EXPIRED` (lint fails on them).

## Step 5: Report ONLY this summary to chat
Suite mode:
```
✓ Updated <qa-root>/regression/regression-suite.md — @smoke {n} cases (~{t} min), @regression {m} cases
Added: {ids} | Removed: {ids + reason} | Quarantined excluded: {count} (expiring soonest: {id → until}) | Manual excluded: {count}
Coverage note: {any P0 flow with NO smoke representative — or "all P0 flows represented"}
```
Quarantine mode:
```
✓ Quarantined <TC-id> until <date> (ledger row + tag) — evidence {run-ids} · ticket {id | none: reason}
Suites: removed from {@smoke/@regression | none} | Sign-off: {P0/P1 → named condition | P2/P3 → reported only}
Next: fix → 3 green runs → /qa-quarantine --release <TC-id>
```

## Done — ALL must be true
- [ ] Every selection/exclusion traceable to a Step 1 rule; P0/P1 exclusions carry reasons; quarantined and manual cases never selected.
- [ ] @smoke fits the time budget or the overage is explicitly justified.
- [ ] Case tags updated both ways (added AND removed) and mirrored into specs; manifest curation log appended.
- [ ] Quarantine: ledger row within 30 days, evidence run-ids present, tag ↔ ledger consistent (`qa:lint` clean); releases cite passing runs or the user's explicit acceptance.
- [ ] No case content edited beyond the `**Tags:**` line; no spec content edited beyond `caseMeta()` `suites` / `quarantinedUntil`.
