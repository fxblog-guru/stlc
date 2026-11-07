# TC-API-ORDERS-103 — [Orders · API] listOrders — Previous client calls the deprecated v1 path → 200 with a Deprecation header
**Feature:** orders  **Plan:** qa/plans/orders/2026-09-01-test-plan.md
**Type:** api  **Module:** orders  **Priority:** P1
**Platform:** api
**AC:** —
**Tags:** @api @orders @P1 @platform:api @req:orders/REQ-001 @agentic:gen
**Deploy check:** api-versioning

## Grounding
- BR-001 — wiki/compiled/business-rules/br-001-order-needs-a-line.md

## Objective
The api-versioning deploy check holds for migration 0042 (order currency).

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
1. Action: GET /v1/orders
   Expected: 200; old schema; Deprecation and Sunset headers present

## Expected Result
- 200; old schema; Deprecation and Sunset headers present

## Data
- Migration 0042 (order currency) from the dev handoff § Interfaces changed
