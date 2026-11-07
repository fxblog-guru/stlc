# TC-API-PROJECTS-001 — [Projects · API] POST /projects — Owner creates a project → 201 and it reads back
**Feature:** demo  **Plan:** qa/plans/demo/2026-10-01-test-plan.md
**Type:** api  **Module:** projects  **Priority:** P0
**Platform:** api
**AC:** —
**Tags:** @api @projects @P0 @platform:api @smoke @req:demo/REQ-001

## Grounding
- code: api:tests/demo-app/openapi.yaml#createProject @ 0214e8c
- code: api:tests/demo-app/openapi.yaml#getProject @ 0214e8c
- code: api:tests/demo-app/openapi.yaml#deleteProject @ 0214e8c

## Objective
An Owner creates a project over the API, reads it back by id, finds it in the list and deletes it.

## Technique
- EP → positive
- use-case → journey

## Isolation
- creates: projects named by the run (factory)
- cleans: every created project is deleted in teardown
- actor: Owner, or a pool account per worker
- lock: none

## Preconditions
- The demo app is running and the setup project signed every actor in

## Steps
1. Action: POST /projects as the Owner with a run-unique name
   Expected: 201; body matches createProject with my_role owner and member_count 0
2. Action: GET /projects/{id}
   Expected: 200; body equals the created project
3. Action: GET /projects?q=<name>
   Expected: 200; items holds exactly the created id
4. Action: DELETE /projects/{id}, then GET it
   Expected: 204, then 404

## Expected Result
- 204, then 404.

## Data
- none
