# TC-API-PROJECTS-002 — [Projects · API] POST /projects — Owner sends names at and past each limit → 201 inside the limits, 400/422 outside
**Feature:** demo  **Plan:** qa/plans/demo/2026-10-01-test-plan.md
**Type:** api  **Module:** projects  **Priority:** P1
**Platform:** api
**AC:** —
**Tags:** @api @projects @P1 @platform:api @req:demo/REQ-001

## Grounding
- code: api:tests/demo-app/openapi.yaml#createProject @ 0214e8c

## Objective
POST /projects refuses each invalid body with the documented error and accepts the length boundaries.

## Technique
- BVA → boundary, negative
- EP → negative, error-contract
- error-guessing → negative

## Isolation
- creates: projects named by the run (factory)
- cleans: every created project is deleted in teardown
- actor: Owner, or a pool account per worker
- lock: none

## Preconditions
- The demo app is running and the setup project signed every actor in

## Steps
1. Action: POST /projects as the Owner with each Variants row
   Expected: the status and error field/code of that row

## Variants
| Row | Technique | Input | Expected |
|---|---|---|---|
| a | BVA | name length 0 | 422 field name, code length |
| b | BVA | name length 1 | 201 |
| c | BVA | name length 80 | 201 |
| d | BVA | name length 81 | 422 field name, code length |
| e | EP | name missing | 422 field name, code required |
| f | EP | name is a number | 422 field name, code required |
| g | EP | unknown property | 422 field color, code unknown |
| h | error-guessing | body is an array | 400 |

## Expected Result
- The status and error field/code of that row.

## Data
- none
