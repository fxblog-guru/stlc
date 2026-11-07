# TC-E2E-PROJECTS-001 — [Projects · Web] New project dialog — Owner creates a project → listed with role owner
**Feature:** demo  **Plan:** qa/plans/demo/2026-10-01-test-plan.md
**Type:** e2e  **Module:** projects  **Priority:** P0
**Platform:** web
**AC:** —
**Tags:** @e2e @projects @P0 @platform:web @smoke @req:demo/REQ-001

## Grounding
- code: api:tests/demo-app/openapi.yaml#createProject @ 0214e8c

## Objective
The Owner creates a project from the Projects screen and sees it listed with the Owner role.

## Technique
- use-case → journey, positive

## Isolation
- creates: projects named by the run (factory)
- cleans: every created project is deleted in teardown
- actor: Owner, or a pool account per worker
- lock: none

## Preconditions
- The demo app is running and the setup project signed every actor in

## Steps
1. Action: Open Projects
   Expected: the Projects table is visible
2. Action: Create a project with a name and a description
   Expected: the dialog closes
3. Action: Read the list
   Expected: a row with the name shows role owner
4. Action: Open the project
   Expected: the detail page shows the name as its heading

## Expected Result
- The detail page shows the name as its heading.

## Data
- none
