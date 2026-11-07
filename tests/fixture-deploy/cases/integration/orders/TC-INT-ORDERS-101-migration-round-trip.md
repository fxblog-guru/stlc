# TC-INT-ORDERS-101 — [Orders · API] migrateOrderCurrency — Operator runs up, down, up on a schema copy → schema dump equals the first up
**Feature:** orders  **Plan:** qa/plans/orders/2026-09-01-test-plan.md
**Type:** integration  **Module:** orders  **Priority:** P1
**Platform:** api
**AC:** —
**Tags:** @integration @orders @P1 @platform:api @req:orders/REQ-001 @agentic:gen
**Deploy check:** migration-round-trip

## Grounding
- BR-001 — wiki/compiled/business-rules/br-001-order-needs-a-line.md

## Objective
The migration-round-trip deploy check holds for migration 0042 (order currency).

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
1. Action: apply 0042 up, then down, then up on the copy; dump the schema after each up
   Expected: the two dumps are identical; no migration error

## Expected Result
- the two dumps are identical; no migration error

## Data
- Migration 0042 (order currency) from the dev handoff § Interfaces changed
