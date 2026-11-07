# TC-E2E-PROJECTS-006 — [Projects · Web] New project dialog — Owner double-clicks Create → exactly one project created
**Feature:** demo  **Plan:** qa/plans/demo/2026-10-01-test-plan.md
**Type:** e2e  **Module:** projects  **Priority:** P1
**Platform:** web
**AC:** —
**Tags:** @e2e @projects @P1 @platform:web @req:demo/REQ-001

## Grounding
- code: api:tests/demo-app/openapi.yaml#createProject @ 0214e8c

## Objective
A double-click on Create sends one create request and leaves exactly one project with the typed name.

## Technique
- error-guessing → negative

## UI risk classes
- double-submit / rapid clicks

## Isolation
- creates: one project named by the run
- cleans: every project carrying the name is deleted in teardown
- actor: named `owner`
- lock: none

## Preconditions
- The demo app is running and the setup project signed every actor in

## Steps
1. Action: Open Projects, click "New project" and type a unique name in "Name"
   Expected: the "Create" button is enabled
2. Action: Double-click "Create"
   Expected: the list shows exactly one row with the name
3. Action: Count the POST /api/projects requests the page sent
   Expected: exactly 1
4. Action: Search the API for the name
   Expected: total = 1

## Expected Result
- One request, one project — whatever the user's click rate.

## Data
- name from uniqueName('double-submit')
- the Create button is disabled while its request is pending (the dialog's contract)
