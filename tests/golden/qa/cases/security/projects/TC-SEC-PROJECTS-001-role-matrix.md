# TC-SEC-PROJECTS-001 — [Projects · API] DELETE /projects/{id} — each role calls each project operation → the role matrix status
**Feature:** demo  **Plan:** qa/plans/demo/2026-10-01-test-plan.md
**Type:** security  **Module:** projects  **Priority:** P0
**Platform:** api
**AC:** —
**Tags:** @security @projects @P0 @platform:api @regression @req:demo/REQ-002

## Grounding
- standard: OWASP API Security Top 10 2023 API1 (BOLA), API5 (BFLA)
- code: api:tests/demo-app/openapi.yaml#deleteProject @ 0214e8c

## Objective
Every role, non-member, anonymous and CSRF-less caller gets exactly the documented status per project operation.

## Technique
- decision-table → authz, negative

## Isolation
- creates: projects named by the run (factory)
- cleans: every created project is deleted in teardown
- actor: Owner, or a pool account per worker
- lock: none

## OWASP ref
- A01

## Authorization
- Target: the demo app — surface: /api/projects
- Environment: golden
- Scope: own application only

## Preconditions
- The demo app is running and the setup project signed every actor in

## Steps
1. Action: Call each operation of the matrix as each caller
   Expected: the status of that matrix cell; a non-member gets 404, never 403

## Expected Result
- The status of that matrix cell; a non-member gets 404, never 403.

## Data
- none
