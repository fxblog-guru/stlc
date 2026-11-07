# TC-API-FUZZ-001 — [Fuzz · API] every OpenAPI operation — each actor sends schema-derived hostile inputs → no 5xx, no undocumented response
**Feature:** demo  **Plan:** qa/plans/demo/2026-10-01-test-plan.md
**Type:** api  **Module:** fuzz  **Priority:** P1
**Platform:** api
**AC:** —
**Tags:** @api @fuzz @P1 @platform:api @regression @req:demo/REQ-001

## Grounding
- code: api:tests/demo-app/openapi.yaml#paths @ 0214e8c

## Objective
Every allowed operation of the OpenAPI document answers every schema-derived hostile input with a documented, schema-valid, leak-free response and never a 5xx.

## Technique
- BVA → boundary, negative
- EP → negative, error-contract
- error-guessing → negative, error-contract

## Isolation
- creates: one parent project per operation that needs a path id (factory), plus anything a lenient create accepts
- cleans: the factory's projects and every 2xx-created entity, through the cleanup ledger
- actor: named `owner`, and `anonymous`
- lock: projects:short-name (minLength rows create 1-character names that cannot carry the run prefix)

## Preconditions
- The demo app is running and the setup project signed every actor in
- OPENAPI_SPEC points at the document the app serves

## Steps
1. Action: As the row's actor, for each allowed operation send every generated input (boundaries, enum outsiders, wrong types, null, missing required, extra properties, huge and unicode/zero-width strings, malformed JSON, wrong content-type, unknown and malformed path ids), at most QA_FUZZ_MAX per operation, from seed QA_FUZZ_SEED
   Expected: no response is 5xx; every status is documented for its operation; every 4xx body validates against the Problem schema; every 2xx body validates against its response schema with no undeclared properties; no body carries a stack frame, source path or internal field

## Variants
| Row | Technique | Input | Expected |
|---|---|---|---|
| owner | BVA, EP, error-guessing | the generated inputs, sent as the Owner | zero findings (4xx/2xx documented and schema-valid, no 5xx, no leak) |
| anonymous | EP, error-guessing | the generated inputs, sent with no session | zero findings (secured operations answer the documented 401) |

## Expected Result
- Zero findings; a finding prints the seed, the operation, the input label and the exact request.

## Data
- fuzz-allow: *
- fuzz-deny: signIn (anonymous by design; covered by the auth setup), getMe (no input surface)
- seed: QA_FUZZ_SEED (default 1; `random` draws one and prints it) · budget: QA_FUZZ_MAX per operation per actor (default 60)
- path ids: `projectId` → a fresh project from the projects factory; `accountId` → the second pool account's id
- source: docs/openapi.yaml (OPENAPI_SPEC) — every operation, request schema and documented response
