# UI spec templates (generating-ui-script)

All imports come from `../../shared/fixtures`. Module names below are neutral examples (orders,
invoices); the working reference is `tests/golden/qa/scripts/ui/projects/`.

## 1. Visual rows — one test per state × viewport

```ts
import { test, caseMeta, expectVisual } from '../../shared/fixtures';
import { uniqueDigits } from '../../shared/data/unique';

const ROWS = [
  { id: 'e320', state: 'empty', width: 320 }, { id: 'p320', state: 'populated', width: 320 },
  { id: 'p1280', state: 'populated', width: 1280 },
] as const;
const SEED = { empty: 0, populated: 3 } as const;           // a lookup: no branches in the test

for (const row of ROWS) {
  test(`TC-UI-ORDERS-001 — row ${row.id}: ${row.state}, ${row.width} px → matches orders-list-${row.state}-${row.width}`, caseMeta({
    id: 'TC-UI-ORDERS-001', type: 'ui', module: 'orders', priority: 'P2', req: ['checkout/REQ-004'], platform: ['web'],
  }), async ({ pool, ordersFactory, ordersPageAs }) => {
    const [account] = pool;                                  // sees only what it was granted → exact states
    for (let i = 0; i < SEED[row.state]; i++) await ordersFactory.forAccount(account, { reference: `Order ${uniqueDigits('ui')}` });
    const ordersPage = await ordersPageAs(account);

    await test.step(`Step 1: open Orders at ${row.width} px → matches the baseline`, async () => {
      await ordersPage.page.setViewportSize({ width: row.width, height: 900 });
      await ordersPage.goto();
      await expectVisual(ordersPage.page, `orders-list-${row.state}-${row.width}`, {
        mask: [ordersPage.references, ordersPage.createdDates],   // ## Visual baseline: unique per run
      });
    });
  });
}
```

## 2. Layout rules at the narrowest viewport

```ts
import { test, caseMeta, expectNoHorizontalScroll, expectNoOverflow, expectNoOverlap, expectTouchTargets } from '../../shared/fixtures';

test.use({ viewport: { width: 320, height: 900 } });

test('TC-UI-INVOICES-002 — [Invoices · Web] Invoices list — Clerk opens it with the longest customer name at 320 px → no sideways scroll, nothing clipped', caseMeta({
  id: 'TC-UI-INVOICES-002', type: 'ui', module: 'invoices', priority: 'P2', req: ['billing/REQ-002'], platform: ['web'],
}), async ({ invoicesFactory, invoicesPage }) => {
  await invoicesFactory.create({ customer: 'C'.repeat(120) });   // the API's maximum (BVA)
  const body = invoicesPage.page.locator('body');

  await test.step('Step 1: open Invoices → no horizontal page scroll', async () => {
    await invoicesPage.goto();
    await expectNoHorizontalScroll(invoicesPage.page);
  });
  await test.step('Step 2: measure → nothing clips, controls usable', async () => {
    await expectNoOverflow(body);
    await expectNoOverlap(body);
    await expectTouchTargets(body, 24);                       // WCAG 2.5.8
  });
});
```

## 3. Component state on shared data (dialog, card)

```ts
await test.step('Step 2: screenshot the dialog → matches new-order-dialog-error-320', async () => {
  await expectVisualOf(ordersPage.newOrderDialog.root, 'new-order-dialog-error-320');
});
```

## 4. Loading and error states with `page.route`

```ts
await test.step('Step 1: the list call fails → the error banner matches its baseline', async () => {
  await ordersPage.page.route('**/api/orders?**', (route) => route.fulfill({
    status: 503, contentType: 'application/problem+json',
    body: JSON.stringify({ type: 'https://example.test/problems/unavailable', title: 'unavailable', status: 503, detail: 'Try again later.' }),
  }));
  await ordersPage.goto();
  await expectVisual(ordersPage.page, 'orders-list-error-1280');
});
```
A loading state: `route.continue()` behind a promise the test resolves after the screenshot of the
skeleton — never a timer.

## 5. Design tokens (only with a declared token file)

```ts
// PROJECT-PROFILE §UI testing → design/tokens.json: color.primary = rgb(29, 78, 216), space.button-x = 14px
await expectTokens(ordersPage.newOrderButton, { 'background-color': 'rgb(29, 78, 216)', 'padding-left': '14px' });
```

## 6. Desktop (Electron) — platform windows / macos

```ts
import { test, expect, caseMeta, expectNoHorizontalScroll, expectVisual } from '../../shared/fixtures';

test('TC-UI-INVOICES-005 — [Invoices · Windows] Main window — Clerk opens the app → matches the baseline', caseMeta({
  id: 'TC-UI-INVOICES-005', type: 'ui', module: 'invoices', priority: 'P3', req: ['billing/REQ-001'], platform: ['windows'],
}), async ({ appWindow }) => {                                   // skips with the reason when ELECTRON_APP_PATH is unset
  await test.step('Step 1: first window → titled, no sideways scroll, matches the baseline', async () => {
    await expect(appWindow).toHaveTitle(/Invoices/);
    await expectNoHorizontalScroll(appWindow);
    await expectVisual(appWindow, 'invoices-main-window');
  });
});
```
Runs only in the `desktop-electron` project (`PW_PLATFORMS=windows` or `PW_PROJECTS=desktop-electron`);
its baselines land in `__screenshots__/<os>/desktop-electron/…`.

## Baseline workflow (state it in the report)

| Where | Command | Folder |
|---|---|---|
| CI image (truth) | `npm run test:ui:update` in the manual `qa:ui-baselines` job, then commit the reviewed `linux/` PNGs | `<qa-root>/scripts/ui/__screenshots__/linux/<project>/…` |
| Local, first time | `npm run test:ui -- --update-snapshots=missing` | `…/win32/…` or `…/darwin/…` |
| Intended change | `npm run test:ui:update` (= `--update-snapshots=changed`) in CI; review each diff image | only the changed PNGs |
