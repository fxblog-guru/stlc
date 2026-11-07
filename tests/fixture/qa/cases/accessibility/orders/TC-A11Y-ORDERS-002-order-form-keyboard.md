# TC-A11Y-ORDERS-002 — [Orders · Web] New order form — Keyboard user tabs through every control → focus follows visual order, always visible
**Feature:** orders  **Plan:** qa/plans/orders/2026-09-01-test-plan.md
**Type:** accessibility  **Module:** orders  **Priority:** P2
**Platform:** web
**AC:** —
**Tags:** @accessibility @orders @P2 @platform:web @manual @req:REQ-005 @agentic:gen

## Grounding
- standard: WCAG 2.2 AA

## Objective
Every control of the New Order form is reachable and operable by keyboard with a visible focus.

## Technique
- checklist

## Isolation
- creates: nothing (the form is not submitted)
- cleans: nothing
- actor: pool `standard`
- lock: none

## WCAG ref
- WCAG 2.2 AA — 2.1.1, 2.4.7

## Scope
- Screen: /orders/new · viewport 1280×800 · manual

## Preconditions
- Signed in as a `standard` pool user

## Steps
1. Action: Tab through the form
   Expected: focus order follows the visual order, focus visible
## Expected Result
- Every control receives focus in visual order with a visible indicator.
## Data
- none
