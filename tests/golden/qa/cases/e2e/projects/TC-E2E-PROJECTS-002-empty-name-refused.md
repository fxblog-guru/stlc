# TC-E2E-PROJECTS-002 — [Projects · Web] New project dialog — Owner submits an empty name → "Name is required", field focused
**Feature:** demo  **Plan:** qa/plans/demo/2026-10-01-test-plan.md
**Type:** e2e  **Module:** projects  **Priority:** P1
**Platform:** web
**AC:** —
**Tags:** @e2e @projects @P1 @platform:web @req:demo/REQ-001

## Grounding
- code: api:tests/demo-app/openapi.yaml#createProject @ 0214e8c

## Objective
Submitting the New project dialog with an empty name is refused with an accessible error.

## Technique
- error-guessing → negative

## Isolation
- creates: projects named by the run (factory)
- cleans: every created project is deleted in teardown
- actor: Owner, or a pool account per worker
- lock: none

## Preconditions
- The demo app is running and the setup project signed every actor in

## Steps
1. Action: Open Projects and submit the New project dialog with an empty name
   Expected: error text "Name is required (1 to 80 characters)."; the Name field has aria-invalid true and keeps focus

## Expected Result
- Error text "Name is required (1 to 80 characters)."; the Name field has aria-invalid true and keeps focus.

## Data
- none
