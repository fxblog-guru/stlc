# TC-E2E-ORDERS-001 — [Orders · Web] New order form — Standard user saves one line → order listed with status Open
**Feature:** orders  **Plan:** qa/plans/orders/2026-09-01-test-plan.md
**Type:** e2e  **Module:** orders  **Priority:** P1
**Platform:** web
**AC:** AC-003
**Tags:** @e2e @orders @P1 @platform:web @req:REQ-002 @defect:DEF-orders-001 @quarantined:2026-09-30 @agentic:gen

## Grounding
- BR-001 — wiki/compiled/business-rules/br-001-order-needs-a-line.md

## Objective
A signed-in user creates an order from Orders > New Order and sees it listed as Open.

## Technique
- use-case → journey, positive
- error-guessing → negative

## Isolation
- creates: one order (customer `[DATA:customer-active]`)
- cleans: order deleted through the API in teardown
- actor: pool `standard`
- lock: none

## Preconditions
- Signed in as a `standard` pool user

## Steps
1. Action: Navigate to Orders > New Order
   Expected: the "New Order" form opens with an empty Line Items grid
2. Action: Add one line (SKU-1, quantity 1) and click "Save"
   Expected: toast "Order created"; the URL ends with /orders/<id>
3. Action: Navigate to Orders
   Expected: the list shows the new order with status "Open"

## Variants
| Row | Technique | Input | Expected |
|---|---|---|---|
| 1 | error-guessing | click "Save" with no line | inline error "Add at least one line"; no order in the list |

## Expected Result
- The order created in step 2 is listed with status "Open".

## Data
- `[DATA:customer-active]`; SKU-1 × 1
