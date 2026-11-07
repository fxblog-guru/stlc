---
description: Audit the repo's existing unit tests: gaps vs BRs, smells with path:line, mutation sensitivity.
argument-hint: <slug | module>
disable-model-invocation: true
---

Follow `qa-phase-protocol` (invoke the skill if it is not already in context); this file holds only what is specific to this command.

> Profile first, by section (`profile.mjs`) — `§Test types` (is `unit` enabled), `§Unit testing`
> (repo paths, test dirs, frameworks, thresholds, coverage format), `§Code knowledge`. QA root
> defaults to `<qa-root>/` (profile-overridable).

Audit the existing unit tests behind `$ARGUMENTS` (a feature slug, or a bare module name). Best
run **before `/qa-design --type unit`** on a brownfield module (so design targets real gaps
instead of re-testing what developers already cover) and **whenever someone says "that's covered
by unit tests"** — the audit answers with evidence.

## Preconditions (check before delegating)

- [ ] `unit` is enabled in §Test types AND §Unit testing has ≥1 layer row (repo path, test dirs,
      framework). Enabled-but-unconfigured → STOP with the `> **Project setup required:**` callout.
- [ ] `$ARGUMENTS` resolves to modules: a slug → the plan's module list (+ the latest impact note's
      `## 2. Modules & code touched` when `/qa-impact` ran); a module name → that folder/namespace,
      confirmed against `<qa-root>/docs/impact-map.md` or the repo. Nothing resolvable → STOP and ask with
      the researched candidate, never an open question.
- [ ] The declared repo path(s) exist and are readable.

Coverage numbers are optional input: the latest `<qa-root>/runs/unit/<slug>/<run-id>/coverage-summary.md`
(written by `/qa-run --type unit`). Absent → the coverage half of the audit is `not evaluable`
and the report says so; **this command never runs the suite or the coverage command**.

## Audit rule (hard constraint)

Read-only, everywhere. No test file, production file, case, plan row, or HANDOFF row is edited;
no package is installed; no mutation tool is run. Every finding cites `path:line` (or a coverage
cell) and prescribes an action for the developers or for `designing-unit-cases`.

## Execution

Delegate to the `unit-test-engineer` agent (it invokes `reviewing-unit-tests`). Output
`<qa-root>/reviews/<slug>/YYYY-MM-DD-unit-review.md` (for a bare module, `<slug>` = the module name) with:

- **Coverage-gap table** — every logic-bearing symbol in scope: BR/risk · citation · tests found ·
  line/branch % (or `n/a`) · Gap ∈ `NONE / WEAK / NO TESTS / UNTESTABLE` · priority.
- **Findings** ranked High→Low from the smell catalogue (`NO-ASSERT`, `TAUTOLOGY`, `BOUNDARY-BLIND`,
  `HAPPY-ONLY`, `NON-DETERMINISTIC`, `MYSTERY-GUEST`, `OVER-MOCKING`, `SKIPPED-LEFTOVER`, …), each
  with quoted evidence.
- **Mutation-sensitivity spot checks** on the top-risk symbols — which existing test would fail if
  `>=` became `>`; `NONE` = a finding with the exact row to add.
- **§5 Subjects for `/qa-design --type unit`** and **§6 Testability seams for developers**.
- **Verdict**: `UNIT COVERAGE: ADEQUATE` (zero High findings, no `NO TESTS`/`WEAK` on P0/P1
  symbols) or `UNIT COVERAGE: GAPS`; coverage vs §Unit testing thresholds per module.

## Done criteria

Report back: the review path, the verdict, symbol counts by Gap class, branch coverage per module
(or `not evaluable`), finding counts by severity with the worst finding in one line, and the next
command — `/qa-design <slug> --type unit` with the number of subjects queued, plus the seams to
raise with the dev team.
