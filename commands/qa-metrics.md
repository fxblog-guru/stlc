---
description: Portfolio KPIs: DDP (test recall), coverage, pyramid mix, pass rate, flake, defects, MTTR, trend.
argument-hint: (no arguments)
disable-model-invocation: true
---

Follow `qa-phase-protocol` (invoke the skill if it is not already in context); this file holds only what is specific to this command.

> Profile first, by section (`profile.mjs`) — `§Test types`, `§Quality gates`. QA root defaults
> to `<qa-root>/` (profile-overridable).

Render the portfolio metrics snapshot. Feature-level detail belongs to `/qa-report`; this is the
cross-feature view for sprint reviews and management updates.

## Preconditions (check before delegating)

- [ ] At least one plan under `<qa-root>/plans/*/` carries a traceability table

## Data rule (hard constraint)

KPIs are computed ONLY from traceability tables, feature reports, committed run text evidence
(`summary.md`/`failures.md`), defect files, and the ledgers (`<qa-root>/regression/quarantine.md`,
`<qa-root>/defects/ESCAPES.md`). Nothing is re-run. MTTR (Raised→Closed of `fixed` defects), defect escape
rate (ESCAPES vs INTERNAL in the window) and flake rate (FLAKY triages over retained runs) are
measurable NOW that the lifecycle and ledgers exist; a KPI whose inputs are still absent is listed
under **Not measurable here** with the window stated — never approximated.

## Execution

Delegate to the `qa-reporter` agent (it invokes the `tracking-metrics` skill). Output
`<qa-root>/reports/metrics/YYYY-MM-DD-metrics.md`:

- **Portfolio KPIs** — automation coverage (overall + P0/P1), test-pyramid mix vs the §Quality gates
  target, run pass rate (+ gate-effective), execution debt, flake rate + quarantine load (P0/P1,
  expiring, expired), defect load by severity and origin with oldest ages, MTTR, escape rate + phase/
  type missed + backfill debt, exploratory coverage, gate posture counts, unit + accessibility posture.
- **Per-feature table** — one transcribed row per plan.
- **Trend** vs the previous snapshot (or "first snapshot").
- **Observations** — ≤ 3, factual, each citing its rows; recommendations stay with humans and
  `/qa-signoff`.

## Done criteria

Report back: the snapshot path, the headline KPIs (coverage %, pyramid mix, pass rate, quarantined
P0/P1, open C/H defects, MTTR, escape rate), the gate posture split, and the single largest trend
delta (or "first snapshot").
