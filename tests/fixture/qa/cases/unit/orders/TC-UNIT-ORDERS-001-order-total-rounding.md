# TC-UNIT-ORDERS-001 — [Orders · API] OrderTotal.Compute — line total 1.005 rounds half away from zero → 1.01
**Feature:** orders  **Plan:** qa/plans/orders/2026-09-01-test-plan.md
**Type:** unit  **Module:** orders  **Priority:** P0
**Platform:** api
**AC:** AC-002
**Tags:** @unit @orders @P0 @platform:api @req:REQ-001 @agentic:gen

## Grounding
- BR-001 — wiki/compiled/business-rules/br-001-order-needs-a-line.md
- code: backend:src/Orders/OrderTotal.cs#Compute @ a1b2c3d

## Objective
OrderTotal.Compute rounds a line total half away from zero to two decimals.

## Technique
- BVA → boundary
- EP → positive, negative

## Isolation
- creates: nothing (in-memory values)
- cleans: nothing
- actor: none
- lock: none

## Subject
- backend:src/Orders/OrderTotal.cs#Compute @ a1b2c3d

## Test matrix
| Row | Given (input / state) | When (call) | Then (expected) | Technique | Guards |
|---|---|---|---|---|---|
| 1 | lines [1.005] | Compute() | 1.01 | boundary | Math.Round mode |

## Doubles
- none

## Preconditions
- none

## Steps
1. Action: Row 1
   Expected: 1.01
## Expected Result
- Compute() returns 1.01 for [1.005].
## Data
- lines [1.005]
