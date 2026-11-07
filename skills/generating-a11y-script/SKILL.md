---
name: generating-a11y-script
description: Use to generate a Playwright + axe-core spec from one TC-A11Y case: screen states, WCAG tags, keyboard, reflow; none for @manual.
version: 1.1.0
---

# Generating Accessibility Script (Playwright + axe-core)

> Profile first, by section (`profile.mjs`) — `§Test types` (is `accessibility` enabled),
> `§Accessibility` (target, failing impacts, viewports), `§Application under test` (element
> registry, frontend source), `§Environments`, `§Quality gates`. QA root defaults to `<qa-root>/`.

> **Project setup required:** `<qa-root>/scripts/shared/a11y/axe.ts` (shipped: `runAxe`,
> `expectNoA11yViolations`, `expectTabOrder`, `findingRows`), `@axe-core/playwright` in
> `<qa-root>/package.json`, `A11Y_FAIL_ON` in `<qa-root>/.env.<env>` (default `critical,serious`), and the
> `test:a11y` + `heal:check` scripts — referenced by these names below.

## Action
Generate ONE `.spec.ts` from ONE accessibility case. Locators for states and keyboard stops come
from the case's `## Data` (registry test ids) and page objects — never from a live DOM hunt.
Invoked by the `automation-engineer` agent via `/qa-script --type accessibility`.

## Input

| What | Where |
|---|---|
| The case | `<qa-root>/cases/accessibility/<module>/TC-A11Y-<MODULE>-<NNN>-<short-desc>.md` — contract format + `## WCAG ref` + `## Scope` |
| Case discovery | the plan's `## Traceability (Requirement ↔ Case)` table; fallback grep `**Feature:** <slug>` under `<qa-root>/cases/`. **NEVER glob `<slug>.md`.** |
| Locator truth | `<qa-root>/docs/element-registry.md` → `grounding-in-code` (`frontend:<path>#<component> @ <sha>`) — same hierarchy as `generating-e2e-script` |
| Shared layer | `<qa-root>/scripts/shared/a11y/axe.ts`; the e2e page objects and components, injected as `<module>Page` / `<module>PageAs(actor)` by `fixtures/<module>.fixture.ts`; factories to seed each state; `shared/constants/timeouts.ts` (see `shared/README.md`) |

## Output
- `<qa-root>/scripts/accessibility/<module>/<same-TC-basename>.spec.ts` — mirrors the case path 1:1.
- The case's traceability row flipped `Scripted` ❌ → ✅ (Step 6).
- `@manual` case → **no spec**; `Scripted` stays ❌; report it under `manual (by design)`.

## Grounding rules

| # | Rule |
|---|---|
| 1 | **State before scan.** Every axe run happens after an arrival assertion for the exact state the step names (element visible, modal open, error rendered) — scanning a half-rendered page proves nothing. |
| 2 | **Tags from the case's target.** `WCAG 2.2 AA` → the helper's default tags; a case that names a different target passes `tags` explicitly. Never add best-practice rules the case does not name. |
| 3 | **Exclude only what `## Scope` excludes**, with the reason copied into a comment. No silent `exclude`, no `disableRules` without the case's reviewed reason. |
| 4 | **Failing impacts come from `A11Y_FAIL_ON`** (env, default critical,serious); the spec never hard-codes a stricter or looser gate. Lower impacts are attached (`axe-<label>.json`) and listed in the run's `findings.md` by `executing-tests` — never suppressed. |
| 5 | **Keyboard order is asserted stop by stop** with `expectTabOrder(page, [...testIds])` using the case's registry ids in the case's order; focus visibility via a computed-style assertion when the case states it. No `page.keyboard.press` loops that only count Tabs. |
| 6 | **Focus management is asserted, not assumed**: dialog open → `toBeFocused()` on the element the case names; close → focus back on the trigger; background `aria-hidden`/`inert` when stated. |
| 7 | **Reflow = viewport, not zoom emulation**: `page.setViewportSize({ width: 320, height: 800 })` then assert `scrollWidth <= clientWidth` on the scrolling element (data tables the case exempts are asserted for their own horizontal scroll container). |
| 8 | **Status messages** → assert the live region attributes the case names (`role="status"`/`"alert"`, `aria-live`) and the text; announcement quality stays `manual`. |
| 9 | **Timeouts via `TIMEOUTS.*`**; no sleeps; `TIMEOUTS.A11Y_SCAN` for the scan step when needed. |
| 10 | **Never weaken to green.** A violation is a finding for triage (FUNCTIONAL — the product is inaccessible), never an `exclude` or a lowered gate. |
| 11 | **Verify ids live when `playwright-cli` is installed**: open the screen state, `snapshot`, and confirm every registry id the case's `expectTabOrder` names resolves to exactly one ref, in the case's order; a missing id stays `UNRESOLVED` with the snapshot cited. Absent the CLI, say the ids were not verified live. |

## Procedure

### 1. Parse the case + gates
Extract Case ID, slug, plan, tags, `## WCAG ref` (target + SC), `## Scope` (screen, states,
viewport, check kind, exclusions), steps, data. `@manual` / check kind `manual` → STOP for this
case: report `manual (by design)`, no spec. Completeness gate: ≥1 step + a real Expected.

### 2. Resolve states and stops
For each state: the data that produces it (a factory call — never UI clicks through other screens), the
page object / component that reaches it (reuse the e2e `shared/pages/*`, injected by fixtures;
extend, never duplicate), the arrival assertion element, and the registry test ids for
keyboard stops. Unresolvable → `// UNRESOLVED` + report, never a guess.

