---
slug: <slug>
date: YYYY-MM-DD
shipped_sha: —
runs: []
overall: not evaluable
---

# QA report — <slug> — YYYY-MM-DD

<!-- Written by /qa-report (reporting-results). CONTRACTS §16: the front matter and the
     `## Quality gates` table are what the dev bundle parses at its G10 deploy gate — keys,
     headings and columns are byte-exact; `overall` is derived from the Verdict column
     (fail > not evaluable > pass). Every number traces to the traceability table or a run
     artifact; a section whose type is disabled or not run says so in one line. -->

## Executive summary

<One paragraph for someone who will not read the rest, then the overall gate verdict.>

## Coverage by type

| Type | Designed | Scripted | Manual | Run | Pass | Fail | Blocked | Not run yet |
|---|---|---|---|---|---|---|---|---|

<!-- Platform × type (CONTRACTS §20): one row per §Platforms row with cases; cells ✅ n · ❌ n · ⛔ n · handoff n | not run -->
| Platform | api | integration | e2e | security | accessibility | ui | mobile |
|---|---|---|---|---|---|---|---|

## Quality gates

| Gate | Target | Actual | Verdict | Evidence |
|---|---|---|---|---|

## Performance SLOs

| Transaction | p95 target | p95 actual | Error target | Error actual | Verdict |
|---|---|---|---|---|---|

## Security findings

| ID | Severity | Source | Evidence | Affected REQ | Case | Status |
|---|---|---|---|---|---|---|

## Unit coverage & handoff

| Module | Files | Line % | Branch % | Target | Verdict |
|---|---|---|---|---|---|

## Accessibility findings

| ID | Severity | Source | Evidence | Affected REQ | Case | Status |
|---|---|---|---|---|---|---|

## Device matrix & mobile handoff

| Device | Platform | OS | Type | Cases run | Pass | Fail | Notes |
|---|---|---|---|---|---|---|---|

## Quarantined & manual

| Case ID | Priority | Since | Until | Reason | Ticket | Last status |
|---|---|---|---|---|---|---|

## Exploratory sessions

<`sessions: n (debriefed m)` and the latest `## Debrief` Results line, or "No sessions recorded.">

## Failure digest

| Case ID | Class | Error (one line) | Defect | Next step |
|---|---|---|---|---|

## Deviations from plan

<Types planned but not run · cases designed but never scripted · SLOs or thresholds relaxed, with who said so and where (profile line or answered question). "None" when there are none.>

## Residual risk

<What is still unproven, in business terms, for the sign-off's executive summary.>

## Trend

<Delta vs the previous report, or "First report — no trend.">

## Gaps & recommendations

- <honest list>
