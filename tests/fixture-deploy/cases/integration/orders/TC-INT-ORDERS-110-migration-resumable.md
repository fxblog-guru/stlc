# TC-INT-ORDERS-110 — [Orders · API] backfillOrderCurrency — Operator kills the backfill midway and reruns it → no duplicate rows, no gaps
**Feature:** orders  **Plan:** qa/plans/orders/2026-09-01-test-plan.md
**Type:** integration  **Module:** orders  **Priority:** P1
**Platform:** api
**AC:** —
**Tags:** @integration @orders @P1 @platform:api @req:orders/REQ-001 @agentic:gen
**Deploy check:** migration-resumable

## Grounding
- BR-001 — wiki/compiled/business-rules/br-001-order-needs-a-line.md

## Objective
The migration-resumable deploy check holds for migration 0042 (order currency).

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
1. Action: start the batched backfill on the volume copy; kill it after batch 5; rerun it
   Expected: row count and key range equal a clean run; 0 duplicate keys

## Expected Result
- row count and key range equal a clean run; 0 duplicate keys

## Data
- Migration 0042 (order currency) from the dev handoff § Interfaces changed
