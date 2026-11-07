---
name: generating-e2e-script
description: Use to generate a Playwright spec from one TC-E2E case with grounded locators (registry → testid → role).
version: 1.1.0
---

# Generating E2E Script (Playwright TypeScript)

> Profile first, by section (`profile.mjs`) — `§Test types` (is e2e enabled; tool choice),
> `§Environments` (base URLs), `§Application under test` (frontend source checkout, if any),
> `§Quality gates`. QA root below is the default `<qa-root>/` (profile-overridable).

> **Project setup required:** an **element registry / data-testid convention** at
> `<qa-root>/docs/element-registry.md` — the committed map of stable selectors per screen: `data-testid`
> values, ARIA roles + accessible names, form labels (or the app's own testid map, referenced from
> that file). Build it from the app's frontend source; keep it in review like code. If the app uses
> a different test-id attribute (`data-test`, `data-cy`), the registry declares it and the
> Playwright config sets `testIdAttribute` to match.

> Shipped: `<qa-root>/package.json` scripts `test:e2e` (Playwright runner) and `heal:check` (`tsc --noEmit` +
> `<qa-root>/eslint.config.mjs` — no sleeps / `networkidle` / skip / only / conditionals in tests / tests
> without assertions); the kit under `<qa-root>/scripts/shared/` (read its `README.md`): `pages/base.page.ts`
> (`goto()` ends in an arrival assertion), `components/` (`Dialog`, `DataTable` — found by accessible
> name), `fixtures/` (`page` signed in as `TEST_USER` by the setup project's storageState; `pageAs(actor)`
> for any other actor in its own browser context; `pool`, `cleanup`, services and factories), `meta.ts`
> (`caseMeta`), `data/unique.ts` (`uniqueName`), `constants/timeouts.ts`. Browser projects come from
> `PW_PROJECTS` (PROJECT-PROFILE §Browsers & devices); a case that names a device/viewport states it in `## Data`.
> **Golden reference** (run green by `node tests/golden/run.mjs` in the bundle repo):
> `tests/golden/qa/scripts/e2e/projects/*.spec.ts`, `shared/pages/projects/projects.page.ts`,
> `shared/fixtures/projects.fixture.ts`. Long templates: `references/e2e-templates.md`.

## Action

Generate ONE `.spec.ts` from ONE e2e test case. **No browser is opened at generation time** —
locators come from the element registry and the app's frontend source only; behavior comes from
the case. Invoked by the `automation-engineer` agent via `/qa-script --type e2e`.

## Input

| What | Where |
|---|---|
| The e2e case | `<qa-root>/cases/e2e/<module>/TC-E2E-<MODULE>-<NNN>-<short-desc>.md` — the contract case format (header lines `**Feature:**`/`**Plan:**`/`**Type:**`/`**Module:**`/`**Priority:**`/`**Tags:**`, then `## Preconditions`, `## Steps`, `## Expected Result`, `## Data`) |
| Case discovery | The plan's `## Traceability (Requirement ↔ Case)` table in `<qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md`; fallback: grep `**Feature:** <slug>` under `<qa-root>/cases/`. **NEVER glob `<slug>.md` filenames.** |
| Locator truth | `<qa-root>/docs/element-registry.md`; then the app's frontend source (templates / components) when checked out per `§Application under test` |
| Shared layer | `<qa-root>/scripts/shared/` — `pages/<module>/*.page.ts` (page objects, injected as `<module>Page` / `<module>PageAs(actor)` by `fixtures/<module>.fixture.ts`), `components/` (dialogs, tables), `services/` + `data/<module>.factory.ts` (API seeding for preconditions), `constants/timeouts.ts` (see `shared/README.md`) |

## Output

- `<qa-root>/scripts/e2e/<module>/<same-TC-basename>.spec.ts` — **mirrors the case path 1:1**
  (`<type>/<module>/<same-TC-name>.<ext>`). Same basename, same casing; never rename.
- Extended (never duplicated) shared files under `<qa-root>/scripts/shared/` where needed.
- The case's row in the plan's traceability table flipped `Scripted` ❌ → ✅ (Step 8).

## Locator hierarchy — STRICT, in this order

| # | Source | Use as |
|---|---|---|
| 1 | **Element registry** entry in `<qa-root>/docs/element-registry.md` | verbatim — the registry is the team's proven selector map |
| 2 | **`data-testid`** found in the app's frontend source through `grounding-in-code` (Code KB `frontend` per `§Code knowledge` → read-only source grep), cited `frontend:<path>#<component> @ <sha>` in the spec header | `page.getByTestId('order-save-btn')` |
| 3 | **Role / label / placeholder / exact text** derivable from the UI element the case names, confirmed against the app source through `grounding-in-code` when available | `page.getByRole('button', { name: 'Save' })` · `page.getByLabel('Customer name')` |
| 4 | Nothing resolves | `// UNRESOLVED: <element> — not in registry or app source` on that line + list it in the report. **Never guess.** |

