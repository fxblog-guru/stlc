# TC-INT-ORDERS-113 — [Orders · API] backfillOrderCurrency — Operator restores the backup after new writes → post-backup rows replayed once
**Feature:** orders  **Plan:** qa/plans/orders/2026-09-01-test-plan.md
**Type:** integration  **Module:** orders  **Priority:** P1
**Platform:** api
**AC:** —
**Tags:** @integration @orders @P1 @platform:api @req:orders/REQ-001 @agentic:gen
**Deploy check:** rollback-data

## Grounding
- BR-001 — wiki/compiled/business-rules/br-001-order-needs-a-line.md

## Objective
The rollback-data deploy check holds for migration 0042 (order currency).

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
1. Action: write 10 orders after the backup; restore it; replay the post-backup writes as the plan says
   Expected: the 10 rows are detected, replayed once, and their count is reported

## Expected Result
- the 10 rows are detected, replayed once, and their count is reported

## Data
- Migration 0042 (order currency) from the dev handoff § Interfaces changed
