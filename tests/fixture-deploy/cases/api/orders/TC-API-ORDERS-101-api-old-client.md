# TC-API-ORDERS-101 — [Orders · API] createOrder — Previous client posts the old request shape → 201, every old response field present
**Feature:** orders  **Plan:** qa/plans/orders/2026-09-01-test-plan.md
**Type:** api  **Module:** orders  **Priority:** P1
**Platform:** api
**AC:** —
**Tags:** @api @orders @P1 @platform:api @req:orders/REQ-001 @agentic:gen
**Deploy check:** api-old-client

## Grounding
- BR-001 — wiki/compiled/business-rules/br-001-order-needs-a-line.md

## Objective
The api-old-client deploy check holds for migration 0042 (order currency).

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
1. Action: POST /orders with the 2026.10 request body; validate the response against the 2026.10 schema
   Expected: 201; every 2026.10 response field present with the same name and type

## Expected Result
- 201; every 2026.10 response field present with the same name and type

## Data
- Migration 0042 (order currency) from the dev handoff § Interfaces changed