**Forbidden:** brittle CSS chains (`div > div:nth-child(3)`), XPath, auto-generated framework
class names, index-based picks (`.nth(2)` to "find" an element), and **live-DOM guessing**
(opening the app to hunt for a selector at generation time). A selector that cannot be grounded
in tiers 1–3 is an UNRESOLVED gap to report — not a guess to embed.

## Grounding rules

| # | Rule |
|---|---|
| 1 | **Every `test.step` comes from a case step.** One `test.step('Step N: <action> → <expected>')` per numbered case step, in case order (N = the case step number, 1..n — lint). The test title is `<case id> — <case H1 title>` (CONTRACTS §7 Title). Never merge, reorder, drop, or add steps the case does not contain. |
| 2 | **Every assertion comes from an Expected.** Each step's `Expected` → at least one `expect(...)`; the case's `## Expected Result` → the final assertion block. No assertion may claim something no Expected states — and no Expected may go unasserted. |
| 3 | **Assert the stated value, not a proxy.** An Expected that names a value/status/count gets `toBe`/`toEqual`/`toHaveText` against that value — never `toBeTruthy`, `length > 0`, or "element visible" standing in for a concrete claim. |
| 4 | **UI claims are proven on the rendered DOM.** What the case says is *shown* is read from the page, never from an API response. API calls may SEED state (preconditions), never substitute for the on-screen assertion. |
| 5 | **The tested action is driven through the real UI flow.** Preconditions may be built via API service clients (faster, stabler); the action the case exists to verify is always clicked/typed through the page. |
| 6 | **No invented data.** Values come from the case's `## Data` (or the factory it references); uniqueness via `uniqueName('<label>')` — never `Date.now()`/`Math.random()`. Assertions on a seeded entity locate it by its unique name. |
| 7 | **Self-provision preconditions through services/factories, never the UI.** `## Preconditions` describe a state — the spec *creates* it with `<module>Factory.create()` / `.withMember(role, pool[0])` (each registers its own cleanup). Never rely on "whatever data happens to exist"; never click through screens the case is not about. |
| 7a | **One intent per test, parallel-safe.** One `test()` per case, `test.step('Step N: …')` per case step. No `test.describe.serial`, no `beforeAll`/`afterAll`/`afterEach` data, no `let` shared between tests. Anything the UI creates is put on the ledger at once: `cleanup.add(label, undo)` before the step that creates it. |
| 7b | **Actors.** The default `page` is `TEST_USER`; a named actor's journey uses `test.use({ storageState: storageStateFile('owner') })`; a per-object role is granted to `pool[0]` by the factory and driven with `<module>PageAs(account)` — which is also how a second actor joins one test. Never a UI login. |
| 7c | **Page objects and components come from fixtures** (`ordersPage`, `ordersPageAs(actor)`) — a spec never `new`s one and holds zero raw `page.locator()`/CSS/XPath; dialogs and tables go through `Dialog`/`DataTable`. |
| 7d | **Structure → aria snapshot; time → Clock API.** "The screen shows these columns/controls" → `toMatchAriaSnapshot` (regex for generated values), not a screenshot. Time-dependent behaviour → `page.clock.install()` / `setFixedTime()` / `fastForward()` before the action, never real waiting. |
| 7e | **Identity via `caseMeta()`** — values from the case's `**Tags:**`, `req: ['<slug>/REQ-NNN']`; `lock:` only for shared state that cannot be isolated (a product-wide setting), with the reason. |
| 8 | **Timeouts via named constants only** — `TIMEOUTS.*` from `<qa-root>/scripts/shared/constants/timeouts.ts` (e.g. `NAVIGATION`, `FIELD_VISIBLE`, `MODAL_CLOSE`, `API_RESPONSE`). No fits? ADD a named constant; never inline a literal. No `page.waitForTimeout()` / fixed sleeps, no `waitUntil: 'networkidle'`, no `test.setTimeout` > 60s. |
| 9 | **REUSE > CREATE.** A page object for the screen exists → extend it; an endpoint/service/timeout constant exists → add to the existing file. New files only when the module has none. Record "Reused vs Created" in the report. |
| 10 | **A step that genuinely cannot be automated** (hard environment/business blocker) is not silently dropped: assert what IS observable and mark `// COVERAGE-GAP: Step N — <reason>`; list every gap in the report. |
| 11 | **Never weaken an assertion to make the script plausible.** If the case's Expected looks wrong against the app source, generate faithfully to the case and report the discrepancy — the case is the contract; changing it belongs to `case-designer`. |
| 12 | **Reads have three answers; claims keep their channel, subject and halves** (CONTRACTS §31, `qa-phase-protocol/references/verdict-integrity.md`). A page object or helper never turns "could not read" into a value (`count().catch(() => 0)`, `isVisible().catch(() => false)` — `qa:lint` rejects them without `// unknown-ok: <reason>`). What the case says is *seen* is read from the screen, not from an easier API; the subject the case names is the subject prepared; "A and B" asserts both; a `test.step` performs its action, never only its title. Transient evidence (toast, modal) is captured inside its own step |

