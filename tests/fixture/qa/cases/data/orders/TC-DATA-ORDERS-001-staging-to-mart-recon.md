# TC-DATA-ORDERS-001 — [Orders · API] raw_prepared.stg_orders → prepared.fct_orders — dedup recon → the mart equals the latest load per order
**Feature:** orders  **Plan:** qa/plans/orders/2026-09-01-test-plan.md
**Type:** data  **Module:** orders  **Priority:** P0
**Platform:** api
**AC:** AC-002
**Tags:** @data @orders @P0 @platform:api @req:orders/REQ-001 @agentic:gen

## Grounding
- BR-001 — wiki/compiled/business-rules/br-001-order-needs-a-line.md
- profile: §Data testing R3

## Objective
The orders mart holds exactly the latest load of every staged order, with the same total amount.

## Technique
- decision-table → positive, negative
- BVA → boundary

## Isolation
- creates: nothing in the warehouse (CI engine over the fixture)
- cleans: nothing
- actor: none
- lock: none

## Hop
- from: raw_prepared.stg_orders
- to: prepared.fct_orders
- relationship: dedup
- grain: one row per order_id
- window: 3 days late-arrival, by _loaded_at (source) and ordered_at (target)
- dedup order: _loaded_at desc

## Oracle
- distinct-keys: order_id on the deduplicated source and the mart
- sum: order_total, decimal(18,2)
- row-hash: order_id, status, order_total against the latest row per key

## Tolerance
- exact

## Preconditions
- Fixture dbt-transform/fixtures/raw_orders.csv loaded; o-1 is loaded twice with a different status

## Steps
1. Action: compare distinct order_id on the deduplicated source with the mart row count
   Expected: 4 = 4
2. Action: compare SUM(order_total) on both sides
   Expected: 226.48 = 226.48
3. Action: compare the row hash of the latest row per key with the mart row
   Expected: 0 mismatched keys

## Expected Result
- The mart equals the latest load per order; a stale or missing row is named by its order_id.

## Data
- Fixture rows that make the checks fail on a defect: o-1 loaded twice (dedup), 199.98 amount (rounding), 0.00 order (filter)
