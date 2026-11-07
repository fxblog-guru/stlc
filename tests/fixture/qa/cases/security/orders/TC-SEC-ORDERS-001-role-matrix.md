# TC-SEC-ORDERS-001 — [Orders · API] GET /admin/orders — Readonly user calls an admin endpoint → 403 forbidden, no order data
**Feature:** orders  **Plan:** qa/plans/orders/2026-09-01-test-plan.md
**Type:** security  **Module:** orders  **Priority:** P0
**Platform:** api
**AC:** —
**Tags:** @security @orders @P0 @platform:api @req:REQ-003 @agentic:gen

## Grounding
- ticket: PROJ-1234 § Acceptance criteria

## Objective
A read-only user is refused every order-administration endpoint.

## Technique
- decision-table → authz, negative

## Isolation
- creates: nothing
- cleans: nothing
- actor: pool `readonly`
- lock: none

## OWASP ref
- A01

## Authorization
- Target: Example app — surface: /orders API
- Environment: uat
- Scope: own application only

## Preconditions
- Signed in as a `readonly` pool user

## Steps
1. Action: GET /admin/orders as readonly
   Expected: 403; body = { code: "forbidden" }; no order data in the body

## Expected Result
- Every admin call by the readonly role answers 403 and leaks no order field.

## Data
- none