### 3. Write the spec

**Title mirrors the case** (CONTRACTS §7 Title; `qa:lint` checks it): the test title is `<case id> — <case H1 title text>` verbatim; a table-driven row is `<case id> — row <Row>: <input> → <expected>` with `<Row>` the case's `## Variants` Row id; steps are `test.step('Step N: <action> → <expected>')`, N = the case step number, 1..n. Naming of files and support code: `<qa-root>/scripts/shared/README.md` § Script naming & numbering.

One `test()` per case, one `test.step('Step N: …')` per case step (each state is a step); page
objects and components come from fixtures; the state is seeded through factories. Golden reference:
`tests/golden/qa/scripts/accessibility/projects/TC-A11Y-PROJECTS-001-list-and-dialog.spec.ts`.

```ts
import { test, expect, caseMeta } from '../../shared/fixtures';
import { expectNoA11yViolations, expectTabOrder } from '../../shared/a11y/axe';
import { storageStateFile } from '../../shared/auth/session';

// Generated from <qa-root>/cases/accessibility/orders/TC-A11Y-ORDERS-001-order-list-axe.md
// WCAG 2.2 AA — 1.4.3, 4.1.2, 2.4.7, 1.4.10 · screen /orders · states: default, dialog, 320px reflow
test.use({ storageState: storageStateFile('owner') });

test('TC-A11Y-ORDERS-001 — [Orders] Orders list, New order dialog — Owner opens both → no critical/serious violations', caseMeta({
  id: 'TC-A11Y-ORDERS-001', type: 'accessibility', module: 'orders', priority: 'P1', req: ['checkout/REQ-005'],
}), async ({ ordersPage, ordersFactory, page }, testInfo) => {
  await ordersFactory.create();                              // a populated list — seeded over the API

  await test.step('Step 1: default list state — 0 critical/serious violations', async () => {
    await ordersPage.goto();                                 // arrival assertion inside goto()
    await expectNoA11yViolations(page, testInfo, 'orders-list-default', {
      exclude: ['#third-party-chat'],                        // ## Scope: vendor widget, not ours
    });
  });

  await test.step('Step 2: toolbar keyboard order + visible focus', async () => {
    await expectTabOrder(page, ['orders-search-input', 'orders-filter-btn', 'orders-create-btn']); // registry ids, case order
    await expect(page.getByTestId('orders-create-btn')).toHaveCSS('outline-style', /^(?!none$)/);   // 2.4.7 as the case states it
  });

  await test.step('Step 3: the dialog has a name, takes focus, announces errors', async () => {
    await ordersPage.newOrderButton.click();
    await expect(ordersPage.newOrderDialog.root).toHaveAccessibleName('New order');
    await expect(ordersPage.newOrderDialog.field('Reference')).toBeFocused();
    await ordersPage.newOrderDialog.press('Create');
    await expect(ordersPage.newOrderDialog.field('Reference')).toHaveAccessibleDescription('Reference is required.');
    await expectNoA11yViolations(page, testInfo, 'orders-dialog-error');
  });

  await test.step('Step 4: reflow at 320 CSS px — no horizontal scroll', async () => {
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 320, height: 800 });
    await ordersPage.goto();
    const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth - document.scrollingElement!.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);                 // 1.4.10
  });
});
```

- No `new <Screen>Page(page)` in a spec, no `test.describe` wrappers, no shared data between
  states: each state is reached inside its own step from data the test seeded.
- A state that needs another actor (a member's view) → `<module>PageAs(pool[0])` after the factory
  granted the role; a time-dependent state (session expiry banner) → `page.clock`.
- `test.step('Step N: …')` for every case step; `// COVERAGE-GAP: Step N — reason` for a step that
  cannot be automated (report it).
- Identity: `caseMeta()` from the case's `**Tags:**` (`req: ['<slug>/REQ-NNN']`); `tms` never invented.


### 4. Findings hand-off
The helper attaches `axe-<label>.json` per scan. `executing-tests` numbers them into the run's
`findings.md` (`| ID | Severity | Source | Evidence | Affected REQ | Case | Status |`, ids
`A11Y-F-NNN`) — the spec does not write files itself.

### 5. Validate — offline gate
```bash
cd qa && npm run heal:check     # tsc + eslint (no sleeps / skip / only / conditionals; every test asserts)
```
Running belongs to `executing-tests` (`/qa-run --type accessibility` → `npm run test:a11y`).

### 6. Traceability write-back + report
Flip this Case ID's `Scripted` ❌ → ✅ in the plan; leave run columns. Report: spec path, states
covered, stops asserted, exclusions (with reasons), UNRESOLVED / COVERAGE-GAP list, manual cases
skipped by design.

## Done — ALL must be true
- [ ] Case located via traceability / `**Feature:**` grep — never a filename glob; `@manual` cases skipped and reported
- [ ] Spec mirrors the case path 1:1 under `<qa-root>/scripts/accessibility/<module>/`
- [ ] Every axe run follows an arrival assertion for the named state; tags from the case's target; exclusions only from `## Scope` with reasons
- [ ] Keyboard / focus / reflow / status-message steps asserted concretely per rules 5–8; no sleeps; timeouts from `TIMEOUTS.*`
- [ ] Gate impacts from `A11Y_FAIL_ON`; nothing suppressed or weakened
- [ ] One test per case, states as `test.step('Step N: …')`; states seeded via factories; page objects from fixtures (never `new`-ed); `caseMeta()` with slug-qualified `req`
- [ ] `heal:check` clean; `Scripted` flipped ✅; report delivered
