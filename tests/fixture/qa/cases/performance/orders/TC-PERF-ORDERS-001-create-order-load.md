# TC-PERF-ORDERS-001 — [Orders · API] Create order — 20 concurrent users for 5 min → p95 < 500 ms, error rate < 1%
**Feature:** orders  **Plan:** qa/plans/orders/2026-09-01-test-plan.md
**Type:** performance  **Module:** orders  **Priority:** P1
**Platform:** api
**AC:** —
**Tags:** @performance @orders @P1 @platform:api @req:REQ-004 @agentic:gen

## Grounding
- profile: §Quality gates (performance SLOs)

## Objective
POST /orders holds its latency and error-rate SLOs at 20 concurrent users.

## Technique
- checklist

## Isolation
- creates: one order per iteration (run-unique keys)
- cleans: orders tagged with the run id purged after the run
- actor: pool `perf-users` (20 accounts)
- lock: none

## Preconditions
- [DATA:customer-active] pool of 20

## Workload
- 20 VUs ramp 1m, hold 5m
## SLOs
- p95 < 500 ms; error rate < 1%
## Expected Result
- Both thresholds hold for the whole hold phase.

## Data
- one line per order, SKU varied per iteration
