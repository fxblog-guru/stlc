---
name: designing-integration-cases
description: Use to design seam cases: API action → DB state, service contracts, queues, a negative twin per seam (/qa-design --type integration).
version: 1.0.0
---

# Designing Integration Test Cases

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
Design integration test cases for one feature slug — **one file per case** under
`<qa-root>/cases/integration/<module>/` — verifying that the product's **seams** hold: an API action lands the
right **database state**, service A's action produces service B's expected observable, a published
**event/message** is consumed with the right effect. This skill designs cases only;
`generating-api-script` turns them into Playwright API-tier specs under `<qa-root>/scripts/integration/`
(`/qa-script --type integration`, run by `test:integration`).

**Scope fence — what this skill is NOT:**
- **NOT unit tests.** No in-process mocks, no stubbed collaborators, no code-level seams. Every case runs
  against a deployed environment over real transports (HTTP, SQL, the real broker). Logic that a fake
  port would prove just as well (a calculation, a validation rule, a transition guard) → route to
  `designing-unit-cases` and say so in the summary.
- **NOT UI.** No browser, no rendered assertion — those belong to `designing-functional-cases`.
- **NOT plain API contract testing.** A case whose every assertion is provable from the HTTP
  response alone belongs to `designing-api-cases`. An integration case earns its place by asserting
  **beyond the response**: in the DB, in a second service, or on a queue.

## Inputs — resolve before designing (STOP conditions)
1. `<slug>` — the feature slug (argument; else the most recently dated folder under `<qa-root>/plans/`; ask if ambiguous).
2. **Analysis**: latest `<qa-root>/analysis/<slug>/YYYY-MM-DD-analysis.md` — requirements (`REQ-<id>`), endpoint
   inventory, and the seam map for this feature. Missing → STOP: run `/qa-analyze` first.
3. **Plan**: latest `<qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md` with its `## Traceability (Requirement ↔ Case)`
   skeleton. Missing → STOP: run `/qa-plan` first.
4. **Declared seams**: `§Application under test` MUST declare the integration seams — services and their
   base URLs, the database(s) and reachable schema, queues/topics and how to observe them. **No seams
   declared → STOP.** Do not infer connection strings, table names, or topics from thin air.

> **Project setup required:** `§Application under test` must list the integration seams (service names +
> URLs, DB engine + schema access, broker + topics/queues), and `<qa-root>/.env.<env>` (copied from
> `<qa-root>/.env.example`) must provide `DB_CONNECTION` for database assertions plus `API_BASE_URL`,
> `TEST_USER`, `TEST_PASSWORD` for the driving API calls. Until both exist, this skill stops.

---

## Step 1: Map requirements to seams

From the analysis, list every in-scope requirement whose outcome is **only provable at a seam** (Step 1 of
`designing-api-cases` routes these here). Bind each to one of the three case patterns:

| Pattern | Shape | Example (orders/invoices) |
|---|---|---|
| **A. API action → DB state** | drive via HTTP, assert persisted rows/columns via `DB_CONNECTION` | POST /orders → `orders` row exists with `status='draft'`, `total=150.00`; `order_lines` has exactly 2 rows FK'd to it |
| **B. Service A → service B contract** | act on A, assert B's observable state via B's API | approving an order in the orders service → the invoicing service exposes a draft invoice with `orderId` and matching totals |
| **C. Queue/event consumption** | act (or publish), assert the message was produced/consumed with the right effect | POST /invoices/{id}/issue → `invoice.issued` event on the declared topic → the notifications service records a queued email for the customer |

A requirement that fits none of the three and is response-provable → route back to `designing-api-cases`
and note it in the summary. Also design the **failure-mode variants** the analysis calls out: consumer
retries/idempotency (same event delivered twice → one side effect), rejected action → NO DB row / NO
event (negative seam assertions matter as much as positive ones).

## Step 1b: Deploy checks — when the plan declares `deploy_impact: db` (CONTRACTS §30)

