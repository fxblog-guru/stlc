---
description: Forecast QA effort from the analysis via §Estimation baselines, with derivations and confidence.
argument-hint: <slug>
disable-model-invocation: true
---

Follow `qa-phase-protocol` (invoke the skill if it is not already in context); this file holds only what is specific to this command.

> Profile first, by section (`profile.mjs`) — `§Test types` (what gets estimated), `§Estimation
> baselines` (rates; documented defaults apply when absent). QA root defaults to `<qa-root>/`.

Estimate feature `$ARGUMENTS`. Best run after `/qa-analyze`, before `/qa-plan` commits scope.

## Preconditions (check before delegating)

- [ ] `<qa-root>/analysis/$ARGUMENTS/YYYY-MM-DD-analysis.md` exists with REQ-ids, risk scores, and the
      per-type testability matrix

No analysis → STOP: estimates come from the analysis, never from raw docs or vibes.

## Data rule (hard constraint)

Every number shows its derivation: case counts = analysis items × the design skills' minimum
rules; hours = counts × a named `§Estimation baselines` rate; buffer = the risk band. Historical
throughput from completed features OVERRIDES the rule-of-thumb when history exists; no history →
confidence is LOW, stated in bold.

## Execution

Delegate to the `test-planner` agent (it invokes the `estimating-effort` skill). Output
`<qa-root>/plans/$ARGUMENTS/YYYY-MM-DD-estimate.md`:

- Summary table: per enabled type — case range, design/script/run hours — plus the buffered total.
- Derivation arithmetic, numbered assumptions, exclusions (env setup, dev fix wait, UAT),
  confidence level with reason, and "what would change this number".

## Done criteria

Report back: the estimate path, total hours/days with buffer, confidence level and what it was
calibrated on, and the single assumption most worth verifying before committing the number to a
sprint plan.
