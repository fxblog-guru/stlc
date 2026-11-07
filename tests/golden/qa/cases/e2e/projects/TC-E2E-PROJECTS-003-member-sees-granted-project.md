# TC-E2E-PROJECTS-003 — [Projects · Web] Projects list — Member opens the list after a grant → project listed with role member
**Feature:** demo  **Plan:** qa/plans/demo/2026-10-01-test-plan.md
**Type:** e2e  **Module:** projects  **Priority:** P1
**Platform:** web
**AC:** —
**Tags:** @e2e @projects @P1 @platform:web @regression @req:demo/REQ-002

## Grounding
- code: api:tests/demo-app/openapi.yaml#setMember @ 0214e8c
- code: api:tests/demo-app/openapi.yaml#listProjects @ 0214e8c

## Objective
A pool account granted the member role on a project sees it listed with that role and cannot create projects.

## Technique
- use-case → journey, positive, authz

## Isolation
- creates: projects named by the run (factory)
- cleans: every created project is deleted in teardown
- actor: Owner, or a pool account per worker
- lock: none

## Preconditions
- The demo app is running and the setup project signed every actor in

## Steps
1. Action: The member opens Projects
   Expected: the Projects table is visible
2. Action: Read the granted project's row
   Expected: the row shows role member
3. Action: Look for the New project button
   Expected: it is not present

## Expected Result
- It is not present.

## Data
- none
