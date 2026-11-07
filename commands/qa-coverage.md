---
description: How much of the app the suite covers: REQs, AC, API ops, screens, BRs, risks, per type, with gaps.
argument-hint: "[<slug>…] [--spec <openapi>] [--strict]"
disable-model-invocation: true
---

Follow `qa-phase-protocol` (invoke the skill if it is not already in context); this file holds only what is specific to this command.

> Profile first, by section (`profile.mjs`) — `§Test types`, `§Application under test` (the OpenAPI
> spec), `§Quality gates`. QA root defaults to `<qa-root>/` (profile-overridable).

Measure how much of the application under test the suite covers, per dimension and per test type,
and list the gaps with the command that closes each. `/qa-metrics` reports how the process runs
(pass rate, flake, MTTR); this reports **what is tested and what is not**.

## Preconditions (check before delegating)

- [ ] At least one `<qa-root>/analysis/<slug>/` or `<qa-root>/plans/<slug>/` exists

## Execution

Delegate to the `qa-reporter` agent, which invokes the `assessing-test-coverage` skill. It runs
`npm run qa:coverage` (arguments passed through) and writes `<qa-root>/reports/coverage/YYYY-MM-DD-coverage.md`
(CONTRACTS §22):

- **Coverage by dimension**:
  - requirements, REQ × type cells and acceptance criteria;
  - API operations (api, and authz via security);
  - screens (e2e, accessibility, ui) and business rules;
  - analysed risks;
  - automation (all and P0/P1), executed and passing.

  Each shows `covered/total`, `%`, the target, and the file it was measured from.
- **Coverage by test type**: designed, automated, run and passing per type, plus the share of the
  app surface that type covers.
- **API operations** and **Screens**: one row each, with the case ids per type.
- **Unit code coverage**, transcribed from the latest `coverage-summary.md`.
- **Gaps**, ranked, each with the next command.

A dimension with no denominator on disk is `not measurable`, with the file that would make it
measurable named. Never 0 %, never 100 %, and never averaged into one score.

## Done criteria

Report back the report path, the weakest dimension as `x/y (p%)`, one line per type with designed
cases, the not-measurable dimensions, and the first High gap's command. With `--strict`, exit 1
means a requirement or a High risk has no case.
