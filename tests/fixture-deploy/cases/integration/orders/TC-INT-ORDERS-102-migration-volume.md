# TC-INT-ORDERS-102 — [Orders · API] migrateOrderCurrency — Operator migrates a 2M-row copy → done < 120 s, lock < 2 s
**Feature:** orders  **Plan:** qa/plans/orders/2026-09-01-test-plan.md
**Type:** integration  **Module:** orders  **Priority:** P1
**Platform:** api
**AC:** —
**Tags:** @integration @orders @P1 @platform:api @req:orders/REQ-001 @agentic:gen
**Deploy check:** migration-volume

## Grounding
- BR-001 — wiki/compiled/business-rules/br-001-order-needs-a-line.md

## Objective
The migration-volume deploy check holds for migration 0042 (order currency).

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
1. Action: seed the copy to 2,000,000 orders rows; run 0042 up while a reader polls GET /orders
   Expected: duration < 120 s; longest ACCESS EXCLUSIVE lock on orders < 2 s; no reader timeout

## Expected Result
- duration < 120 s; longest ACCESS EXCLUSIVE lock on orders < 2 s; no reader timeout

## Data
- Migration 0042 (order currency) from the dev handoff § Interfaces changed