Read the plan's `## Sizing` deploy keys. For `db`, design one case per required schema check, and
for a `data_change` other than `none` one per data check as well (backup and restore, baseline
before, resumable and idempotent run, verification after, rollback with data, N-1 for data), as
[`deploy-change-cases.md`](../qa-phase-protocol/references/deploy-change-cases.md) prescribes. Each
names its check on `**Deploy check:** <check>` under `**Tags:**`, runs on a disposable copy
(`lock: schema — <copy>`), and may apply migrations and restores: that is the action under test, so
Step 2's read-only SQL rule does not cover these steps. A check the plan's `deploy_skipped` lists
is not designed. `qa:lint` fails the plan while a required check has no case.

## Step 2: Assertion rules per pattern

- **Drive state through the API, verify through the seam.** SQL is **read-only** in these cases — state
  is created by HTTP calls, never by INSERTs; queries are scoped by the id the driving call returned
  (never "the latest row").
- **DB assertions (pattern A)** name the table and the columns with expected values, plus row counts for
  child tables. Include the negative twin: a rejected request (400/403) leaves **no** row behind.
- **Service-contract assertions (pattern B)** name the observable on B's API (endpoint + fields) and the
  cross-service link field (e.g. `invoice.orderId === order.id`). Asynchronous propagation → the Expected
  states the polling window ("visible within 30s, poll every 2s"), never a bare sleep.
- **Event assertions (pattern C)** name the topic/queue, the key fields of the payload, and the consumed
  effect (state change in the consumer, observable via its API or DB). Include the idempotency twin where
  the seam declares redelivery.
- **Every Expected is concrete**: table.column = value, endpoint field = value, topic + payload field =
  value. An Expected that cannot be made concrete from the declared seams is `COVERAGE-GAP: <reason>` in
  `## Data`, never invented — and never "guessed schema".

## Step 3: Placement, naming, reconcile

