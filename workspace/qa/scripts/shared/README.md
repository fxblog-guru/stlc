# scripts/shared — the kit every spec reuses

Shipped as code, not prose: the generating-* skills import from here and EXTEND (never
duplicate) these files. A spec imports ONE thing — `import { test, expect, caseMeta } from
'../../shared/fixtures'` — and gets every actor, service, factory and page object as a fixture.
Specs contain zero raw URL paths, zero raw locators, zero `new` of a service or page object.

The worked reference is one module, `projects`, in the bundle repo at `tests/golden/qa/scripts/**`
(`node tests/golden/run.mjs` runs it green at 6 workers, shuffled, and as 3 shards against a demo
session+CSRF app). When in doubt, copy its shape.

```
config/env.ts                the ONE reader of process.env — typed, validated by the setup project
auth/session.ts              Session (cookie jar + CSRF/Authorization); signIn per AUTH_MODE; pool slices
../setup/auth.setup.ts       the `setup` project: validates env, signs every actor in ONCE per run → .auth/<env>/
http/api.client.ts           ApiClient — the only place HTTP is issued; one actor per context;
                             CSRF on non-GET; withoutCsrf() / withCsrf(t) / withToken(t) / withHeaders(h)
http/poll.ts                 pollUntil(fn, { every, timeout, until }) — replaces every sleep
fixtures/base.fixture.ts     pool · actor · api · as(actor) · anonymous · cleanup · db (worker-scoped where costly)
fixtures/ui.fixture.ts       pageAs(actor) — a page in that actor's own browser context; page error guard
fixtures/index.ts            mergeTests(ui, <module>Fixtures…) — the `test` every spec imports
meta.ts                      caseMeta({ id, type, module, priority, req, suites, lock… }) → tags + annotations
data/unique.ts               uniqueName(label) → qa-<QA_RUN_ID>-w<worker>-<n>-<label>; uniqueEmail(domain)
data/cleanup.ts              the per-test teardown ledger (factories register undo at creation)
components/dialog.component.ts      Dialog by accessible name: field(label) · press(button) · error
components/data-table.component.ts  DataTable by accessible name: row(key) · cell(key, column) · link(key)
pages/base.page.ts           BasePage — goto() ends in an arrival assertion; byTestId/byRole/byLabel
db/db.client.ts              read-only parameterised queries; `db.configured` is false without DB_CONNECTION
schemas/openapi.validator.ts expectSchema(res, operationId, status) — Ajv compiled from OPENAPI_SPEC
a11y/axe.ts                  expectNoA11yViolations / expectTabOrder — WCAG 2.2 AA, impact → severity
constants/timeouts.ts        TIMEOUTS.* — the only place a wait duration is written
lint-qa.mjs                  npm run qa:lint — CONTRACTS.md mechanical checks (not runtime)

bug hunting (generated inputs and orders, server-side oracle):
fixtures/server-watch.fixture.ts  (auto, via base.fixture) fail a test on server log lines matching QA_SERVER_LOG_FAIL
                             while it ran — QA_SERVER_LOG (file) | QA_SERVER_LOG_CMD (command, {since}); unset = off;
                             per case: test.use({ allowedServerErrors: [...] })
fuzz/openapi-fuzz.ts         fuzzOperations · fuzzSelection(case) · fuzzAll({ ops, client, ids, bodies, … }) · judge —
                             schema-derived hostile inputs per operation, oracle: no 5xx, documented + schema-valid, no leak
model/model-runner.ts        runModel(model, ctx, prng, { seed, runs, steps }) — random action sequences, invariants
                             after every step, shrink to the minimal failing sequence (guide: designing-api-cases
                             references/model-based.md); a module's model lives in model/<module>.model.ts
data/prng.ts                 Prng(seed) · streamSeed(seed, label) — the only randomness a test may use; seeds print on failure
pages/network.ts             trackRequests(page, method, url) → settled() — "the UI sent exactly one create"
schemas/openapi.validator.ts also: openApiDocument() · resolveRef() · responseFindings(operationId, res) (non-asserting)

per module (the first case bootstraps, later cases extend):
endpoints/<module>.endpoints.ts   the ONLY place URL paths live
services/<module>.service.ts      one method per operation over ApiClient; never asserts, never cleans up
data/<module>.factory.ts          build() (no I/O) · create() (+ cleanup registered) · withMember(role, account)
pages/<module>/<screen>.page.ts   locators + actions; composes components; never asserts outcomes
fixtures/<module>.fixture.ts      <module> · <module>As(actor|client) · <module>Factory · <module>Page · <module>PageAs(actor)
```

