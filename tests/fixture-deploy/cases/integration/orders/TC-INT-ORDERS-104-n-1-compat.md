# TC-INT-ORDERS-104 — [Orders · API] createOrder — Previous release creates an order on the new schema → 201, row readable by both releases
**Feature:** orders  **Plan:** qa/plans/orders/2026-09-01-test-plan.md
**Type:** integration  **Module:** orders  **Priority:** P1
**Platform:** api
**AC:** —
**Tags:** @integration @orders @P1 @platform:api @req:orders/REQ-001 @agentic:gen
**Deploy check:** n-1-compat

## Grounding
- BR-001 — wiki/compiled/business-rules/br-001-order-needs-a-line.md

## Objective
The n-1-compat deploy check holds for migration 0042 (order currency).

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
1. Action: deploy release 2026.10 against the migrated copy; POST /orders
   Expected: 201; the row has currency = the default and is returned by GET /orders/{id} on both releases

## Expected Result
- 201; the row has currency = the default and is returned by GET /orders/{id} on both releases

## Data
- Migration 0042 (order currency) from the dev handoff § Interfaces changed
