---
slug: orders
date: 2026-09-05
verdict: REVISE FIRST
reviewed:
  - path: qa/cases/api/orders/TC-API-ORDERS-001-create-order-contract.md
    sha256: 9cb4cb16255c6836b14b49e2ccacecda4e7c8e25095bb69ab68c9e1ec4549d21
---

# Case review — orders — 2026-09-05

**Verdict:** REVISE FIRST   **Reviewer:** test-planner (reviewing-cases)   **Plan:** qa/plans/orders/2026-09-01-test-plan.md

## Findings

| # | Severity | Class | Where | Evidence | Prescribed action |
|---|---|---|---|---|---|
| 1 | High | GAP | REQ-003 × security | no TC-SEC case for the role matrix | /qa-design orders --type security |

## Coverage

8 REQ × type cells audited, 1 gap; mobile skipped (disabled in this fixture's profile).

## Next

/qa-design orders --type security, then re-review.
