# TC-INT-ORDERS-103 — [Orders · API] migrateOrderCurrency — Operator inspects orders after the migration → no NULL currency, constraints valid
**Feature:** orders  **Plan:** qa/plans/orders/2026-09-01-test-plan.md
**Type:** integration  **Module:** orders  **Priority:** P1
**Platform:** api
**AC:** —
**Tags:** @integration @orders @P1 @platform:api @req:orders/REQ-001 @agentic:gen
**Deploy check:** migration-integrity

## Grounding
- BR-001 — wiki/compiled/business-rules/br-001-order-needs-a-line.md

## Objective
The migration-integrity deploy check holds for migration 0042 (order currency).

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
1. Action: count orders rows; count rows where currency is null; list constraints marked not valid
   Expected: count = the pre-migration count; 0 NULL rows; 0 constraints not valid

## Expected Result
- count = the pre-migration count; 0 NULL rows; 0 constraints not valid

## Data
- Migration 0042 (order currency) from the dev handoff § Interfaces changed
