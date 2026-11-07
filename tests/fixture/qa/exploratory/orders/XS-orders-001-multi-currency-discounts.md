---
slug: orders
artifact: exploratory
status: in-review
authored_by: running-exploratory-sessions
reviewed_by: pending
created: 2026-09-11
updated: 2026-09-11
---

# XS-orders-001 — Multi-currency discounts

## Charter
- Mission: explore discount maths across currencies on the order form
- Timebox: 90 min

## Session
- Tester: QA lead · Env: uat · Started: 2026-09-13 10:00 · Ended: 11:25 · Build: a1b2c3d

## Notes
- 10:05 GBP+EUR order accepts a 10% discount, total shown in GBP only

## Bugs
| # | What happened | Expected | Evidence | Status |
|---|---|---|---|---|
| 1 | Discount dropped when switching currency | Discount retained | runs/e2e/orders/_adhoc/shot-1.png | raised DEF-orders-003 |
| 2 | Tooltip overlaps total | Tooltip below field | shot-2.png | candidate |

## Follow-ups
| # | Kind | Detail | Action |
|---|---|---|---|
| 1 | CASE | currency partition for OrderTotal#Compute | `/qa-design orders --type unit` |
| 2 | QUESTION | Is discount applied per line or per order? | `/qa-clarify orders` |

## Debrief
- Past: covered form + list · Results: 1 bug, 1 candidate · Obstacles: no EUR customer seed · Outlook: repeat on invoices · Feelings: fine
