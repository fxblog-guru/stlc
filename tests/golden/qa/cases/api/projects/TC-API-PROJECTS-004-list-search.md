# TC-API-PROJECTS-004 — [Projects · API] GET /projects — Owner searches by name → 200, only the matching project
**Feature:** demo  **Plan:** qa/plans/demo/2026-10-01-test-plan.md
**Type:** api  **Module:** projects  **Priority:** P2
**Platform:** api
**AC:** —
**Tags:** @api @projects @P2 @platform:api @req:demo/REQ-001

## Grounding
- code: api:tests/demo-app/openapi.yaml#listProjects @ 0214e8c

## Objective
A name search returns exactly the matching project, and the server logs no error while answering it.

## Technique
- EP → positive

## Isolation
- creates: one project (factory)
- cleans: the project is deleted in teardown
- actor: named `owner`
- lock: none

## Preconditions
- The demo app is running and the setup project signed every actor in
- When QA_SERVER_LOG or QA_SERVER_LOG_CMD is set, the serverWatch fixture reads the server log for this test

## Steps
1. Action: GET /projects?q=<the project's name> as the Owner
   Expected: 200; the body validates against listProjects 200; items = exactly the created project; no server log line written during the test matches QA_SERVER_LOG_FAIL (serverWatch)

## Expected Result
- 200 with the one matching project, and a clean server log.

## Data
- name from the projects factory
- server oracle: QA_SERVER_LOG_FAIL default `panic|fatal|level=ERROR|"level":"error"|Traceback|Unhandled`
