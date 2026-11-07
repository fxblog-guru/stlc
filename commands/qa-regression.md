---
description: Curate @smoke and @regression suites from run evidence; quarantined and manual excluded.
argument-hint: (no arguments)
disable-model-invocation: true
---

Follow `qa-phase-protocol` (invoke the skill if it is not already in context); this file holds only what is specific to this command.

> Profile first, by section (`profile.mjs`) — `§Quality gates` (flake budget → quarantine),
> `<qa-root>/docs/tag-taxonomy.md` (tag vocabulary). QA root defaults to `<qa-root>/` (profile-overridable).

Curate the regression and smoke suites across ALL features. Best run after each `/qa-signoff`,
or whenever a feature ships enough run history to earn suite seats.

## Preconditions (check before delegating)

- [ ] At least one feature's traceability table carries run history (`Last run` filled)

Suites are curated from evidence — a case that has never run has not earned a seat.

## Selection rule (hard constraint)

Inclusion and exclusion follow the skill's written rules (priority, pass-stability, defect
adjacency, escape-area seats, quarantine from `<qa-root>/regression/quarantine.md`, `@manual` exclusion,
time budget). Every P0/P1 exclusion carries a written reason in the manifest. The only case-file edit
allowed is the `**Tags:**` line (adding AND removing `@smoke`/`@regression`), mirrored into the
spec's `caseMeta()` `suites`. Quarantining itself is `/qa-quarantine`, never done here by hand.

## Execution

Delegate to the `test-planner` agent (it invokes the `curating-regression` skill). Output:

- `<qa-root>/regression/regression-suite.md` — the manifest: selected cases per tier with "why selected"
  and last-3-runs evidence, excluded P0/P1 cases with reasons, runtime estimate vs the ≤10-min
  @smoke budget, and a dated curation log entry.
- `@smoke`/`@regression` tags updated on the case files so `npm run test:smoke` / `npm run test:regression`
  (Playwright grep) execute a tier directly; k6/ZAP cases stay manifest-listed, run by type.

**Run plans follow the tags.** After tagging, refresh the standard `smoke` and `regression` run plans
(`npm run qa:plan:standard`, the `composing-run-plans` skill, CONTRACTS §19): they SELECT by
`@smoke`/`@regression`, so CI and `/qa-run --plan smoke|regression` run exactly what this command
curated. They never duplicate the curation.

## Done criteria

Report back: suite sizes and estimated runtimes, cases added/removed with reasons, quarantined
flakes excluded (with the soonest expiry), manual cases excluded, and any P0 flow left without a
smoke representative.