## Procedure

### 1. Parse the case + completeness gate
Read the case file. Extract: Case ID, title, Feature slug, Plan path, Tags, Preconditions,
numbered Steps (Action/Expected pairs), Expected Result, Data. Classify each step:
`PRECONDITION | NAVIGATION | ACTION | ASSERTION`.

**Completeness gate (before any authoring):** the case is automatable only if it has BOTH ≥1
numbered step AND ≥1 real Expected (a step `Expected` or an `## Expected Result` that is not a
placeholder). Missing either → **STOP**, report the case back for enrichment (automating it would
mean inventing the assertion — not a test).

### 2. Resolve every locator through the hierarchy
For each UI element the steps name, walk tiers 1→4 above. Record the tier used per locator
(reported in Step 8). Consult the app's frontend source for custom-component quirks (a custom
select may render its options outside the field's subtree) — interact via the pattern the source
proves, never raw guesses.

**Live verification when `playwright-cli` is installed** (`playwright-cli --version` succeeds and
`<qa-root>/.env.<env>` names a reachable `BASE_URL`): reconnaissance before action — open the screen the
step names, wait for it to settle, take a `snapshot`, and confirm each resolved locator matches
exactly one ref before writing it. A locator that matches zero or several refs stays `UNRESOLVED`
with the snapshot cited; the registry is corrected by a human, never silently by this skill. Absent
the CLI, tiers 1–3 are the evidence and the report says the locators were not verified live.

### 3. Inventory reuse targets
For each screen/entity touched: does `shared/pages/<module>/` have a page object, and does
`fixtures/<module>.fixture.ts` inject it (`<module>Page`, `<module>PageAs`)? Does the module have a
service + factory for seeding? Is the widget a dialog/table that a `components/` class already
covers? Extend what exists; create only what is missing (copy the golden `projects` files). Locators
live on page objects and components — the spec body contains **zero** raw `page.locator()` /
`page.getBy*()` calls when a page object covers that screen.

### 4. Map steps → code
- `PRECONDITION` → `<module>Factory.create()` / `.withMember(role, pool[0])` (API, registers its own
  cleanup); a role on a named actor → `test.use({ storageState: storageStateFile('<actor>') })`.
