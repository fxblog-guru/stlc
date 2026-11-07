# TC-INT-ORDERS-111 — [Orders · API] backfillOrderCurrency — Operator runs the backfill twice → checksums equal after each run
**Feature:** orders  **Plan:** qa/plans/orders/2026-09-01-test-plan.md
**Type:** integration  **Module:** orders  **Priority:** P1
**Platform:** api
**AC:** —
**Tags:** @integration @orders @P1 @platform:api @req:orders/REQ-001 @agentic:gen
**Deploy check:** migration-idempotent

## Grounding
- BR-001 — wiki/compiled/business-rules/br-001-order-needs-a-line.md

## Objective
The migration-idempotent deploy check holds for migration 0042 (order currency).

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
1. Action: run the backfill, checksum orders; run it again, checksum orders
   Expected: the two checksums are equal

## Expected Result
- the two checksums are equal

## Data
- Migration 0042 (order currency) from the dev handoff § Interfaces changed
