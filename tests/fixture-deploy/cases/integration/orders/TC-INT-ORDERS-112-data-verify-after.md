# TC-INT-ORDERS-112 — [Orders · API] backfillOrderCurrency — Operator compares orders with the baseline → counts match, 0 orphans
**Feature:** orders  **Plan:** qa/plans/orders/2026-09-01-test-plan.md
**Type:** integration  **Module:** orders  **Priority:** P1
**Platform:** api
**AC:** —
**Tags:** @integration @orders @P1 @platform:api @req:orders/REQ-001 @agentic:gen
**Deploy check:** data-verify-after

## Grounding
- BR-001 — wiki/compiled/business-rules/br-001-order-needs-a-line.md

## Objective
The data-verify-after deploy check holds for migration 0042 (order currency).

## Technique
- checklist

## Isolation
- creates: a disposable copy of the orders database
- cleans: the copy is dropped after the run
- actor: pool `standard`
- lock: schema — orders copy

## Preconditions
- A copy of the orders schema at the pre-0042 version

## Steps
1. Action: compare counts and checksums with baseline.json under the currency transform; count orphan order_lines; rerun the sample queries
   Expected: counts equal; checksums equal the transformed baseline; 0 orphans; sample results as recorded

## Expected Result
- counts equal; checksums equal the transformed baseline; 0 orphans; sample results as recorded

## Data
- Migration 0042 (order currency) from the dev handoff § Interfaces changed