- `NAVIGATION` → `<module>Page.goto()` — `BasePage.goto()` ends in the arrival assertion (URL +
  the screen's anchor element); a lone `waitForURL` is a wait, not a verification.
- `ACTION` → page-object / component method using the resolved locator. Something the UI creates →
  `cleanup.add(label, undo)` registered BEFORE the step that creates it (find it by its unique name).
- `ASSERTION` → web-first `expect(...)` per grounding rules 2–4; structure → `toMatchAriaSnapshot`.

### 5. Write the spec

```ts
import { test, expect, caseMeta } from '../../shared/fixtures';
import { uniqueName } from '../../shared/data/unique';
import { storageStateFile } from '../../shared/auth/session';

// Generated from <qa-root>/cases/e2e/orders/TC-E2E-ORDERS-003-create-order-for-customer.md
test.use({ storageState: storageStateFile('owner') });      // the case's actor (named, global role)

test('TC-E2E-ORDERS-003 — [Orders] New order dialog — Owner creates an order for an existing customer → listed as Open', caseMeta({
  id: 'TC-E2E-ORDERS-003', type: 'e2e', module: 'orders', priority: 'P1', req: ['checkout/REQ-012'],
}), async ({ ordersPage, customersFactory, ordersAs, cleanup }) => {
  const customer = await customersFactory.create();          // Precondition — seeded over the API, cleaned up by the ledger
  const reference = uniqueName('ui-order');
  cleanup.add(`order ${reference}`, async () => {             // the UI will create it: register the undo first
    const owner = await ordersAs('owner');
    for (const o of (await owner.list({ reference })).body.items) await owner.remove(o.id);
  });

  await test.step('Step 1: open the Orders screen → the list renders', async () => {
    await ordersPage.goto();                                  // arrival assertion inside goto()
  });
  await test.step('Step 2: create an order for the customer → the dialog closes', async () => {
    await ordersPage.createOrder({ customer: customer.name, reference });   // Dialog component inside
  });
  await test.step('Step 3: find the order → listed with status "Open"', async () => {
    await expect(await ordersPage.table.cell(reference, 'Status')).toHaveText('Open');   // from the step's Expected
  });
});
```

Two actors in one journey (Owner arranges over the API, a member sees it in their own browser) —
`tests/golden/qa/scripts/e2e/projects/TC-E2E-PROJECTS-003-member-sees-granted-project.spec.ts`:

```ts
}), async ({ pool, projectsFactory, projectsPageAs }) => {
  const [account] = pool;                                     // this worker's own account
  const project = await projectsFactory.withMember('member', account);
  const memberPage = await projectsPageAs(account);           // own context, signed in by the setup project
  await test.step('Step 1: the member opens Projects', async () => { await memberPage.goto(); });
  await test.step('Step 2: the project is listed with role "member"', async () => {
    await expect(await memberPage.table.cell(project.name, 'Your role')).toHaveText('member');
  });
});
```

More shapes — negative dialog, aria snapshot, Clock API, page-object + fixture bootstrap — are in
`references/e2e-templates.md`.

- **Identity**: `caseMeta()` with the values of the case's `**Tags:**` line (`<qa-root>/docs/tag-taxonomy.md`):
  type, module, priority, `suites`, `req: ['<slug>/REQ-NNN']`, and `tms`/`defect`/`quarantinedUntil`
  only if the case already carries them — never fabricated.
- `test.step('Step N: …')` for **every** case step, in order; gaps only as `// COVERAGE-GAP` with a reason.

### 6. Teardown + traces
- Nothing to write: factories register their undo at creation, and anything the UI creates was put
  on the ledger with `cleanup.add` before the step that creates it. The `cleanup` fixture runs the
  ledger after the test, newest first, whatever the outcome — no `afterEach`, no `finally`.
- **Keep-on-fail:** `QA_KEEP_ON_FAIL=1` keeps a failed test's data for reproduction (annotated
  `kept`; the sweeper removes it later by its `qa-<QA_RUN_ID>` prefix). Traces/screenshots are
  retained on failure by `<qa-root>/playwright.config.ts` and land under the run dir
  `<qa-root>/runs/e2e/<slug>/<run-id>/` when executed via `executing-tests`.

### 7. Validate — offline gate
```bash
cd qa && npm run heal:check     # tsc 0 · eslint 0 (shipped config)
```
Fix everything it reports. Do not run the test here — running belongs to `executing-tests`
(`/qa-run`); a runtime failure later is healed via `healing-e2e-script` (`/qa-heal`).

### 8. Traceability write-back + report
Only after Step 7 is clean: open the plan named in the case's `**Plan:**` line, find this Case ID's
row in `## Traceability (Requirement ↔ Case)`, flip `Scripted` ❌ → ✅. Leave `Last run` / `Status`
/ `Report` untouched — `executing-tests` owns those columns. Missing row → append it (from the
case header) with `Scripted` ✅ and note the repair in the report.

Report: spec path, locator source per element (registry / testid / role-label), UNRESOLVED count,
COVERAGE-GAP list, reused-vs-created inventory, traceability row(s) flipped.

## Done — ALL must be true

- [ ] Case located via the plan's traceability table or the `**Feature:**` grep — never a filename glob
- [ ] Completeness gate passed (≥1 step + real Expected) — or STOPPED and reported, no spec written
- [ ] Spec path mirrors the case path 1:1 under `<qa-root>/scripts/e2e/<module>/`, basename identical
- [ ] Every locator from tier 1–3, or carries `// UNRESOLVED` — zero CSS chains/XPath/nth/live-DOM guesses
- [ ] One `test.step('Step N: …')` per case step, in order; gaps as `// COVERAGE-GAP: Step N — reason`
- [ ] Every Expected asserted with its concrete value; zero assertions without an Expected
- [ ] Tested action driven through the UI; preconditions seeded through services/factories (never the UI); second actors via `<module>PageAs(pool account)`
- [ ] Timeouts via `TIMEOUTS.*` only; no `waitForTimeout`/sleeps/`networkidle`; no `test.setTimeout` > 60s
- [ ] Parallel-safe: one test per case, no `describe.serial`/hooks with data/shared `let`, names from `uniqueName()`, everything created on the `cleanup` ledger; page objects from fixtures, never `new`-ed; aria snapshot for structure, Clock API for time
- [ ] `caseMeta()` from the case's Tags, slug-qualified `req`; `tms` never invented; `lock` only with a reason
- [ ] `npm run heal:check` clean (tsc 0 · eslint 0)
- [ ] Traceability `Scripted` flipped to ✅ for this Case ID — only after the check passed
- [ ] Report delivered: spec path, locator tiers, gaps, reuse inventory
