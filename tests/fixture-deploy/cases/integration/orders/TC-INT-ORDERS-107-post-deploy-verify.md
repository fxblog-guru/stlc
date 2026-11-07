# TC-INT-ORDERS-107 — [Orders · API] createOrder — Operator probes the app after migrate and after rollout → ready 200, migration version 0042
**Feature:** orders  **Plan:** qa/plans/orders/2026-09-01-test-plan.md
**Type:** integration  **Module:** orders  **Priority:** P1
**Platform:** api
**AC:** —
**Tags:** @integration @orders @P1 @platform:api @req:orders/REQ-001 @agentic:gen
**Deploy check:** post-deploy-verify

## Grounding
- BR-001 — wiki/compiled/business-rules/br-001-order-needs-a-line.md

## Objective
The post-deploy-verify deploy check holds for migration 0042 (order currency).

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
1. Action: GET /ready after the migration, again after the code goes out; read the schema version
   Expected: both probes 200; schema version = 0042; the slug smoke passes

## Expected Result
- both probes 200; schema version = 0042; the slug smoke passes

## Data
- Migration 0042 (order currency) from the dev handoff § Interfaces changed
