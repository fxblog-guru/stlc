# TC-API-PROJECTS-003 — [Projects · API] model projects + memberships — Owner runs random action sequences → every invariant holds at each step
**Feature:** demo  **Plan:** qa/plans/demo/2026-10-01-test-plan.md
**Type:** api  **Module:** projects  **Priority:** P1
**Platform:** api
**AC:** —
**Tags:** @api @projects @P1 @platform:api @req:demo/REQ-002

## Grounding
- code: api:tests/demo-app/openapi.yaml#setMember @ 0214e8c
- code: api:tests/demo-app/openapi.yaml#removeMember @ 0214e8c

## Objective
No sequence of project and membership actions breaks the invariants of the projects + memberships model.

## Technique
- state-transition → positive, negative, authz

## Isolation
- creates: up to 3 projects per sequence (named by the run), memberships for this worker's two pool accounts
- cleans: every created project is deleted in teardown (cleanup ledger)
- actor: named `owner`; the worker's first two pool accounts as granted members
- lock: none

## Preconditions
- The demo app is running and the setup project signed every actor in

## Steps
1. Action: Run QA_MODEL_RUNS seeded sequences of up to QA_MODEL_STEPS actions drawn from ## Model, checking every invariant after each step
   Expected: no postcondition or invariant fails; a failure prints the minimal failing sequence and the seed
2. Action: Read the action coverage of the run
   Expected: every action of the model ran at least once

## Model
- State: projects (id, name, deleted) · per project: account → role
- Actions (pre → call → model update):
  - create (fewer than 3 live) → POST /projects 201, member_count 0 → add
  - grant (a live project) → PUT /projects/{id}/members/{acct} 200 → set role
  - revoke (a project with members) → DELETE /projects/{id}/members/{acct} 204 → remove
  - rename (a live project) → PATCH name 200 → new name
  - renameToTakenName (two live projects) → PATCH to the other's name in upper case 409 → no change
  - delete (a live project) → DELETE /projects/{id} 204 → mark deleted
- Invariants (after every step, against the API):
  - member_count equals the members granted
  - a viewer cannot PATCH (403)
  - a deleted project is 404 for everyone (Owner and every pool account)
  - names are unique ignoring case
- Budget: QA_MODEL_RUNS (default 5) × QA_MODEL_STEPS (default 15), seed QA_MODEL_SEED (default 1), shrink ≤ 40 replays
- Model code: scripts/shared/model/projects.model.ts

## Expected Result
- Every invariant holds after every step of every sequence.

## Data
- names from uniqueName('model') / uniqueName('model-renamed')
- accounts: pool[0], pool[1] (this worker's slice)
