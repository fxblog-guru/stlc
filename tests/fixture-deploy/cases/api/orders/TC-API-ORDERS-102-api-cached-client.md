# TC-API-ORDERS-102 — [Orders · API] listOrders — Cached previous frontend bundle lists orders on the new API → 200, no unknown-field error
**Feature:** orders  **Plan:** qa/plans/orders/2026-09-01-test-plan.md
**Type:** api  **Module:** orders  **Priority:** P1
**Platform:** api
**AC:** —
**Tags:** @api @orders @P1 @platform:api @req:orders/REQ-001 @agentic:gen
**Deploy check:** api-cached-client

## Grounding
- BR-001 — wiki/compiled/business-rules/br-001-order-needs-a-line.md

## Objective
The api-cached-client deploy check holds for migration 0042 (order currency).

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
1. Action: replay the cached bundle calls to GET /orders
   Expected: 200; the bundle renders the list with no 4xx

## Expected Result
- 200; the bundle renders the list with no 4xx

## Data
- Migration 0042 (order currency) from the dev handoff § Interfaces changed