## Actors

| Kind | From | Use for | Never |
|---|---|---|---|
| named | `TEST_USER` (= `default`), `TEST_USER_<NAME>` (`owner`, `admin`…) | GLOBAL roles (account properties); reading; creating data the test owns | changing the account (password, sign-out-everywhere, lockout) — every worker shares it |
| pool | `TEST_POOL_USER` template × `TEST_POOL_SIZE`, `TEST_POOL_PER_WORKER` each | per-object roles (project member, viewer) GRANTED by a factory; account-mutating cases | being assumed to hold a role nobody granted in this test |
| anonymous | `anonymous` fixture | the 401 axis | — |

`AUTH_MODE` = `none` · `session-csrf` (cookie + CSRF token at `AUTH_CSRF_PATH`, sent in
`AUTH_CSRF_HEADER` on non-GET) · `bearer-login` (token at `AUTH_TOKEN_PATH`) · `basic` · `header`
(`API_TOKEN`). `AUTH_ID_PATH` lets factories grant roles to the signed-in account's id. All of it is
done once by the setup project, over the API — never a UI login in a spec.

## Rules every spec follows

| # | Rule | Golden reference |
|---|---|---|
| 1 | **One intent per test.** A case is one `test()`; its steps are `test.step('Step N: …')` in case order. | `api/projects/TC-API-PROJECTS-001-create-read-delete.spec.ts` |
| 2 | **Table rows are tests.** Boundaries, negatives, role × operation cells: a typed `ROWS` array, `for (const row of ROWS) test(…)` — each row runs in parallel and fails alone. Row-specific arrangement lives in lookup tables, not `if`. | `api/projects/TC-API-PROJECTS-002-create-validation.spec.ts`, `security/projects/TC-SEC-PROJECTS-001-role-matrix.spec.ts` |
| 3 | **No `test.describe.serial`, no `beforeAll`/`afterAll` data, no `let` shared between tests.** Every test arranges its own state. | all golden specs |
| 4 | **Data via factories; cleanup via the ledger.** `<module>Factory.create()` registers the delete; a spec that creates something directly calls `cleanup.add(label, undo)` right after. Never `try/finally` teardown. | `shared/data/projects.factory.ts` |
| 5 | **Unique names from `uniqueName()`** — never `Date.now()`, `Math.random()` or a literal another worker could also create. | `shared/data/unique.ts` |
| 6 | **Per-object roles are granted to pool accounts** (`factory.withMember(role, pool[0])`); named actors are read-only identities. | `integration/projects/TC-INT-PROJECTS-001-…spec.ts` |
| 7 | **`caseMeta()` for identity**: tags (`@type @module @P @smoke…`) for selection, annotations (case, `req: ['<slug>/REQ-NNN']`, tms, defect) for links. Values copied from the case's `**Tags:**`. | `meta.ts` |
| 8 | **`lock:` only for shared state that cannot be isolated** (a product-wide setting, a name too short for the run prefix) — with a comment saying why. | `TC-API-PROJECTS-002` row b |
| 9 | **E2E seeds through services/factories, drives only the behaviour under test through the UI.** | `e2e/projects/TC-E2E-PROJECTS-003-…spec.ts` |
| 10 | **Page objects come from fixtures** (`projectsPage`, `projectsPageAs(actor)` for a second actor); components (`Dialog`, `DataTable`) for repeated widgets. No CSS/XPath in specs. | `shared/fixtures/projects.fixture.ts`, `shared/pages/projects/projects.page.ts` |
| 11 | **Structure → `toMatchAriaSnapshot`** (regex for generated values), not screenshots. | `e2e/projects/TC-E2E-PROJECTS-004-list-structure.spec.ts` |
| 12 | **Time → Playwright's Clock API** (`page.clock.install/setFixedTime/fastForward`), never real waiting or a mocked `Date`. | — |
| 13 | **Negative axes are client variants**: `anonymous`, `client.withoutCsrf()`, `client.withToken(t)`. | `TC-SEC-PROJECTS-001` |

