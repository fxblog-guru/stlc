# TC-E2E-PROJECTS-004 — [Projects · Web] Projects list — Owner opens the list → heading, New project button, three columns
**Feature:** demo  **Plan:** qa/plans/demo/2026-10-01-test-plan.md
**Type:** e2e  **Module:** projects  **Priority:** P2
**Platform:** web
**AC:** —
**Tags:** @e2e @projects @P2 @platform:web @regression @req:demo/REQ-001

## Grounding
- code: api:tests/demo-app/openapi.yaml#listProjects @ 0214e8c

## Objective
The Projects screen keeps its heading, actions and table columns.

## Technique
- checklist

## Isolation
- creates: projects named by the run (factory)
- cleans: every created project is deleted in teardown
- actor: Owner, or a pool account per worker
- lock: none

## Preconditions
- The demo app is running and the setup project signed every actor in

## Steps
1. Action: Open Projects with one project present
   Expected: the aria snapshot lists the heading, the New project button and the columns Name, Your role, Members

## Expected Result
- The aria snapshot lists the heading, the New project button and the columns Name, Your role, Members.

## Data
- none
