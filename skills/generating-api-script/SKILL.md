---
name: generating-api-script
description: Use to generate a Playwright API spec from one TC-API or TC-INT case: OpenAPI schema, read-backs, negatives, DB assertions for integration.
version: 1.2.0
---

# Generating API / Integration Script (Playwright API tier)

> Profile first, by section (`profile.mjs`) — `§Test types` (are api/integration enabled; tool
> choice — Playwright API tier is the default, pytest is the alternative below), `§Environments`
> (API base URLs), `§Application under test` (OpenAPI spec, auth mode, account pool, backend
> source), `§Quality gates`. QA root below is the default `<qa-root>/` (profile-overridable).

> **Shipped kit** under `<qa-root>/scripts/shared/` — read its `README.md` (tree, actor model, the 13 spec
> rules). A spec imports ONE thing: `import { test, expect, expectSchema, caseMeta } from
> '../../shared/fixtures'`. Platform fixtures: `api` (ApiClient as `TEST_USER`), `as(actor)` (an
> ApiClient for a named actor `'owner'` or a pool `Session`), `anonymous`, `pool` (this worker's own
> accounts), `actor(name)`, `cleanup` (teardown ledger), `db` (read-only). ApiClient variants:
> `withoutCsrf()`, `withCsrf(t)`, `withToken(t)`, `withHeaders(h)`. Helpers: `expectSchema`
> (Ajv from `OPENAPI_SPEC`), `pollUntil`, `TIMEOUTS`, `uniqueName` (`shared/data/unique.ts`). The
> `setup` project signs every actor in once per run per `AUTH_MODE` — specs never sign in.
> **Per-module files the first case bootstraps and later cases extend:** `endpoints/<module>.endpoints.ts`
> (the ONLY place URL paths live), `services/<module>.service.ts` (one method per operation; never
> asserts, never cleans up), `data/<module>.factory.ts` (`build()` · `create()` registering its
> cleanup · `withMember(role, account)`), `fixtures/<module>.fixture.ts` (`<module>`, `<module>As`,
> `<module>Factory`) added to `mergeTests` in `fixtures/index.ts`.
> **Golden reference** — compiled and run green by `node tests/golden/run.mjs` in the bundle repo:
> `tests/golden/qa/scripts/api/projects/*.spec.ts`, `integration/projects/*.spec.ts` and
> `shared/{endpoints,services,data,fixtures}/projects.*`. Copy their shape.

> Shipped: `<qa-root>/package.json` scripts `test:api`, `test:integration`, and `heal:check` (`tsc --noEmit` +
> `<qa-root>/eslint.config.mjs`: no sleeps, no skip/only, no conditionals inside a test, every test asserts).

## Action

Generate ONE `*.spec.ts` from ONE api or integration case, reusing the kit. Covers BOTH case
types — `integration` is the same generation plus DB-level assertions. Invoked by the
`automation-engineer` agent via `/qa-script --type api|integration`.

## Input

| What | Where |
|---|---|
| The case | `<qa-root>/cases/api/<module>/TC-API-<MODULE>-<NNN>-<short-desc>.md` or `<qa-root>/cases/integration/<module>/TC-INT-<MODULE>-<NNN>-<short-desc>.md` — contract case format (header, `## Preconditions`, `## Steps` with Action/Expected, `## Expected Result`, `## Data`) |
| Case discovery | The plan's `## Traceability (Requirement ↔ Case)` table in `<qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md`; fallback: grep `**Feature:** <slug>` under `<qa-root>/cases/`. **NEVER glob `<slug>.md` filenames.** |
| API truth | The OpenAPI spec per `§Application under test`, then backend source through `grounding-in-code` (Code KB `backend` per `§Code knowledge` → read-only grep), cited `backend:<path>#<symbol> @ <sha>` in the spec header — the only ground for endpoint paths, payload shapes, and schemas beyond what the case states |
| Env | `<qa-root>/.env.<env>` from `<qa-root>/.env.example`: `API_BASE_URL`, `AUTH_MODE` + its `AUTH_*` keys, `TEST_USER`/`TEST_PASSWORD`, `TEST_USER_<NAME>` for global-role actors, `TEST_POOL_*` when a case grants per-object roles, `DB_CONNECTION` (integration only) |

## Output

