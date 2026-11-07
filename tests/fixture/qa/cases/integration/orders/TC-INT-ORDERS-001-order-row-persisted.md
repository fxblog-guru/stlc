# TC-INT-ORDERS-001 — [Orders · API] POST /orders — Standard user creates an order → one orders row in status Open
**Feature:** orders  **Plan:** qa/plans/orders/2026-09-01-test-plan.md
**Type:** integration  **Module:** orders  **Priority:** P1
**Platform:** api
**AC:** AC-001
**Tags:** @integration @orders @P1 @platform:api @req:REQ-001 @agentic:gen

## Grounding
- BR-001 — wiki/compiled/business-rules/br-001-order-needs-a-line.md

## Objective
An order accepted by POST /orders is persisted as one row in status Open.

## Technique
- EP → positive
- error-guessing → negative

## Isolation
- creates: one order row
- cleans: DELETE /orders/{id} in teardown
- actor: pool `standard`
- lock: none

## Preconditions
- [DATA:customer-active]

## Steps
1. Action: POST /orders
   Expected: 201; body.id = @id
2. Action: SELECT status FROM orders WHERE id = @id
   Expected: exactly one row; status = 'Open'

## Variants
| Row | Technique | Input | Expected |
|---|---|---|---|
| 1 | error-guessing | POST /orders with lines = [] | 400; SELECT count(*) for the customer is unchanged |

## Expected Result
- One row in status 'Open' per accepted request; a rejected request leaves no row.

## Data
- Read-only SQL scoped by the returned id
