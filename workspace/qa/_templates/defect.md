---
slug: <slug>
artifact: defect
status: draft
authored_by: reporting-defects
reviewed_by: pending
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# DEF-<slug>-NNN — <title>
**Status:** OPEN   **Severity:** <Critical | High | Medium | Low> (<rule fired>)   **Raised:** YYYY-MM-DD   **Closed:** —
**Origin:** <INTERNAL | ESCAPED | EXPLORATORY>   **Feature:** <slug>   **Case:** <TC-id | —>   **REQ:** <ids | —>   **Env:** <env>   **Run:** <run-id | —>
**Resolution:** —

<!-- Written by /qa-defect (reporting-defects) or /qa-escape (analyzing-escaped-defects).
     CONTRACTS §13: field names byte-exact; CLOSED only with a Resolution; `fixed` only after a
     `## Verification` line written by /qa-defect --verify. -->

## Steps to reproduce

1. <from the case's steps>

## Expected (verbatim from the case)

<quote>

## Actual (verbatim from the run output)

<quote>

## Evidence

- <<qa-root>/runs/<type>/<slug>/<run-id>/… paths>
- <server ids, when failures.md has them: request <id> · trace <id>>

## Impact

<who is affected, what breaks, which gate it fails>

## Recurrence

## Verification
