# TC-INT-ORDERS-106 — [Orders · API] migrateOrderCurrency — Operator restores the snapshot on staging → schema equals the pre-change dump
**Feature:** orders  **Plan:** qa/plans/orders/2026-09-01-test-plan.md
**Type:** integration  **Module:** orders  **Priority:** P1
**Platform:** api
**AC:** —
**Tags:** @integration @orders @P1 @platform:api @req:orders/REQ-001 @agentic:gen
**Deploy check:** rollback-restore

## Grounding
- BR-001 — wiki/compiled/business-rules/br-001-order-needs-a-line.md

## Objective
The rollback-restore deploy check holds for migration 0042 (order currency).

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
1. Action: restore snapshot orders-pre-0042 on staging; dump the schema
   Expected: the dump equals the pre-change dump; restore time recorded in the run folder

## Expected Result
- the dump equals the pre-change dump; restore time recorded in the run folder

## Data
- Migration 0042 (order currency) from the dev handoff § Interfaces changed
