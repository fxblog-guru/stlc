# TC-INT-ORDERS-105 — [Orders · API] createOrder — Operator redeploys the previous build on the migrated database → readiness 200, smoke green
**Feature:** orders  **Plan:** qa/plans/orders/2026-09-01-test-plan.md
**Type:** integration  **Module:** orders  **Priority:** P1
**Platform:** api
**AC:** —
**Tags:** @integration @orders @P1 @platform:api @req:orders/REQ-001 @agentic:gen
**Deploy check:** rollback-redeploy

## Grounding
- BR-001 — wiki/compiled/business-rules/br-001-order-needs-a-line.md

## Objective
The rollback-redeploy deploy check holds for migration 0042 (order currency).

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
1. Action: migrate the copy, deploy the previous build, run its smoke
   Expected: GET /ready = 200; every smoke case passes

## Expected Result
- GET /ready = 200; every smoke case passes

## Data
- Migration 0042 (order currency) from the dev handoff § Interfaces changed
