---
slug: orders
artifact: defect
status: in-review
authored_by: analyzing-escaped-defects
reviewed_by: pending
created: 2026-09-12
updated: 2026-09-12
---

# DEF-orders-003 — Discount lost on orders with 2 currencies (production)
**Status:** OPEN   **Severity:** High (customer-visible, money)   **Raised:** 2026-09-12   **Closed:** —
**Origin:** ESCAPED   **Feature:** orders   **Case:** —   **REQ:** REQ-001   **Env:** prod   **Run:** —
**Resolution:** —

## Steps to reproduce
## Expected (verbatim from the case)
## Actual (verbatim from the run output)
## Evidence
- analysis/orders/sources/PROJ-990.md
## Impact
## Escape analysis
### Phase missed
- DESIGN — no case covers multi-currency discount (REQ-001 row has one api case)
### Type missed
- unit
### Backfill
- `/qa-design orders --type unit` — subject OrderTotal#Compute, currency partition
