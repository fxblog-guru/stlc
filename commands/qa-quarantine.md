---
description: Quarantine a FLAKY case (tag + ledger row, ≤30 days) or --release it; never a silent skip.
argument-hint: <TC-id> --until YYYY-MM-DD --reason "<why>" [--ticket <id>] | --release <TC-id> | --list
disable-model-invocation: true
---

Follow `qa-phase-protocol` (invoke the skill if it is not already in context); this file holds only what is specific to this command.

> Profile first, by section (`profile.mjs`) — `§Quality gates` (flake budget = when quarantine is
> allowed), `§Test types`. QA root defaults to `<qa-root>/` (profile-overridable). Contract: CONTRACTS §12.

Quarantine or release the case named in `$ARGUMENTS`; `--list` prints the unreleased ledger rows
with days remaining.

## Preconditions (check before delegating)

- [ ] `<TC-id>` exists as a case file (located via traceability / `**Feature:**` grep — never a filename glob)
      and its type is NOT `unit` or `performance` (those are never quarantined — a flaky unit test is a
      `NON-DETERMINISTIC` test defect → `/qa-script --type unit` regen; a flaky SLO is a finding)
- [ ] **Evidence:** at least one run dir whose `failures.md` triages this case `FLAKY`, or the
      `§Quality gates` flake budget is met (default: failed-then-passed unchanged twice in 5 runs) —
      cite the run-ids. No evidence → STOP: "quarantine needs a FLAKY triage; run it again or fix it"
- [ ] `--until` ≤ today + 30 days; `--reason` non-empty (what is flaky and what fixes it);
      `--ticket` when a fix is tracked (else the reason says why not)
- [ ] Release: the case has an unreleased ledger row AND its last 3 runs are ✅ (cite them) — or the
      user explicitly accepts releasing an unfixed case (recorded in Notes)

## Hard rules

- The case **keeps running** (`/qa-run`, `test:quarantined` in CI); its traceability `Status` stays the
  truth. Quarantine only changes how gates COUNT it and whether suites SELECT it.
- Only two writes: the case's `**Tags:**` line (`@quarantined:<until>`, plus the mirrored spec's
  `caseMeta()` `quarantinedUntil` for Playwright types) and `<qa-root>/regression/quarantine.md` (append a row / fill `Released`).
  Rows are never deleted; an extension is a NEW row.
- A quarantined **P0/P1** case is a named condition in `/qa-signoff` — this command says so in its summary.

## Execution

Delegate to the `test-planner` agent (it invokes `curating-regression` in **quarantine mode**):

- **Quarantine:** append `| <TC-id> | <today> | <until> | <reason> | <run-ids> | <ticket | —> | — |`,
  add the tag to the case (and spec), remove `@smoke`/`@regression` from the case if present
  (recorded in the regression manifest's curation log), run `npm run qa:lint`.
- **Release:** fill `Released` with today's date, remove the tag from case + spec, run `qa:lint`;
  the next `/qa-regression` may re-seat the case from fresh evidence.
- **List:** table of unreleased rows: Case ID · priority · since · until · days left · ticket · last 3 statuses.

## Done criteria

Report back: the row written (or released), the evidence run-ids, days until expiry, whether a
P0/P1 case is now a sign-off condition, and — for releases — the passing runs that justified it.
