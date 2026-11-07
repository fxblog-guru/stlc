# WebdriverIO + Appium spec templates (reference for generating-mobile-script)

Templates match the agentic-fx `mobilewright-automation` layer contract:
**Test → Flow → Screen → Driver → Device**. A spec never touches a driver or a selector.
Imports use the framework's path aliases with the `.js` suffix (ESM + ts-node): `@flows/…`,
`@screens/…`, `@core/…`, `@utils/…`, `@gestures/…`, `@data/…`. Copy the sibling spec's exact style
when the project's aliases differ (`§Mobile testing` → Path aliases).

## 1. Single-journey spec (happy path, both platforms)

```ts
import { expect } from '@wdio/globals';
import { AuthFlow } from '@flows/AuthFlow.js';
import { OrdersScreen } from '@screens/orders/OrdersScreen.js';
import { AppLifecycle } from '@core/AppLifecycle.js';

// Generated from <qa-root>/cases/mobile/orders/TC-MOB-ORDERS-001-create-order.md
// Platforms: android, ios · Device profile: gate tier · Conditions: default
describe('TC-MOB-ORDERS-001 — Create an order from the app @smoke @critical', () => {
  const auth = new AuthFlow();
  const orders = new OrdersScreen();

  beforeEach(async () => {
    await AppLifecycle.restart();
    await auth.ensureLoggedIn('standard');
  });

  it('creates an order and shows it in the list', async () => {
    // Step 1: open Orders
    await orders.openFromHome();
    await expect(orders.isLoaded()).resolves.toBe(true);

    // Step 2: create the order
    const reference = `QA-${Date.now()}`;
    await orders.create({ reference, quantity: 1 });

    // Step 3: it appears with status Open
    expect(await orders.statusOf(reference)).toBe('Open');
  });
});
```

## 2. Data-driven negatives (boundary rows)

```ts
import { UserFactory } from '@data/UserFactory.js';

describe('TC-MOB-AUTH-002 — Login rejects invalid credentials @regression', () => {
  const login = new LoginScreen();

  beforeEach(async () => { await AppLifecycle.restart(); });

  // One `it` per row — every row is individually named and reportable.
  for (const row of UserFactory.invalidCredentials()) {
    it(`Step 2.${row.label}: shows an error and stays on login`, async () => {
      await login.login(row.username, row.password);
      expect(await login.isErrorShown()).toBe(true);
      expect(await login.errorMessage()).toContain('Invalid');
      await expect(login.isLoaded()).resolves.toBe(true);   // never navigates away
    });
  }
});
```

## 3. Device-condition specs

```ts
// Network
await Network.goOffline();
await orders.submitDraft();
expect(await orders.offlineBannerText()).toContain('No connection');
await Network.goOnline();

// Flapping network during submit → exactly one record
await Network.flap(3, 2000);
expect(await orders.countMatching(reference)).toBe(1);

// Permissions
await Permissions.set('camera', 'denied');
await capture.openCamera();
expect(await capture.permissionHintText()).toContain('camera access');
await Permissions.set('camera', 'granted');

// Interrupt: background 60 s mid-flow
await AppLifecycle.background(60);
await expect(orders.isLoaded()).resolves.toBe(true);

// Orientation
await SystemInteraction.setOrientation('LANDSCAPE');
expect(await orders.rowCount()).toBeGreaterThan(0);
await SystemInteraction.setOrientation('PORTRAIT');

// Android-only system back (platform delta stated in the case)
if (driver.isAndroid) {
  await SystemInteraction.pressBack();
  expect(await orders.isHomeVisible()).toBe(true);
}

// Deep link (cold start)
await AppLifecycle.terminate();
await DeepLink.open('orders/123');
await expect(orders.isLoaded()).resolves.toBe(true);

// WebView round trip
const html = await Contexts.inWebView(async () => $('#terms-title').getText());
expect(html).toContain('Terms');

// Biometrics (real device or enrolled simulator — REAL-DEVICE note when required)
await Biometrics.enroll();
await login.loginWithBiometrics();
await Biometrics.match();
await expect(home.isLoaded()).resolves.toBe(true);
```

## 4. Performance + accessibility signals

```ts
// Cold-start budget (the case states the budget and the ceiling)
const elapsed = await Performance.measureColdLaunch(() => login.isLoaded(), 5000);
expect(elapsed).toBeLessThan(15000);

// Transition budget
const { elapsedMs } = await Performance.measure('orders-list-open', () => orders.openFromHome());
expect(elapsedMs).toBeLessThan(3000);

// App-level accessibility of a new screen
expect(await A11y.findUnlabeledInteractive()).toEqual([]);
```

## 5. Static-gate forbidden tokens (the generator checks these before staging)

| Token | Why |
|---|---|
| `$(` · `$$(` · `driver.$` | raw locators in a spec — locators live on screen objects (rule 1) |
| `'~` · `android=new UiSelector` · `-ios predicate` · `//*[` | selector strings outside a screen object |
| `driver.pause(` · `browser.pause(` · `setTimeout(` | sleeps — wait on a predicate instead (rule 7) |
| `it.only` · `describe.only` · `xit(` · `it.skip` | focused/skipped leftovers |
| `driver.execute('mobile:` | bypasses a framework helper that already exists (rule 5) |
| `specFileRetries` · `@quarantine` added by the generator | retry/quarantine decisions belong to `/qa-quarantine` |
| a `describe` title without `TC-MOB-` | run output cannot map back to the traceability table |

## 6. HANDOFF row shape (CONTRACTS §15)

```
| Case ID | Staged script | Target path | Write mode | Status | Applied | Notes |
|---|---|---|---|---|---|---|
| TC-MOB-ORDERS-003 | <qa-root>/scripts/mobile/orders/TC-MOB-ORDERS-003-submit-order-offline.spec.ts | tests/regression/orders.offline.spec.ts | propose | proposed | — | FRAMEWORK-GAP: OrdersScreen.retrySubmit(), OrdersScreen.offlineBannerText() |
```

`Notes` carry, in this order: `FRAMEWORK-GAP:` (exact method signatures the mobile developers must
add), `extends <file>` when the spec appends to an existing suite file, `REAL-DEVICE: <reason>`,
`> Project setup required:` items (missing alias, missing suite dir), and the MR link once opened.