- Path (contract — exact): `<qa-root>/cases/integration/<module>/TC-INT-<MODULE>-<NNN>-<short-desc>.md` —
  `<module>` lower-kebab (for pattern B/C cases spanning modules, the module of the **driving** action),
  `<MODULE>` UPPER, `<NNN>` sequential per module folder, `<short-desc>` lowercase-kebab (matches the script generators' mirror examples).
  **Case ID = `TC-INT-<MODULE>-<NNN>`.** Placement not derivable → `resolving-test-placement`; never guess.
- **Feature linkage = the `**Feature:** <slug>` header, never the filename.** Consumers use the plan's
  traceability table or grep `**Feature:** <slug>` under `<qa-root>/cases/` — NEVER glob `<slug>.md` filenames.
- **Check-then-upsert, never blind-append:**
  1. Glob `<qa-root>/cases/integration/<module>/TC-INT-*.md`; read each `**Feature:**`, title, `@req:` tags.
  2. Identity = covered REQ set + normalized title (lowercase, collapsed) — never the `<NNN>`.
  3. Match → UPDATE in place (keep filename/`<NNN>`, preserve `@tms:` tags and notes not re-derived).
     No match → CREATE at next `<NNN>`. Orphans (REQ dropped from analysis) → flag, don't delete.
  4. Report **created N · updated M · unchanged K · orphaned P**.

## Step 4: Write each case file (never print cases to chat)

```markdown
# TC-INT-<MODULE>-<NNN> — [<Module>] <METHOD /path | operationId> — <Actor> <action> [<condition>] → <expected>
**Feature:** <slug>  **Plan:** <qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md
**Type:** integration  **Module:** <module>  **Priority:** P0–P3
**AC:** <AC-NNN, … from the analysis AC register | —>
**Tags:** @integration @<module> @P<n> [@req:<id>] @agentic:gen

## Objective
<ONE sentence — the single intent this case proves; a second intent is a second case>

## Technique
- EP → positive
- error-guessing → negative          <!-- the negative twin: a rejected request leaves no row -->

## Isolation
- creates: <entities this case creates — run-unique keys>
- cleans: <teardown: what is deleted, reverse order, idempotent>
- actor: pool `<role>` (from <qa-root>/docs/test-data.md § Pool accounts)
- lock: none   <!-- or the shared state that cannot be isolated -->

## Preconditions
- Seam declared in §Application under test: <service/DB/topic this case verifies>
- DB access via DB_CONNECTION (<qa-root>/.env.<env>); API driven at API_BASE_URL as TEST_USER
- <state built via API calls or builders — never via direct SQL writes>

## Steps
1. Action: POST /orders with 2 lines (total 150.00)
   Expected: 201; body.id captured as {orderId}
2. Action: query DB — SELECT status, total FROM orders WHERE id = {orderId}
   Expected: exactly 1 row; status = 'draft'; total = 150.00
3. Action: query DB — SELECT COUNT(*) FROM order_lines WHERE order_id = {orderId}
   Expected: 2
4. Action: POST /orders/{orderId}/approve
   Expected: 200; body.status = "approved"
5. Action: GET invoicing-service /invoices?orderId={orderId} (poll ≤30s, every 2s)
   Expected: one draft invoice; invoice.orderId = {orderId}; invoice.total = 150.00

## Variants
<!-- the negative twin of the same seam behaviour: a rejected request leaves no trace -->
| Row | Technique | Input | Expected |
|---|---|---|---|
| 1 | error-guessing | POST /orders with lines = [] | 400; no new orders row for this request; no invoice created |

## Expected Result
- <overall: the seam holds — persisted state, downstream observable, and negative twin — as stepped above>

## Data
- Payloads/builders; tables+columns and topics asserted (source: §Application under test seam map)
- Reusable data preconditions as `[DATA:<entity>-<state>]` tokens — resolved by `managing-test-data`; an undefined token is a review finding
- Polling windows for async assertions; COVERAGE-GAPs + assumptions
- Cleanup: delete created entities via API in reverse order (idempotent suite)
```

**Title** (CONTRACTS §7 Title; lint-checked): `[<Module>]` = the module folder in Title Case · <METHOD /path | operationId> · the actor as a role (never "the user") + action + condition · `→` an observable outcome. No "Verify that"/"Ensure"/bare "successfully"/"works"; one outcome; ≤ 120 chars. Example: `TC-INT-ORDERS-002 — [Orders] POST /orders — Owner submits an order → one orders row in status Open`.

**Priority** (CONTRACTS §7 Priority): start from the REQ's priority (analysis §6 hint); P0 only for the main success path of a P0 REQ, an authz/security denial or data loss/money/irreversible state; main negatives and error contracts → P1; boundaries, alternative paths, rarer roles → P2; cosmetic/copy/rare edges → P3. Never above the REQ unless a denial or data-integrity case, with a one-line `Priority reason:` under the header. Header, `@P<n>` and the traceability Priority are one value.

**Grounding first** (CONTRACTS §7): before writing a case, open the sources it rests on (the wiki pages for its BRs, the impact note, the code citation) and list them under `## Grounding`; a source you did not open is not cited.

Skeleton: `<qa-root>/_templates/case-integration.md` (CONTRACTS §7). `## Objective` is one sentence; `## Technique` uses the §7
vocabulary and names the axes it buys (`npm run qa:score` counts them per REQ and fails a P0/P1 REQ
without negative — and, for api, authz and error-contract — coverage); `## Isolation` says what the case
creates, cleans and which pool actor it uses so cases run in parallel; `**AC:**` lists the AC ids it
proves (add the Case ID to the plan's `## AC coverage` row for each). Techniques:
[`test-design-techniques.md`](../qa-phase-protocol/references/test-design-techniques.md).

Steps format: numbered, each = Action / Expected, minimum 1 step; each case verifies ONE seam behaviour
(plus its negative twin) — split multi-seam journeys into separate cases. Priority: P0 = money/state-critical
seams (gate: 0 failing P0/P1 per `§Quality gates`), P1 = every-release, P2 = edge, P3 = rare.

### Tags — derived, never invented
Vocabulary at exact path `<qa-root>/docs/tag-taxonomy.md`. Fixed order:
`@integration @<module> @P0|@P1|@P2|@P3 [@req:<id>] [@tms:<id>] @agentic:gen` — `@req:` one per covered
requirement; `@tms:<id>` ONLY when a real work-item id exists (written by `publishing-test-cases`
post-publish, never fabricated from `<NNN>`, only preserved on update); `@agentic:gen` always.

> **Project setup required:** `<qa-root>/docs/tag-taxonomy.md` must exist at that exact path; if missing, seed
> it with the ordered scheme above before tagging.

## Step 5: Append traceability rows to the plan

ONE row per Req ↔ Case pair in the plan's `## Traceability (Requirement ↔ Case)` table — exactly these columns:

| Req | Case ID | Type | Module | Priority | Scripted | Last run | Status | Report |
|---|---|---|---|---|---|---|---|---|
| REQ-009 | TC-INT-ORDERS-001 | integration | orders | P0 | ❌ | — | — | — |

Designing appends with `Scripted` ❌, run columns `—` (`generating-api-script` flips ✅;
`executing-tests` fills the rest). On UPDATE, refresh existing rows — no duplicates. Any seam-level REQ
with no row → `⚠️ No case covers REQ-<id> — "<summary>"` note below the table.

**Impact map:** for each `BR-###` the case cites, `maintaining-impact-map` Mode A appends the Case ID to
that BR's row for this module in `<qa-root>/docs/impact-map.md` — `TC` cell only; a case citing no BR writes nothing.

### Escape backfill (CONTRACTS §13)
If `<qa-root>/defects/ESCAPES.md` has a row for this slug with `Backfill` = `pending` whose defect's
`### Backfill` names the subject / endpoint / screen this case covers, set that row's `Backfill` cell to
the new Case ID (comma-append when several) — the ledger is how `/qa-metrics` proves the hole closed.

## Step 6: Report ONLY this summary to chat

```
✓ Reconciled <qa-root>/cases/integration/: created {N} · updated {M} · unchanged {K} · orphaned {P}
Patterns: API→DB ({n}) · service→service ({n}) · queue/event ({n})
✓ Appended traceability rows to <qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md
Routed back to api: {list or "none"} | Seams missing from §Application under test: {list or "none"}
REQs covered: {ids} | Uncovered: {ids or "none"} | COVERAGE-GAPs: {n}
Next: /qa-script --type integration  (specs mirror 1:1 → <qa-root>/scripts/integration/<module>/<same-TC-name>.spec.ts, run by `test:integration`)
```

---

## Common pitfalls
1. Seeding state with SQL INSERTs — state goes in through the API; SQL only reads.
2. Asserting "the latest row" — always scope DB queries by the id the driving call returned.
3. Bare sleeps for async seams — state the polling window and interval in the Expected.
4. Guessing table/column/topic names — only what `§Application under test` declares; otherwise `COVERAGE-GAP`.
5. Rebuilding a unit test with real infra — if a mock would do, it is not an integration case (→ `designing-unit-cases`).
6. Forgetting the negative twin — a rejected action leaving phantom rows/events is exactly what this tier catches.

## Done — ALL must be true
- [ ] `§Application under test` seams verified present; stopped with the setup callout if not.
- [ ] Every seam-level REQ bound to pattern A, B, or C; response-only behaviours routed back to `designing-api-cases`.
- [ ] Each case: drives via API, asserts beyond the response (DB/table.column, downstream endpoint field,
      or topic+payload), includes its negative twin, states polling windows for async.
- [ ] No unit-test shapes, no UI steps, no SQL writes, no invented schema.
- [ ] One file per case at `<qa-root>/cases/integration/<module>/TC-INT-<MODULE>-<NNN>-<short-desc>.md` in the
      exact contract format with `**Feature:**`/`**Plan:**` headers.
- [ ] Reconciled by identity (REQ set + normalized title); orphans flagged, not deleted.
- [ ] Tags in fixed order per `<qa-root>/docs/tag-taxonomy.md`; traceability rows appended (`Scripted` ❌); gaps ⚠️-flagged.
- [ ] Only the Step 6 summary printed to chat.