## Bootstrapping a module (what the first generated case of a module does)

Endpoints → service → factory → page object (UI tiers) → `<module>.fixture.ts` → add it to
`fixtures/index.ts`: `export const test = mergeTests(ui, projectsFixtures, ordersFixtures);`.
Copy the five golden files under `tests/golden/qa/scripts/shared/` and rename.

## Rules the linter enforces (`npm run heal:check` = tsc + eslint)

no `waitForTimeout` / `setTimeout` in specs · no `networkidle` · no `test.only` / bare `test.skip`
(conditional `test.skip(!db.configured, 'reason')` is the honest-gap idiom) · no `if` inside a
test (rows carry lookups) · every test asserts · no `force: true` · no element handles · `any`
forbidden · unused imports forbidden.

## Script naming & numbering

What a reader sees in a report, a trace or a file tree must lead straight back to the case. The
title and step rules are CONTRACTS §7 (Title); `npm run qa:lint` checks the ones marked *lint*.

**Files.** `scripts/<type>/[<surface>/]<module>/<case basename>.spec.ts` — the case path with
`cases/` → `scripts/` and `.md` → `.spec.ts` (k6: `.js`; unit: the framework's extension, §11).
One case = one file; a script with no mirrored case is a lint error.

**Test titles.** `<case id> — <case title text>`, the case H1 after the id, verbatim (*lint*:
another id is an error, a different text a warning):

```ts
test('TC-API-ORDERS-004 — [Orders] POST /orders — Owner creates an order for an active customer → 201, status Open', caseMeta({ … }), …);
```

Table-driven: `<case id> — row <Row>: <input> → <expected>`, where `<Row>` is the Row id of the
case's `## Variants` table — `a, b, c…` or `1, 2, 3…`, whatever the case uses, never an invented
number (*lint*: an unknown Row id is an error; a Variants row with no test is a warning). With a
typed `ROWS` array, each row's `id` is the Variants Row id.

**Steps.** `test.step('Step N: <action> → <expected>', …)`, N = the case's step number, 1..n in
order within one test, no gaps, no duplicates (*lint*: error). A case step the test cannot run says
so with a conditional `test.skip` inside its step — it is never renumbered away.

**Describe.** One case per file needs no `test.describe`. At most one level, and only to scope a
shared `test.use(…)`.

**Support code** (per module; the first case of a module bootstraps it, later cases extend it):

| File | Exports | Names inside |
|---|---|---|
| `endpoints/<module>.endpoints.ts` | `const <MODULE>` (UPPER_SNAKE) map | `list`, `byId(id)`, … — the only place a path is written |
| `services/<module>.service.ts` | `class <Module>Service` | one method per operation, verbs: `list` · `get` · `create` · `update` · `remove` · `<action>` |
| `data/<module>.factory.ts` | `class <Module>Factory` | `build()` (no I/O) · `create()` (cleanup registered) · `with<Thing>(…)` |
| `pages/<module>/<screen>.page.ts` | `class <Screen>Page` | locator getters are nouns, actions are verbs; never asserts |
| `components/<name>.component.ts` | `class <Name>` | a widget used by more than one page |
| `fixtures/<module>.fixture.ts` | `<module>Fixtures` | `<module>As`, `<module>Factory`, `<screen>Page`, `<screen>PageAs` |

**Data names.** Every name a test creates comes from `uniqueName('<entity>')` (`uniqueName('order')`,
`uniqueName('customer')`), never a literal that another run, worker or shard could also create.
