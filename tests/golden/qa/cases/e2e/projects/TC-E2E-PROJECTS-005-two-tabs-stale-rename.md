# TC-E2E-PROJECTS-005 — [Projects · Web] Project page, two tabs — Owner saves a rename from a stale tab → conflict shown, first rename kept
**Feature:** demo  **Plan:** qa/plans/demo/2026-10-01-test-plan.md
**Type:** e2e  **Module:** projects  **Priority:** P1
**Platform:** web
**AC:** —
**Tags:** @e2e @projects @P1 @platform:web @req:demo/REQ-001

## Grounding
- code: api:tests/demo-app/openapi.yaml#updateProject @ 0214e8c

## Objective
A rename saved from a tab that shows an older version of the project is refused with a conflict message instead of overwriting the newer rename.

## Technique
- error-guessing → negative
- state-transition → negative

## UI risk classes
- two tabs editing the same record (stale write, conflict message)

## Isolation
- creates: one project (factory)
- cleans: the project is deleted in teardown
- actor: named `owner`, two tabs of one browser context
- lock: none

## Preconditions
- The demo app is running and the setup project signed every actor in
- A project created by the factory

## Steps
1. Action: Open the project's page in tab A and in tab B
   Expected: both tabs show the project's name as the heading
2. Action: In tab A, type a new name in "New name" and click "Save"
   Expected: tab A shows "Saved." and the new name as the heading
3. Action: In tab B (still showing the old version), type a different name in "New name" and click "Save"
   Expected: tab B shows "Someone else changed this project. Reload to see their changes." and keeps the old heading
4. Action: Read the project over the API
   Expected: the name is tab A's name

## Expected Result
- Tab B's save is refused with the conflict message; tab A's rename is what the product holds.

## Data
- names from uniqueName('tab-a') / uniqueName('tab-b')
- concurrency contract: GET /projects/{id} returns an ETag; PATCH with a stale If-Match answers 409 `stale` (docs/openapi.yaml updateProject)
