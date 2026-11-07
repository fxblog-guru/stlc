---
name: designing-api-cases
description: Use to design API cases from the endpoint inventory and OpenAPI: contract, negatives, authz, endpoint classes (/qa-design --type api).
version: 1.1.0
---

# Designing API Test Cases

> Profile first, by section (`profile.mjs`): it defines `§Project`, `§Application under test`,
> `§Test types`, `§Environments`, `§Quality gates`, `§Domain knowledge`, and `§Test management`.
> The QA root defaults to `<qa-root>/` (profile-overridable).


> **Domain grounding**: when `<qa-root>/wiki/compiled/index.md` exists, resolve every domain term,
> business rule (BR-###), and persona through it — open the index, follow the scoping link, read
> the atomic page WHOLE, cite the page + its `sources:` entry. Wiki silence is a reported gap,
> never a guess. No compiled wiki → the plain `§Domain knowledge` folder.
>
> **Code grounding**: endpoint paths, payload/validation rules, and screen/locator facts the analysis
> does not state resolve through `grounding-in-code` (PROJECT-PROFILE `§Code knowledge` → read-only
> source grep) and are cited `<layer>:<path>#<symbol> @ <short-sha>` in `## Data`. Not resolvable →
> `COVERAGE-GAP`, never a guess.

## Action
Design API-tier test cases for one feature slug — **one file per case** under `<qa-root>/cases/api/<module>/` —
directly from the requirements: the analysis file's **endpoint inventory** plus the **OpenAPI spec** named
in `§Application under test`. Deriving API cases from existing e2e UI cases is a secondary mode (below).
This skill designs cases only; `generating-api-script` turns them into Playwright API-tier specs
(`/qa-script --type api`, run by `test:api`).

## Inputs — resolve before designing (STOP conditions)
1. `<slug>` — the feature slug (argument; else the most recently dated folder under `<qa-root>/plans/`; ask if ambiguous).
2. **Analysis**: latest `<qa-root>/analysis/<slug>/YYYY-MM-DD-analysis.md` — requirement inventory (`REQ-<id>`),
   **endpoint inventory** (method, path, auth, request/response shape), business rules. Missing → STOP: run `/qa-analyze` first.
3. **OpenAPI spec** (path/URL from `§Application under test`) — the contract source for schemas, enums,
   required fields, boundaries. Absent → design from the analysis inventory alone and flag every
   schema-level assumption in the case's `## Data`.
4. **Plan**: latest `<qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md` with its `## Traceability (Requirement ↔ Case)`
   skeleton. Missing → STOP: run `/qa-plan` first.
5. `api` must be enabled in `§Test types` and the plan. Disabled → STOP and report.

---

## Step 1: Screen — is it provable over HTTP?

Walk every in-scope requirement and endpoint behaviour. A behaviour belongs at the API tier **iff its
expected outcome can be proven by an HTTP request/response** (status, body field/shape, server-filtered
set, persisted read-back). Screen out and route:

- **API-provable** — any persistence (create/update/delete/assign/approve — the read-back IS the assertion),
  server-side validation (the API rejects → 4xx + message), server-computed/filtered data, permission-gated
  fetches → design here.
- **UI-only** — rendering/layout/labels, client-side interactions (modal opens), client-side-only validation
  with no request fired, navigation, presentation of already-fetched data → **skip, no case**; it belongs to
  `designing-functional-cases`. List each skip with a one-line reason in the summary.
- **Seam-level** — outcomes only provable in the DB, a second service, or a queue → route to
  `designing-integration-cases`; note it in the summary.

Still ambiguous → treat as API-provable and design it: a thin API case is fixable, a silently-dropped one is invisible.

## Step 2: Classify each surviving group — the scored rubric (single vs flow)

| Signal | Meaning |
|---|---|
| `resourceCount` | distinct resources/endpoint groups the scenario exercises |
| `crossModule` | those resources span ≥2 business modules |
| `stateChain` | ≥2 mutation calls where a later call consumes an earlier call's output |
| `contractFocus` | the point is one endpoint's status/schema/validation behaviour |

- **single** ⟸ `resourceCount ≤ 1` OR `contractFocus` — CRUD/contract of ONE resource.
- **flow** ⟸ `resourceCount ≥ 2 && (crossModule || stateChain)` — a connected ring across resources
  (create customer → create order for that customer → invoice the order → read the ring back).
- Ambiguous → default **single**. Record any override + reason in the case's `## Data` notes.

## Step 3: Design the case set — validation minimums per endpoint (never negotiable)

**single form — per resource, design at minimum:**
1. **CRUD contract case** (one case): happy create (status + returned id + echoed fields) → independent
   GET read-back shows persisted values → update (changed field persisted AND unchanged fields untouched)
   → delete (read-back 404, or the documented soft-delete shape) → idempotent re-PUT/re-DELETE where the contract defines it.
2. **Validation/negative case(s)**: for every request field at least one negative — `null` / missing /
   empty / wrong type (`id="abc"`) / over-boundary. **Boundary rule of 3** per numeric/length rule:
   min−1, exact boundary, max+1. **Enums**: one positive step per valid value (never collapsed into one
   happy path) + one invalid value (`status="unknown"`) + one case-mismatch (`status="AVAILABLE"`).
   Expected = the stated 4xx + the standard error shape (contract validation, not 500).
3. **Authz case — per endpoint, always**: unauthenticated → 401 · expired/malformed token → 401 ·
   forbidden role → 403 · another tenant's/user's id → blocked (IDOR check). Omit an axis only when the
   resource genuinely lacks it — say so in `## Data`, don't silently skip.
4. **Schema/contract steps** (in case 1 or separate): response validates against the OpenAPI schema;
   required keys present and non-null; no leakage fields (`stackTrace`, internal ids); content-type headers.

**flow form — per journey, one case:** each step states its status + the field the NEXT step consumes;
the final step is the **end-state read-back** (every created entity fetched by id, cross-entity links
asserted, e.g. the invoice's `orderId`); final steps clean up created entities in reverse order.

**Every Expected states a concrete status + body claim** — "Expected: 201, body.id non-null,
body.total = 150.00" — never "works" or "is created". An Expected that cannot be made concrete from the
spec/inventory is recorded as `COVERAGE-GAP: <reason>` in `## Data`, never invented.

## Step 3b: Endpoint-class heuristics — the defects CRUD minimums miss (mandatory when the class applies)

Step 3 proves the contract of one resource on one happy request and its negatives. Most API
defects that reach production live elsewhere: page boundaries, ignored filters, a PATCH that nulls
omitted fields, a forbidden state transition the UI hides but the API allows, a double-submit that
charges twice, a job that never terminates, tenant B's rows in tenant A's list, a `500` on a
malformed body. Classify every surviving endpoint with the table in
[`references/api-test-heuristics.md`](references/api-test-heuristics.md) (read it once per session)
and design the class cases it prescribes:

| Endpoint has… | Design (table-driven where rows share a shape) |
|---|---|
| a collection response | **query-matrix case**: empty set · 1 / `pageSize` / `pageSize+1` across pages (union of ids == created set) · page/size edges (`0`, `-1`, `max+1`, non-numeric) · every filter matching/non-matching/**unknown param** · sort keys asc/desc + tie-break stability · search special chars · permission-filtered rows |
| `PATCH` / partial `PUT` | **partial-update case**: omitted field unchanged · `null` clears or `400` · read-only fields rejected/ignored (assert which) · unknown field · empty body · validation still applied · concurrent PATCH of two fields |
| a status/state field or transition verbs | **state-transition matrix case** per state machine: every allowed cell (new status on read-back + side-effect fields) · every forbidden cell (`409`/`422`, state unchanged) · guards as boundary triples · re-applying a transition · terminal states |
| create / charge / anything retried | **idempotency & concurrency case**: same `Idempotency-Key` twice → one entity · key with different body · parallel identical creates → contract outcome, never two successes over a uniqueness rule, never `500` · parallel counter updates consistent |
| `202` / job id / `Location` | **async lifecycle case**: state sequence with schemas · polling window (interval + max) · result-before-complete · failure state carries `error.code` · cancel |
| arrays of items | **bulk case**: per-item results in input order · mixed batch atomicity (all-or-nothing vs `207`) with persisted set == response · empty / `max+1` / duplicates |
| files | **upload/download case**: allowed type/size + byte-identical download · `max+1` → `413` · extension/magic-byte mismatch · path-traversal filenames sanitised · foreign tenant id |
| dates, money, free text, external ids | **rows inside the negative cases** from the reference §8: offset vs `Z`, `2026-02-30`, DST gap; `.005` rounding, 3-dp on 2-dp, `1e2`, string vs number; whitespace-only, emoji length in chars vs bytes, control/zero-width chars (as escape sequences); `"123"` vs `123`, malformed id `400` vs unknown id `404` |
| tenant / account scope | **isolation rows in every authz case + 1 list/report isolation case per module**: foreign id on every route incl. nested · lists/counts exclude the other tenant even with matching filters · foreign FK on create rejected · bulk with mixed ids |
| delete / archive | **rows in the CRUD case (+1 case when cascade/restore is documented)**: hard `404` vs soft `deletedAt` · absent from default lists · second delete · cascade vs `409` restriction · restore |
| any endpoint (once per API) | **error-contract case** (one documented error schema on every `4xx`, stable codes, no leakage, correlation id, malformed JSON → `400`, wrong top-level type, huge payload) and **contract-drift case** (every response validates against the OpenAPI schema incl. `additionalProperties`; every documented error status producible; enum ⊆ spec; `update_existing` breaking-change watch) |
| versioning / caching / negotiation | **rows in the CRUD case**: `405` + `Allow` · `HEAD` mirrors `GET` · `406`/`415` · `ETag`/`If-None-Match` → `304` · `If-Match` stale → `412` · old version still serves old schema · trailing slash / repeated params / path case → documented, never `500` |

Rules: a class that applies and has no case is a **GAP** for `/qa-review` (the depth index lists
them). Rows whose Expected the spec does not settle (`400` or clamp? all-or-nothing or `207`?)
become ONE `COVERAGE-GAP` + a `/qa-clarify` question — never two contradictory rows, never a
guess. Any `500` met while probing is a FUNCTIONAL finding in `## Data`, not an expectation.
Priority: classes guarding money, data integrity, or tenant isolation (state machine, idempotency,
multi-tenancy, delete) are P0/P1 by default; list/format classes P1/P2 unless the risk table says otherwise.

## Step 3b': Deploy checks — when the plan declares `deploy_impact: api` (CONTRACTS §30)

Design one case per required API check: old clients still work (old request shapes accepted, no
response field removed or renamed, enums only extended), a cached old frontend bundle against the
new API, the previous build redeployed, the post-deploy smoke, and for `api_change: versioned` or
`deprecated` the old version still served with its deprecation announced. Steps and Expecteds:
[`deploy-change-cases.md`](../qa-phase-protocol/references/deploy-change-cases.md). Each case names
its check on `**Deploy check:** <check>` under `**Tags:**`; the contract-drift case of Step 3b does
not replace them, because it checks the new spec, not the old clients. `qa:lint` fails the plan
while a required check has no case.

## Step 3c: Generated inputs — fuzzing and models (the inputs and orders nobody writes down)

Scripted rows share the spec's blind spots: they test the values and orders someone predicted. Two
generators close that gap; both are ordinary api cases, both are seeded and replayable.

- **Schema fuzzing — one case per API, not per endpoint.** `TC-API-FUZZ-001` under
  `<qa-root>/cases/api/_fuzz/` (the leading `_` marks a cross-module folder) mirrored by
  `<qa-root>/scripts/api/_fuzz/TC-API-FUZZ-001-<desc>.spec.ts`, which calls `shared/fuzz/openapi-fuzz.ts`:
  every operation of `OPENAPI_SPEC`, inputs derived from its own schemas (min/max ± 1, enum
  outsiders, wrong types, null, missing required, extra properties, huge / unicode / zero-width
  strings, malformed JSON, wrong content-type, unknown and malformed ids), one Variants row per actor
  (an authenticated actor + anonymous). Oracle: never a 5xx · every 4xx documented and valid against
  the problem schema · every 2xx valid against its response schema · no stack trace or internal field.
  `## Data` carries `- fuzz-allow: <operationIds | *>` and `- fuzz-deny: <operationId> (<reason>)`;
  QA_FUZZ_SEED / QA_FUZZ_MAX bound and replay it. Add each new operation of the slug to the allow list
  (or deny it with a reason). A finding is FUNCTIONAL; never "fix" it by denying the operation.
- **Model test — one case per state machine or invariant family.** When the slug adds a state
  machine, counters, memberships, quotas or uniqueness rules, design an api case with Technique
  `state-transition` and a `## Model` section (CONTRACTS §7): state, actions (precondition → call →
  model update), invariants checked after every step, budget and seed. Its script uses
  `shared/model/model-runner.ts`; a failure prints the shrunk minimal sequence. How to write one:
  [`references/model-based.md`](references/model-based.md).

## Step 4: Placement, naming, reconcile

- Path (contract — exact): `<qa-root>/cases/api/<module>/TC-API-<MODULE>-<NNN>-<short-desc>.md` —
  `<module>` lower-kebab, `<MODULE>` UPPER, `<NNN>` sequential per module folder, `<short-desc>`
  lowercase-kebab (matches the script generators' mirror examples). **Case ID = `TC-API-<MODULE>-<NNN>`.** Placement not derivable → `resolving-test-placement`; never guess.
- **Feature linkage = the `**Feature:** <slug>` header, never the filename.** Consumers use the plan's
  traceability table or grep `**Feature:** <slug>` under `<qa-root>/cases/` — NEVER glob `<slug>.md` filenames.
- **Check-then-upsert, never blind-append:**
  1. Glob `<qa-root>/cases/api/<module>/TC-API-*.md`; read each `**Feature:**`, title, `@req:` tags.
  2. Identity = covered REQ set + normalized title (lowercase, collapsed) — never the `<NNN>`.
  3. Match → UPDATE in place (keep filename/`<NNN>`, preserve `@tms:` tags and notes not re-derived).
     No match → CREATE at next `<NNN>`. Orphans (REQ dropped from analysis) → flag, don't delete.
  4. Report **created N · updated M · unchanged K · orphaned P**.

## Step 5: Write each case file (never print cases to chat)

```markdown
# TC-API-<MODULE>-<NNN> — [<Module>] <METHOD /path | operationId> — <Actor> <action> [<condition>] → <expected>
**Feature:** <slug>  **Plan:** <qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md
**Type:** api  **Module:** <module>  **Priority:** P0–P3
**AC:** <AC-NNN, … from the analysis AC register | —>
**Tags:** @api @<module> @P<n> [@req:<id>] @agentic:gen

## Objective
<ONE sentence — the single intent this case proves; a second intent is a second case>

## Technique
- EP → positive
- BVA → boundary, negative
- error-guessing → negative, authz, error-contract

## Isolation
- creates: <entities this case creates — run-unique keys>
- cleans: <teardown: what is deleted, reverse order, idempotent>
- actor: pool `<role>` (from <qa-root>/docs/test-data.md § Pool accounts)
- lock: none   <!-- or the shared state that cannot be isolated -->

## Preconditions
- <API-buildable state — created via API calls in-test or a data builder; never ambient environment data>
- Authenticated as <role> (TEST_USER/TEST_PASSWORD from <qa-root>/.env.<env>; base URL = API_BASE_URL)

## Steps
1. Action: POST /orders with <payload summary>
   Expected: 201; body.id non-null; body.status = "draft"; body echoes customerId and lines
2. Action: GET /orders/{id} (independent read-back)
   Expected: 200; persisted values match step 1's payload

## Variants
<!-- More inputs for the SAME intent. The validation case lists its field negatives here; the authz
     case lists 401 / expired / 403 / other-tenant here — each its own case, not steps of this one. -->
| Row | Technique | Input | Expected |
|---|---|---|---|
| 1 | BVA | lines = [] (min − 1) | 400; error shape { code, message }; message names "lines"; no order persisted |

## Expected Result
- <overall: the resource's contract holds — statuses, schema, persistence, authz — as stepped above>

## Data
- Payload values / builder reference; enum value list exercised; boundaries used (min−1 / boundary / max+1)
- Reusable data preconditions as `[DATA:<entity>-<state>]` tokens (e.g. `[DATA:order-paid]`) — resolved by `managing-test-data` into <qa-root>/docs/test-data.md; an undefined token is a review finding
- Endpoint source: <analysis inventory | OpenAPI §path>; assumptions + COVERAGE-GAPs; form override reason if any
- Cleanup: delete created entities in reverse order (idempotent suite)
```

**Title** (CONTRACTS §7 Title; lint-checked): `[<Module>]` = the module folder in Title Case · <METHOD /path | operationId> · the actor as a role (never "the user") + action + condition · `→` an observable outcome. No "Verify that"/"Ensure"/bare "successfully"/"works"; one outcome; ≤ 120 chars. Example: `TC-API-INVOICES-002 — [Invoices] POST /invoices/{id}/void — Owner voids a paid invoice → 409 invoice_paid`.

**Priority** (CONTRACTS §7 Priority): start from the REQ's priority (analysis §6 hint); P0 only for the main success path of a P0 REQ, an authz/security denial or data loss/money/irreversible state; main negatives and error contracts → P1; boundaries, alternative paths, rarer roles → P2; cosmetic/copy/rare edges → P3. Never above the REQ unless a denial or data-integrity case, with a one-line `Priority reason:` under the header. Header, `@P<n>` and the traceability Priority are one value.

**Grounding first** (CONTRACTS §7): before writing a case, open the sources it rests on (the wiki pages for its BRs, the impact note, the code citation) and list them under `## Grounding`; a source you did not open is not cited.

Skeleton: `<qa-root>/_templates/case-api.md` (CONTRACTS §7). `## Objective` is one sentence; `## Technique` uses the §7
vocabulary and names the axes it buys (`npm run qa:score` counts them per REQ and fails a P0/P1 REQ
without negative — and, for api, authz and error-contract — coverage); `## Isolation` says what the case
creates, cleans and which pool actor it uses so cases run in parallel; `**AC:**` lists the AC ids it
proves (add the Case ID to the plan's `## AC coverage` row for each). Techniques:
[`test-design-techniques.md`](../qa-phase-protocol/references/test-design-techniques.md).

Priority: P0 = revenue/critical contract paths (gate: 0 failing P0/P1 per `§Quality gates`), P1 =
every-release, P2 = edge validation, P3 = rare. Steps format: numbered, each = Action / Expected —
**one intent per case, minimum 1 step**: the CRUD contract, the validation set, and the authz set of an
endpoint are three cases (Step 3 items 1–3), never one long case; extra inputs for one intent are
`## Variants` rows. Split a case past ~12 steps.

### Tags — derived, never invented
Vocabulary at exact path `<qa-root>/docs/tag-taxonomy.md`. Fixed order:
`@api @<module> @P0|@P1|@P2|@P3 [@req:<id>] [@tms:<id>] @agentic:gen` — `@req:` one per covered
requirement; `@tms:<id>` ONLY when a real work-item id exists (written by `publishing-test-cases`
post-publish, never fabricated from `<NNN>`, only preserved on update); `@agentic:gen` always.

> **Project setup required:** `<qa-root>/docs/tag-taxonomy.md` must exist at that exact path; if missing, seed
> it with the ordered scheme above before tagging.

## Step 6: Append traceability rows to the plan

ONE row per Req ↔ Case pair in the plan's `## Traceability (Requirement ↔ Case)` table — exactly these columns:

| Req | Case ID | Type | Module | Priority | Scripted | Last run | Status | Report |
|---|---|---|---|---|---|---|---|---|
| REQ-007 | TC-API-ORDERS-001 | api | orders | P0 | ❌ | — | — | — |

Designing appends with `Scripted` ❌, run columns `—` (`generating-api-script` flips ✅;
`executing-tests` fills the rest). On UPDATE, refresh existing rows — no duplicates. Any in-scope
API-provable REQ with no row → `⚠️ No case covers REQ-<id> — "<summary>"` note below the table.

**Impact map:** for each `BR-###` the case cites, `maintaining-impact-map` Mode A appends the Case ID to
that BR's row for this module in `<qa-root>/docs/impact-map.md` — `TC` cell only; a case citing no BR writes nothing.

## Secondary mode — deriving from existing e2e cases
When the user asks to derive from `<qa-root>/cases/e2e/` (cases found via the plan table or grep
`**Feature:** <slug>`), per source case: apply the Step 1 screen to the whole case (**one verdict per
case** — even ONE API-provable Expected makes it derivable; skipped `ui-only` cases get no file, just a
one-line reason in the summary). Classify each UI step `PRECONDITION | NAV | ACTION | ASSERTION`; drop
pure-UI steps as `COVERAGE-GAP`; map each ACTION to an endpoint from the analysis inventory/OpenAPI —
resolve, never guess — and each ASSERTION to a status + body claim ("dropdown shows only category-A codes"
→ "GET /fault-codes?categoryId=A returns exactly the category-A set"). Then continue at Step 2 unchanged.

### Escape backfill (CONTRACTS §13)
If `<qa-root>/defects/ESCAPES.md` has a row for this slug with `Backfill` = `pending` whose defect's
`### Backfill` names the subject / endpoint / screen this case covers, set that row's `Backfill` cell to
the new Case ID (comma-append when several) — the ledger is how `/qa-metrics` proves the hole closed.

## Step 7: Report ONLY this summary to chat

```
✓ Reconciled <qa-root>/cases/api/: created {N} · updated {M} · unchanged {K} · orphaned {P}   (single: {n} · flow: {n} · class cases: list {n} · patch {n} · state-machine {n} · idempotency {n} · async {n} · bulk {n} · files {n} · isolation {n} · error-contract {n} · contract-drift {n})
✓ Appended traceability rows to <qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md
Screened out — ui-only: {list + one-line reason each, or "none"} | routed to integration: {list or "none"}
REQs covered: {ids} | Uncovered: {ids or "none"} | COVERAGE-GAPs: {n}
Next: /qa-script --type api  (specs mirror 1:1 → <qa-root>/scripts/api/<module>/<same-TC-name>.spec.ts, run by `test:api`)
```

---

## Common pitfalls
1. Manufacturing an API case for a UI-only behaviour "to have output" — if the whole scope screens out, write nothing and report it.
2. One generic happy path across all enum values — exhaust each valid value positively.
3. Negatives asserting only "an error occurs" — state the status AND the error shape.
4. Skipping the independent read-back — the create response echoing the payload proves nothing about persistence.
5. Authz sampled on one endpoint "as representative" — 401/403/cross-tenant is per endpoint.
6. Blind-appending on re-run, renumbering on update, or fabricating `@tms:` ids.
7. Stopping at CRUD — a collection endpoint with no pagination-boundary rows, a status field with no
   forbidden-transition rows, or a create endpoint with no double-submit row is the shape of the
   bugs that reach production. Step 3b is not optional when the class applies.
8. Encoding "either `400` or clamp" as two passing alternatives — the spec decides, or it is a question.

## Done — ALL must be true
- [ ] Every in-scope requirement/endpoint behaviour screened (API-provable / ui-only / seam-level) with routing recorded.
- [ ] Each case classified single/flow by the scored rubric; overrides justified in `## Data`.
- [ ] single: CRUD contract + read-back + per-field negatives + boundary rule-of-3 + enum positive/negative
      exhaustion + per-endpoint 401/403/cross-tenant + schema/leakage checks. flow: connected ring +
      end-state read-back + reverse-order cleanup.
- [ ] Every Expected is a concrete status + body claim; gaps marked `COVERAGE-GAP`, never invented.
- [ ] Step 3c: the slug's new operations are in the fuzz case's `fuzz-allow` (or denied with a reason); a model case exists for every new state machine / invariant family.
- [ ] Step 3b: every endpoint classified; every applicable class has its case/rows (query matrix, PATCH
      semantics, state-transition matrix, idempotency/concurrency, async, bulk, files, data-type rows,
      tenant isolation, delete semantics, shared error-contract + contract-drift cases).
- [ ] One file per case at `<qa-root>/cases/api/<module>/TC-API-<MODULE>-<NNN>-<short-desc>.md` in the exact
      contract format, with `**Feature:**`/`**Plan:**` headers.
- [ ] Reconciled by identity (REQ set + normalized title); orphans flagged, not deleted.
- [ ] Tags in fixed order per `<qa-root>/docs/tag-taxonomy.md`; traceability rows appended (`Scripted` ❌); gaps ⚠️-flagged.
- [ ] Only the Step 7 summary printed to chat.
