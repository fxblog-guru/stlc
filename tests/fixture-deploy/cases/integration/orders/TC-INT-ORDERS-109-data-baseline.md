# TC-INT-ORDERS-109 — [Orders · API] migrateOrderCurrency — Operator records the orders baseline → counts, checksums recorded
**Feature:** orders  **Plan:** qa/plans/orders/2026-09-01-test-plan.md
**Type:** integration  **Module:** orders  **Priority:** P1
**Platform:** api
**AC:** —
**Tags:** @integration @orders @P1 @platform:api @req:orders/REQ-001 @agentic:gen
**Deploy check:** data-baseline

## Grounding
- BR-001 — wiki/compiled/business-rules/br-001-order-needs-a-line.md

## Objective
The data-baseline deploy check holds for migration 0042 (order currency).

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
1. Action: record counts, checksums and the 3 sample queries on orders and order_lines
   Expected: baseline.json in the run folder holds 2 counts, 2 checksums and 3 results

## Expected Result
- baseline.json in the run folder holds 2 counts, 2 checksums and 3 results

## Data
- Migration 0042 (order currency) from the dev handoff § Interfaces changed
