# TC-API-ORDERS-001 — [Orders · API] POST /orders — Standard user submits one line for an active customer → 201, order Open
**Feature:** orders  **Plan:** qa/plans/orders/2026-09-01-test-plan.md
**Type:** api  **Module:** orders  **Priority:** P0
**Platform:** api
**AC:** AC-001, AC-002
**Tags:** @api @orders @P0 @platform:api @smoke @req:REQ-001 @tms:PROJ-1234 @agentic:gen

## Grounding
- BR-001 — wiki/compiled/business-rules/br-001-order-needs-a-line.md
- code: backend:src/Orders/OrderTotal.cs#Compute @ a1b2c3d

## Objective
POST /orders creates an order from a valid payload and refuses an invalid or unauthenticated one with the documented error contract.

## Technique
- EP → positive
- BVA → boundary, negative
- error-guessing → negative, error-contract, authz

## Isolation
- creates: one order per run (factory key `run-<runId>`)
- cleans: DELETE /orders/{id} in teardown, idempotent
- actor: pool `standard`
- lock: none

## Preconditions
- [DATA:customer-active]

## Steps
1. Action: POST /orders with one line for the active customer
   Expected: 201; body.id non-null; body.status = "Open"
2. Action: GET /orders/{id}
   Expected: 200; status = "Open"; lines echo the payload

## Variants
| Row | Technique | Input | Expected |
|---|---|---|---|
| 1 | BVA | lines = [] (min − 1) | 400; errors.lines present; no order row created |
| 2 | EP | customerId absent | 400; errors.customerId present |
| 3 | error-guessing | no session cookie | 401; body = { code: "unauthenticated" } |

## Expected Result
- Valid payload → 201 and a readable Open order; every invalid row → its 4xx with the error shape `{ code, message, errors }`.

## Data
- customerId from `[DATA:customer-active]`; one line `{ sku: "SKU-1", qty: 1 }`
