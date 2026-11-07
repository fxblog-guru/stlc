# TC-INT-PROJECTS-001 — [Projects · API] PUT /projects/{id}/members/{accountId} — Owner grants viewer → list and detail show viewer
**Feature:** demo  **Plan:** qa/plans/demo/2026-10-01-test-plan.md
**Type:** integration  **Module:** projects  **Priority:** P1
**Platform:** api
**AC:** —
**Tags:** @integration @projects @P1 @platform:api @req:demo/REQ-002

## Grounding
- code: api:tests/demo-app/openapi.yaml#setMember @ 0214e8c
- code: api:tests/demo-app/openapi.yaml#getProject @ 0214e8c

## Objective
A role the Owner grants is returned by the list call, the detail call and the membership store alike.

## Technique
- EP → positive

## Isolation
- creates: projects named by the run (factory)
- cleans: every created project is deleted in teardown
- actor: Owner, or a pool account per worker
- lock: none

## Preconditions
- The demo app is running and the setup project signed every actor in

## Steps
1. Action: The Owner grants a pool account viewer on a new project; the member lists projects
   Expected: the item shows my_role viewer and member_count 1
2. Action: The member reads the project
   Expected: my_role viewer
3. Action: Read the membership row
   Expected: role viewer

## Expected Result
- Role viewer.

## Data
- none
