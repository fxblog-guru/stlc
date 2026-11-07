---
description: Step 6 · feature report in the §16 shape: gate verdicts, findings, coverage, trend; never fabricated.
argument-hint: <slug>
disable-model-invocation: true
---

Follow `qa-phase-protocol` (invoke the skill if it is not already in context); this file holds only what is specific to this command.

> Profile first, by section (`profile.mjs`): it defines the gate targets (§Quality gates), the
> enabled test types (§Test types), and the QA root used below (default `<qa-root>/`,
> profile-overridable).

Report on feature `$ARGUMENTS`. This is step 6 of the pipeline.

## Preconditions (check before delegating)

- [ ] The plan `<qa-root>/plans/$ARGUMENTS/YYYY-MM-DD-test-plan.md` (latest) exists and contains the
      `## Traceability (Requirement ↔ Case)` table

If the plan or table is missing, STOP and report it — there is nothing trustworthy to report
from. An empty (skeleton-only) table is reportable: the report then honestly states that no cases
have been designed yet.

## Data rule (hard constraint)

The report reads ONLY:

1. the plan's `## Traceability (Requirement ↔ Case)` table, and
2. the run artifacts under `<qa-root>/runs/…` that the table's `Report` column references.

Do not rescan `<qa-root>/cases/` or `<qa-root>/scripts/` to infer results, do not re-run anything, and NEVER
fabricate or extrapolate numbers. A row with an empty `Last run` renders as **not run yet** — an
honest gap, not a guess. If a `Report` path in the table points at a missing directory, flag it
as an inconsistency instead of inventing its contents.

**Run-plan runs count.** A `Report` cell may name `<qa-root>/runs/plans/<name>/<run-id>/` (`/qa-run --plan`,
CONTRACTS §19): read its `summary.md` and `junit.xml` like any run folder, and list its run-id in the
front matter `runs:`. Only the rows of THIS slug are read from it — a plan's other features are theirs.

## Execution

Delegate to the `qa-reporter` agent (it invokes the `reporting-results` skill), passing the slug,
the plan path, and the gate targets. Output:

- `<qa-root>/reports/$ARGUMENTS/YYYY-MM-DD-report.md` (today's date) in the **CONTRACTS §16 shape** —
  front matter (`slug`, `date`, `shipped_sha` from the plan header, `runs`, `overall` derived from
  the gate rows), the fifteen headings in order, and the `| Gate | Target | Actual | Verdict |
  Evidence |` table the dev bundle parses at its deploy gate — containing:
  1. **Per-type summary** — for each type with traceability rows: designed / scripted / run /
     ✅ pass / ❌ fail / ⛔ blocked / not run yet, plus P0/P1 failures called out by Case ID; then the
     **platform × type matrix** (CONTRACTS §20) — every platform under test is shown, a platform
     with cases and no run as `not run`.
  2. **Gate verdicts** — one pass/fail line per gate in §Quality gates (defaults where the
     profile is silent: coverage per enabled type ≥ the plan's target; e2e/api/integration → 0
     failing P0/P1 EXCLUDING quarantined rows, which are printed as `(quarantined: n — ids)`;
     performance → p95 latency & error-rate SLOs from the run artifacts; security → no unresolved
     High/Critical findings; accessibility → 0 unresolved Critical/High findings from the a11y runs'
     `findings.md`; unit → 0 failing + line/branch coverage on impacted modules ≥ §Unit testing
     thresholds from `coverage-summary.md`, plus a `⚠ awaiting handoff` count for `⛔` unit rows;
     quarantine → no expired-unreleased ledger rows; **`Re-verify set`** when the plan has
     `re-verify:` rows → `pass` only if every one is ✅ with a `Last run` at/after `shipped_sha`,
     `fail` on any ❌, `not evaluable` if any is unrun, ⛔ or older — CONTRACTS §16); **one
     `Platform: <label>` row per gate-tier platform** of §Platforms and a `UI (visual & layout)` row when
     ui cases exist (appended rows — CONTRACTS §20; the §16 shape is unchanged). Each verdict cites the rows/artifacts it was
     computed from. A gate whose data is absent is **not evaluable** — reported as such, never
     defaulted to pass.
  3. **Trend** — if an earlier `<qa-root>/reports/$ARGUMENTS/YYYY-MM-DD-report.md` exists, compare
     against the most recent one: pass-rate delta per type, newly failing cases, newly fixed
     cases. Omit the section entirely when this is the first report.
  4. **Unit coverage** — when unit rows exist: the `coverage-summary.md` table of the latest unit
     run (per module: line %, branch %, target, verdict) and the HANDOFF backlog (`proposed` rows);
     no unit run → "Unit coverage: not evaluable".
  5. **Not run yet** — the rows with no `Last run`, listed by Case ID; `@manual` rows listed separately as manual.
  6. **Blocked** — every ⛔ row with its recorded reason.
  7. **Quarantined & manual** — unreleased ledger rows for this feature (priority, since, until, ticket, last status); manual cases with recorded verdicts.
  8. **Exploratory sessions** — `sessions: n (debriefed m)` from `<qa-root>/exploratory/<slug>/`, latest Results line.
  9. **Failure digest** — each ❌ with its class, linked defect + the defect file's Status (`verifiable` when the case now passes), and next step.
- **Optional HTML** — only if the template `<qa-root>/docs/templates/report.html` exists, additionally
  render `<qa-root>/reports/$ARGUMENTS/YYYY-MM-DD-report.html` from it with the same numbers. If the
  template is absent, skip HTML silently (the `.md` is the deliverable) — do not invent a
  template.

## Done criteria

Report back: the report path(s), the overall gate verdict (all pass / which gates fail and why /
which are not evaluable), and the single most useful next action (e.g. "2 P0 e2e failures — see
failure details in `<qa-root>/runs/e2e/$ARGUMENTS/<run-id>/`, then `/qa-heal` or raise the defect").
