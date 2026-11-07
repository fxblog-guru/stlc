# TC-INT-ORDERS-114 — [Orders · API] getOrder — Previous release reads orders the backfill transformed → 200 with the stored currency
**Feature:** orders  **Plan:** qa/plans/orders/2026-09-01-test-plan.md
**Type:** integration  **Module:** orders  **Priority:** P1
**Platform:** api
**AC:** —
**Tags:** @integration @orders @P1 @platform:api @req:orders/REQ-001 @agentic:gen
**Deploy check:** n-1-data

## Grounding
- BR-001 — wiki/compiled/business-rules/br-001-order-needs-a-line.md

## Objective
The n-1-data deploy check holds for migration 0042 (order currency).

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
1. Action: deploy the previous build against the backfilled copy; GET /orders/{id} for a transformed row
   Expected: 200; currency shown as stored; a row it writes is read by the new build

## Expected Result
- 200; currency shown as stored; a row it writes is read by the new build

## Data
- Migration 0042 (order currency) from the dev handoff § Interfaces changed
