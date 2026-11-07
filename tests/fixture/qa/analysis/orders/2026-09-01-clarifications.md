---
slug: orders
artifact: clarifications
status: in-review
authored_by: clarifying-requirements
reviewed_by: pending
created: 2026-09-01
updated: 2026-09-01
---

# Clarifications — orders — 2026-09-01

**Questions:** 2 (1 BLOCKING) · **Date sent:** 2026-09-01 · **To:** product owner
Answer inline under each question — one word is fine when options are given.

### Q-001 [BLOCKING] — Is a retried order submission one order or two?
**REQ:** REQ-001  **AC:** AC-001  **Source:** analysis/orders/2026-09-01-analysis.md R-001
**Why it matters:** the duplicate-submit case asserts one of the two; the wrong one ships a double charge.
**Options (if enumerable):** a) one order (idempotent) b) two orders
**QA assumes meanwhile:** one order — **cost if wrong:** TC-API-ORDERS-001 row 2 is rewritten
**Status:** ANSWERED — a) one order (2026-09-01, product owner)

### Q-002 [NON-BLOCKING] — What is the largest number of lines an order may carry?
**REQ:** REQ-001  **AC:** —  **Source:** docs/orders.md:L10 (no upper bound stated)
**Why it matters:** the boundary rows of the create-order case need a maximum.
**Options (if enumerable):** a) 100 b) 200 c) no limit
**QA assumes meanwhile:** 200 — **cost if wrong:** one boundary row changes
**Status:** OPEN
