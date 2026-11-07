---
slug: <slug>
date: YYYY-MM-DD
verdict: READY FOR /qa-script | REVISE FIRST
reviewed:
  - path: <qa-root>/cases/<type>/<module>/TC-<TYPE>-<MODULE>-NNN-<short-desc>.md
    sha256: <64 hex — body hash, `node <qa-root>/scripts/shared/build-state.mjs --hash <path>`>
---

# Case review — <slug> — YYYY-MM-DD

**Verdict:** <READY FOR /qa-script | REVISE FIRST>   **Reviewer:** test-planner (reviewing-cases)   **Plan:** <qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md

<!-- Written by /qa-review (reviewing-cases). Read-only: the review edits no case, plan row or
     script. REVISE FIRST when any High finding exists. The `reviewed:` list records exactly which
     case bodies this verdict covers (CONTRACTS §18): edit one afterwards and the review goes
     STALE on the board, because the verdict no longer describes what is on disk. -->

## Findings

| # | Severity | Class | Where | Evidence | Prescribed action |
|---|---|---|---|---|---|

<!-- Class ∈ GAP · THIN · DEPTH · DUP · BR-CONFLICT · UNGROUNDED · VAGUE (reviewing-cases Steps 1–5) -->

## Case scores

<!-- One row per reviewed case, scored against <qa-root>/_templates/case-review-checklist.md
     (pass 1 / fail 0 per attribute). < 7/8, or a 0 on Obj, Determ or Title, is a High finding above. -->

| Case ID | Obj | Trace | Isol | Determ | Tech | Prio | Data | Title | Score | Note |
|---|---|---|---|---|---|---|---|---|---|---|

## BR coverage

<!-- reviewing-cases Step 4: every BR the analysis or impact note names, and the cases whose
     ## Grounding cites it. `—` in the last column is a GAP finding above. -->
| BR | Named by | Cited by cases |
|---|---|---|
| BR-NNN | analysis §2 · impact §1 | TC-<TYPE>-<MODULE>-NNN |

## Coverage

<`n` REQ × type cells audited, `g` gaps; types skipped because disabled.>

## Next

<`/qa-design <slug> --type <t>` with the fix list, or `/qa-script <slug>`.>
