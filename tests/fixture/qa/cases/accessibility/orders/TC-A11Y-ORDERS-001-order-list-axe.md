# TC-A11Y-ORDERS-001 — [Orders · Web] Orders list — Standard user opens the list and its empty state → 0 critical or serious axe violations
**Feature:** orders  **Plan:** qa/plans/orders/2026-09-01-test-plan.md
**Type:** accessibility  **Module:** orders  **Priority:** P1
**Platform:** web
**AC:** —
**Tags:** @accessibility @orders @P1 @platform:web @req:REQ-005 @agentic:gen

## Grounding
- standard: WCAG 2.2 AA

## Objective
The order list and its empty state have no critical or serious axe violations at WCAG 2.2 AA.

## Technique
- checklist

## Isolation
- creates: nothing
- cleans: nothing
- actor: pool `standard`
- lock: none

## WCAG ref
- WCAG 2.2 AA — 1.4.3, 4.1.2

## Scope
- Screen: /orders (list, empty state) · viewport 1280×800 · automated

## Preconditions
- Signed in as a `standard` pool user

## Steps
1. Action: open /orders, run axe
   Expected: 0 critical/serious violations
## Expected Result
- axe reports 0 critical and 0 serious violations in both states.
## Data
- none