- `<qa-root>/scripts/api/<module>/<same-TC-basename>.spec.ts` or
  `<qa-root>/scripts/integration/<module>/<same-TC-basename>.spec.ts` — **mirrors the case path 1:1**,
  same basename and casing.
- Extended (never duplicated) module files: endpoints, service, factory, fixture.
- The case's traceability row flipped `Scripted` ❌ → ✅ (Step 7).

## Grounding rules

| # | Rule |
|---|---|
| 1 | **Status + body, always.** Every step asserts the exact expected HTTP status AND at least one body claim (returned id, echoed field, persisted value, error shape) — never a bare `.ok()`/`toBeTruthy()`. |
| 2 | **Every assertion comes from the case's Expected** or from resolved API truth (OpenAPI spec / backend source). A check you cannot ground → `// COVERAGE-GAP: <check> — reason`, never an invented assertion, never a weakened one. |
| 3 | **No endpoint invention.** Paths come from the case, the endpoint map, or the OpenAPI spec — added as constants to `endpoints/*`; the spec body contains zero raw URL-path string literals. |
| 4 | **Verify deep.** After every mutation, read the entity back via an independent GET and assert the persisted value — the write's own 2xx is never proof. |
| 5 | **One intent per test; parallel-safe always.** A case is one `test()`; its steps are `test.step('Step N: …')` in case order, values passed by return (`const created = await test.step(…)`). No `test.describe.serial`, no `beforeAll`/`afterAll` data, no `let` shared between tests, no `Date.now()`/`Math.random()` — names come from `uniqueName()` / `factory.build()`. |
| 6 | **Data via factories, cleanup via the ledger.** Preconditions are `<module>Factory.create()` / `.withMember(role, pool[0])`; anything the spec creates itself gets `cleanup.add(label, undo)` on the next line. Never `try/finally` teardown — the ledger runs after the test, newest first, whatever happened (`QA_KEEP_ON_FAIL=1` keeps a failed test's data). |
| 7 | **Identity via `caseMeta()`** — `id`, `type`, `module`, `priority`, `req: ['<slug>/REQ-NNN']` (slug-qualified: REQ numbers restart per feature), `suites`, `tms`, `defect`, `quarantinedUntil`, copied from the case's `**Tags:**`. `lock: ['<name>']` only for shared state the case cannot isolate, with a comment saying why. |
| 8 | **Integration cases assert at the DB too.** Where the case's Expected names stored state, query it via the `db` fixture (parameterised, read-only) and assert the row/values. `DB_CONNECTION` unset → `test.skip(!db.configured, '…')` in that step (an honest gap), never a fake pass or a fail. |
| 9 | **Actors are chosen, not assumed.** Unauthenticated → `anonymous` (401); global roles → named actors (`as('admin')`); per-object roles → GRANTED to this worker's pool account by the factory (`withMember('viewer', pool[0])`), never a shared "viewer" login. Named actors are read-only identities: never change the account itself. Role × operation matrices belong to `generating-security-script`. |
| 10 | **Invalid input → 400/422 (contract validation), never 500.** Boundary/missing/wrong-type payloads from the case's Data; a 500 observed is a FUNCTIONAL finding to surface verbatim, not a tolerance to encode. |
| 11 | **Schemas come from the spec, never from a hand-typed shape.** Every response the case says "validates against the schema" (and every `2xx` of a CRUD/contract/drift case) goes through `expectSchema(res, operationId, status)`. No spec on the project → `// COVERAGE-GAP: schema — no OpenAPI spec declared`, never `toMatchObject` guesses. |
| 12 | **Row-shaped steps are table-driven.** Negatives, boundary triples, enum exhaustion, pagination edges, state-transition cells are a typed `ROWS` array and `for (const row of ROWS) test(\`<Case ID> — row ${row.id}: …\`, caseMeta(…), …)` — each row its OWN test (parallel, fails alone), the row carries input + expected status + expected error field/code, and **no `if` inside the test body**; per-row arrangement lives in lookup tables keyed by the row. |
| 13 | **Concurrency and async are real, not simulated.** Double-submit rows use `Promise.all` on genuinely parallel requests and assert the persisted count via read-back; async (`202`) rows use `pollUntil` with `TIMEOUTS.POLL_*` — never `waitForTimeout`/`sleep`. Idempotency-key rows send the identical key twice and assert the same id. |
| 14 | **REUSE > CREATE.** Existing service/endpoint/factory/fixture → extend it; new files only when the module has none. Services, factories and clients come from fixtures — a spec never `new`s one. Record "Reused vs Created". |
| 15 | **Timeouts from `TIMEOUTS.*`**; no magic literals; no `test.setTimeout` > 60s. |
| 17 | **A failure explains itself; a failed read is UNKNOWN** (CONTRACTS §31, `qa-phase-protocol/references/verdict-integrity.md`). Every status/body assertion carries a message with the call, the entity and the response body (`expect(res.status(), \`POST /orders → ${await res.text()}\`).toBe(201)`), so the report says what broke without a re-run. A body that will not parse, an error page or a changed shape throws — never `json().catch(() => ({}))` (`qa:lint` rejects it without `// unknown-ok: <reason>`). A mutation is proven by an independent read-back, and a compound Expected asserts every half |
| 16 | **UI-only case → no spec.** A case whose every Expected is presentational cannot be proven over HTTP — STOP and report it back for re-triage by `case-designer`. |

## Procedure

### 1. Parse the case + skip gate
Read the case: Case ID, Feature slug, Plan path, Tags, Preconditions, Steps (Action/Expected),
Expected Result, Data. Apply rule 16 (skip gate) and the completeness gate (≥1 step + ≥1 real
Expected — else stop and report).

### 2. Inventory reuse targets
Per resource touched: `services/<module>.service.ts` method? `endpoints/<module>.endpoints.ts`
constant? `data/<module>.factory.ts`? `fixtures/<module>.fixture.ts` listed in `fixtures/index.ts`?
Extend what exists; bootstrap only what is missing (copy the golden `projects.*` files and rename).

### 3. Pick the template
Full templates (module bootstrap, single, table rows, seam, double-submit, async 202) and the
old-pattern → new-pattern table are in `references/api-templates.md`.

| Template | When | Shape | Golden |
|---|---|---|---|
| **single** | one resource's lifecycle / contract | one `test()`, `test.step` per case step | `api/projects/TC-API-PROJECTS-001-create-read-delete.spec.ts` |
| **table rows** | negatives, boundaries, enums, transition cells | typed `ROWS`, one `test()` per row | `api/projects/TC-API-PROJECTS-002-create-validation.spec.ts` |
| **seam** | integration: one actor writes, another path reads, DB agrees | factory grants a pool account; steps read through each path | `integration/projects/TC-INT-PROJECTS-001-member-grant-visible-everywhere.spec.ts` |
| **double-submit / async** | rule 13 | `Promise.all` + read-back count · `pollUntil` | `references/api-templates.md` |

```ts
import { test, expect, expectSchema, caseMeta } from '../../shared/fixtures';

test('TC-API-ORDERS-004 — [Orders] POST /orders — Owner creates an order → 201 and it reads back', caseMeta({
  id: 'TC-API-ORDERS-004', type: 'api', module: 'orders', priority: 'P1', req: ['checkout/REQ-014'],
}), async ({ ordersAs, ordersFactory, cleanup }) => {
  const owner = await ordersAs('owner');
  const input = ordersFactory.build({ quantity: 3 });                     // from the case's ## Data

  const created = await test.step('Step 1: Owner creates an order → 201 + the documented body', async () => {
    const res = await owner.create(input);
    await expectSchema(res, 'createOrder', 201);
    expect(res.body).toMatchObject({ reference: input.reference, status: 'Open' });
    cleanup.add(`order ${res.body.reference}`, () => owner.remove(res.body.id));
    return res.body;
  });

  await test.step('Step 2: read-back → persisted values match', async () => {
    const res = await owner.get(created.id);                              // independent GET — verify deep
    await expectSchema(res, 'getOrder', 200);
    expect(res.body).toEqual(created);
  });
});
```

### 4. Write the spec
**Title mirrors the case** (CONTRACTS §7 Title; `qa:lint` checks it): the test title is `<case id> — <case H1 title text>` verbatim; a table-driven row is `<case id> — row <Row>: <input> → <expected>` with `<Row>` the case's `## Variants` Row id; steps are `test.step('Step N: <action> → <expected>')`, N = the case step number, 1..n. Naming of files and support code: `<qa-root>/scripts/shared/README.md` § Script naming & numbering.

Path mirrors the case 1:1. `test.step('Step N: …')` for every case step; gaps only as
`// COVERAGE-GAP` with a reason. `caseMeta()` values verbatim from the case's `**Tags:**`
(`<qa-root>/docs/tag-taxonomy.md`): the case's `@req:REQ-014` → `req: ['<slug>/REQ-014']`. Every created
entity is on the cleanup ledger the moment it exists; the ledger runs newest-first, so a
non-cascading child registered after its parent is deleted before it.

### 5. DB assertions (integration cases only)
- Read-only, parameterised queries through `db` — never string-built SQL, never UPDATE/DELETE
  (the client refuses them; mutations happen via the API under test).
- Assert exactly the stored state the case's Expected names (row exists, column values, counts).
- Guard the DB steps with `test.skip(!db.configured, 'DB_CONNECTION is not set for this environment')`.

### 6. Validate — offline gate
```bash
cd qa && npm run heal:check     # tsc 0 · eslint 0 (shipped config)
```
Fix all findings. Running belongs to `executing-tests` (`/qa-run` → `npm run test:api` /
`npm run test:integration`), which also proves the spec is parallel-safe (`--repeat-each`, shuffle).

### 7. Traceability write-back + report
After the gate is clean: open the plan from the case's `**Plan:**` line, flip this Case ID's
`Scripted` ❌ → ✅ in `## Traceability (Requirement ↔ Case)`. Leave `Last run`/`Status`/`Report`
to `executing-tests`. Report: spec path, template used, coverage (steps ↔ markers), gaps, skips,
reused-vs-created.

## pytest ALTERNATIVE — when `§Test types` names pytest for the api/integration tier

Same cases, same grounding rules, same traceability flip; only the emission changes:

- Script path mirrors the case 1:1 with `.py`: `<qa-root>/scripts/api/<module>/<same-TC-basename>.py`.
- Shared layer: `<qa-root>/scripts/shared/conftest.py` (fixtures: `api` per actor, `anonymous`, `pool`,
  `cleanup` — a yield fixture running registered undos in reverse, `db` — session-scoped sign-in,
  `.env.<env>`-driven), `services/<module>_service.py`, `schemas/<module>_schemas.py` (Pydantic
  models mirroring the OpenAPI spec), `data/<module>_factory.py`.
- One test function per case (step comments), one parametrized test per row
  (`@pytest.mark.parametrize` with `ids=`); runs under `pytest-xdist` — so no ordering markers, no
  module-level state, names from a run+worker-scoped helper.
- Assert status + body exactly as above; verify-deep read-backs; DB assertions via `db`,
  `pytest.skip` when `DB_CONNECTION` is unset.
- Offline gate: `pytest --collect-only <qa-root>/scripts/api/` collects cleanly (plus the project's
  linter if configured) — `heal:check` is TypeScript-scoped and does not apply.
  > **Project setup required:** point `test:api`/`test:integration` in `<qa-root>/package.json` at the
  > pytest invocations so `executing-tests` stays runner-agnostic.

## Done — ALL must be true

- [ ] Case located via traceability table / `**Feature:**` grep — never a filename glob
- [ ] Skip + completeness gates applied (UI-only or Expected-less case → reported, no spec)
- [ ] Spec mirrors the case path 1:1 under `<qa-root>/scripts/api/` or `<qa-root>/scripts/integration/`
- [ ] Every step asserts status + body from the case's Expected; ungrounded checks are `COVERAGE-GAP`s, not inventions
- [ ] Schema assertions through `expectSchema`; row-shaped steps are one test per row; double-submit truly parallel; async polls with `pollUntil` + `TIMEOUTS.*`
- [ ] Mutations verified by independent read-back; integration cases assert stored state via `db` (skip-not-fail without `DB_CONNECTION`)
- [ ] Zero raw URL-path literals; services, factories and clients come from fixtures — never `new`-ed in the spec
- [ ] Parallel-safe: one intent per test; no `describe.serial` / `beforeAll` / `afterAll` / shared `let`; names from `uniqueName()`; everything created is on the `cleanup` ledger; per-object roles granted to a pool account
- [ ] `test.step('Step N: …')` coverage 100% (or reasoned gaps); `caseMeta()` from the case's Tags with slug-qualified `req`; `lock` only with a reason
- [ ] Offline gate clean (`npm run heal:check`, or `pytest --collect-only`); no `if` inside a test body
- [ ] Traceability `Scripted` flipped to ✅; report delivered (path, template, coverage, gaps, reuse)
