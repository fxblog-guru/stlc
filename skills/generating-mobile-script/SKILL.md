---
name: generating-mobile-script
description: Use to script one TC-MOB case: a Maestro flow run in place, or a WebdriverIO + Appium spec staged with a HANDOFF row.
version: 1.0.0
---

# Generating Mobile Script (Maestro · WebdriverIO + Appium 2)

## Pick the path from the runner — first, every time
Read the Runner of each of the case's platforms in PROJECT-PROFILE §Platforms:
- **`maestro`** → write ONE flow at `<qa-root>/scripts/mobile/<module>/<same-TC-basename>.yaml` from the kit
  in `<qa-root>/scripts/shared/maestro/`, following
  [references/maestro-flows.md](references/maestro-flows.md). It runs from `<qa-root>/`: no HANDOFF row,
  no Write mode, no framework repo. Pass the static gate there, flip `Scripted` ✅, and stop. The
  rest of this file is the `appium-wdio` path.
- **`appium-wdio`** → the WebdriverIO spec below, staged with a HANDOFF row.
- Mixed (android on `maestro`, ios on `appium-wdio`) → one case still has ONE script, so STOP and
  ask which runner the case uses. `qa:lint` rejects a `.yaml` and a `.spec.ts` for the same case.

> Profile first, by section (`profile.mjs`) — `§Test types` (is `mobile` enabled), `§Mobile testing`
> (framework repo path, platforms, test dirs, test-file convention, path aliases, device matrix,
> Write mode, run commands), `§Quality gates`. QA root defaults to `<qa-root>/`.
> Contract: CONTRACTS §9.6 (the narrow write exception) and §15 (the handoff).

## The exception you hold — repeat it in every artifact
The mobile framework repo is **read-only except for its declared test directories**. You may write a
spec file there ONLY in Write mode `apply`, ONLY under `§Mobile testing` test dirs, and ONLY content
that is also staged under `<qa-root>/scripts/mobile/`. The framework's `src/` (screen objects, flows, utils,
config, capabilities) is never edited: a missing screen object, id, or helper is a **`FRAMEWORK-GAP`**
recorded in the HANDOFF Notes and handed to the mobile developers. In `propose` (the default) nothing
is written inside the framework repo at all.

## Action
Generate ONE `.spec.ts` from ONE mobile case: always staged at
`<qa-root>/scripts/mobile/<module>/<same-TC-basename>.spec.ts`, always an upserted row in
`<qa-root>/scripts/mobile/HANDOFF.md`, plus the framework-repo copy in `apply` mode. Invoked by the
`mobile-test-engineer` agent via `/qa-script --type mobile`.

## Input

| What | Where |
|---|---|
| The case | `<qa-root>/cases/mobile/<module>/TC-MOB-<MODULE>-<NNN>-<short-desc>.md` — contract format + `## Platforms` + `## Device profile` |
| Case discovery | the plan's `## Traceability (Requirement ↔ Case)` table; fallback grep `**Feature:** <slug>` under `<qa-root>/cases/mobile/`. **NEVER glob `<slug>.md`.** |
| Framework API | the repo at `§Mobile testing` → `src/screens/**` (screen objects + their accessibility ids), `src/flows/**`, `src/gestures`, `src/utils/**`, `src/data/**`, `src/core/**` — read-only, cited `mobile:<path>#<symbol> @ <sha>` |
| Conventions | a sibling spec in the framework's test dirs — copy its import style (path aliases + `.js` suffix), describe/it shape, tag placement, hooks |
| Target path | `§Mobile testing` test-file convention + the case's suite tag |

## Output
- `<qa-root>/scripts/mobile/<module>/<same-TC-basename>.spec.ts` (staged, always).
- An upserted `<qa-root>/scripts/mobile/HANDOFF.md` row (CONTRACTS §15 columns).
- Write mode `apply` → the identical file at the Target path inside a declared test dir, Status `applied`.
- The case's traceability row flipped `Scripted` ❌ → ✅ (Step 6) — even in `propose` mode.

## Grounding rules

| # | Rule |
|---|---|
| 1 | **Reuse the layers; never re-implement them.** Tests call flows; flows call screens; screens own locators. A spec contains **zero** `$()`/`$$()` calls and zero raw selector strings — if a screen object lacks the action, that is a `FRAMEWORK-GAP`, not an inline locator. |
| 2 | **One spec per case, Case ID in the describe title** (`describe('TC-MOB-ORDERS-003 — … @regression', …)`) plus the case's suite tag — the framework's Mocha `grep` selects on titles (CONTRACTS §15). The text after the id is the case H1 title (CONTRACTS §7 Title). |
| 3 | **`// Step N:` for every case step** (or an `it()` per step for independent steps); a step that cannot be automated is `// COVERAGE-GAP: Step N — <reason>`, reported, never silently dropped. |
| 4 | **Every Expected becomes an assertion** with its concrete value (`expect(await screen.status()).toBe('Open')`), never `isDisplayed()` standing in for a value claim. Platform-specific Expected deltas are asserted behind the framework's platform flag (`driver.isAndroid`) in ONE spec — never two twin specs. |
| 5 | **Device conditions go through the framework helpers**: `Network.goOffline/goOnline/flap`, `Permissions.set`, `AppLifecycle.background/restart/reinstall`, `SystemInteraction.pressBack/goHome/acceptAlert/setOrientation/openNotifications`, `DeepLink.open/openUniversal`, `Contexts.inWebView`, `Biometrics.match/noMatch`, `Gestures.*`. Never raw `driver.execute('mobile: …')` when a helper exists. |
| 6 | **Isolation**: `beforeEach` restarts the app (`AppLifecycle.restart()`); login as a precondition goes through `AuthFlow.ensureLoggedIn(role)`; the subject-under-test login uses `loginViaUi`. Data created by the spec comes from `UserFactory.generated()` so parallel workers never collide. |
| 7 | **No sleeps.** Waiting is `waitForDisplayed`/`waitUntil` with an explicit predicate (the screen objects already do it) or the framework's own timeout constants. `driver.pause()` is forbidden. |
| 8 | **No conditional assertions to dodge a platform**: `if (driver.isAndroid) expect(A) else expect(B)` is allowed ONLY when the case states both Expecteds; anything else is a COVERAGE-GAP. |
| 9 | **Device profile is honored, not hardcoded**: the spec never pins a device — `DEVICES`/`MATRIX` do that at run time. A case that says *real device required* gets a `// REAL-DEVICE: <reason>` header comment and the HANDOFF note, so the runner is not pointed at an emulator. |
| 10 | **Never weaken to green.** A failing device condition is a finding for `/qa-defect`, never a removed assertion, a retry bump, or a `@quarantine` tag added here (that is `/qa-quarantine`). |
| 11 | **Reads have three answers; claims keep their channel, subject and halves** (CONTRACTS §31, `qa-phase-protocol/references/verdict-integrity.md`). A screen object never maps "element not found / app not responding" to `false` or `''` — that is UNKNOWN, and it throws. What the case says the device *shows* is read from the device, not from the backend; the device condition the case names (offline, a permission denied, a background/restore) is the condition produced; "A and B" asserts both. The app build under test is part of the run's identity (`### Target identity`, kind `client`) |

## Procedure

### 1. Parse the case + gates
Extract Case ID, slug, plan, tags (suite tag!), `## Platforms`, `## Device profile`, preconditions,
steps (Action/Expected, incl. platform deltas), Expected Result, Data (ids, FRAMEWORK-GAPs).
Completeness gate: ≥1 step + ≥1 real Expected — else STOP and report the case back for enrichment.

### 2. Resolve the framework API (read-only) + inventory gaps
For every screen/action/id the case names: find the screen object and method in `src/screens/**`
(and flows in `src/flows/**`). Record for the report: **reused** (screen.method) vs **FRAMEWORK-GAP**
(missing screen object, method, or accessibility id — with the exact signature the developers should
add). A case whose whole journey is a gap is still staged (with the gaps marked `// FRAMEWORK-GAP`)
so the developers get one concrete list, not a conversation.

### 3. Derive the target path
`§Mobile testing` test-file convention + the case's suite tag → e.g. `@regression` +
`tests/<suite>/<module>.<kind>.spec.ts` → `tests/regression/orders.offline.spec.ts`. Undeclared
convention → STOP with the setup callout. An existing target file for the same module/kind → EXTEND
it (append the describe block) rather than creating a twin; the HANDOFF Notes say `extends <file>`.

### 4. Write the staged spec

```ts
import { expect } from '@wdio/globals';
import { AuthFlow } from '@flows/AuthFlow.js';
import { OrdersScreen } from '@screens/orders/OrdersScreen.js';
import { AppLifecycle } from '@core/AppLifecycle.js';
import { Network } from '@utils/network.js';
import { SystemInteraction } from '@utils/systemInteraction.js';

// Generated from <qa-root>/cases/mobile/orders/TC-MOB-ORDERS-003-submit-order-offline.md
// Platforms: android, ios · Device profile: gate tier · Conditions: network offline → online
// Framework API: mobile:src/screens/orders/OrdersScreen.ts#OrdersScreen @ a1b2c3d
describe('TC-MOB-ORDERS-003 — [Orders] Orders screen — Driver submits a draft offline, then reconnects → exactly one Open order @regression', () => {
  const auth = new AuthFlow();
  const orders = new OrdersScreen();

  beforeEach(async () => {
    await AppLifecycle.restart();            // isolation: every case starts from a known state
    await auth.ensureLoggedIn('standard');   // precondition, not the subject
  });

  afterEach(async () => {
    await Network.goOnline();                // never leave the device offline for the next spec
  });

  it('keeps the draft offline and creates exactly one order when back online', async () => {
    // Step 1: open the Orders screen from Home
    await orders.openFromHome();
    await expect(orders.isLoaded()).resolves.toBe(true);

    // Step 2: submit while offline → clear message, draft kept, nothing created
    await Network.goOffline();
    await orders.submitDraft();
    expect(await orders.offlineBannerText()).toContain('No connection');
    expect(await orders.draftIsPresent()).toBe(true);

    // Step 3: back online + retry → exactly one order
    await Network.goOnline();
    await orders.retrySubmit();
    expect(await orders.countMatching('QA draft')).toBe(1);   // read-back, not the button's own feedback
    expect(await orders.statusOf('QA draft')).toBe('Open');

    // Step 4: background 60 s → session and list survive
    await AppLifecycle.background(60);
    await expect(orders.isLoaded()).resolves.toBe(true);
    if (driver.isAndroid) {
      // Expected (android) from the case: system back returns to Home, not to login
      await SystemInteraction.pressBack();
      expect(await orders.isHomeVisible()).toBe(true);
    }
  });
});
```

Import style, alias prefixes and the `.js` suffix come from `§Mobile testing` → Path aliases and the
sibling spec — copy them exactly; a wrong alias is a compile error in the framework repo.

### 5. Stage + HANDOFF (+ apply)
1. Write the staged file at `<qa-root>/scripts/mobile/<module>/<same-TC-basename>.spec.ts`.
2. Upsert the HANDOFF row (identity = Case ID):
   `| TC-MOB-ORDERS-003 | <qa-root>/scripts/mobile/orders/TC-MOB-ORDERS-003-….spec.ts | tests/regression/orders.offline.spec.ts | propose | proposed | — | FRAMEWORK-GAP: OrdersScreen.retrySubmit() missing |`
3. Write mode `apply` → write the identical content at the Target path (refuse any path outside the
   declared test dirs — that refusal is a report line, not a negotiation), Status `applied`, `Applied`
   = today.

### 6. Validate — offline gate, then traceability write-back
**Static gate (always):** Case ID in the describe title · suite tag present and matching the case ·
`// Step N` coverage for every step (or a reasoned COVERAGE-GAP) · ≥1 real assertion per `it` · zero
`$(`/`$$(`/raw selector strings · zero `driver.pause(`/`browser.pause(` · every import resolves to a
symbol that exists in the framework repo at HEAD (else FRAMEWORK-GAP) · helpers used for device
conditions · `beforeEach` isolation present.
**Compile gate (when evaluable):** run the framework's own type check from its repo
(`npm run typecheck`) — read-only, never `npm install`, never a test run. Not evaluable (no
node_modules) → say so in the report; never skip the static gate.
**Never run the tests here** — `/qa-run --type mobile` owns the devices and the evidence folder.

Then flip this Case ID's `Scripted` ❌ → ✅ in the plan (only after a clean static gate); leave
`Last run`/`Status`/`Report` to `executing-tests`.

## Report (to the agent, not the user)
Spec path (staged + target), Write mode and HANDOFF Status, reused framework API vs FRAMEWORK-GAPs
(with the exact method signatures developers should add), COVERAGE-GAPs, real-device requirements,
compile-gate result, traceability row flipped.

## Done — ALL must be true
- [ ] Case located via traceability / `**Feature:**` grep — never a filename glob
- [ ] Staged spec at `<qa-root>/scripts/mobile/<module>/<same-TC-basename>.spec.ts`; HANDOFF row upserted with the Target path derived from the convention + suite tag
- [ ] Write mode honored: `propose` writes nothing in the framework repo; `apply` writes ONLY inside a declared test dir (anything else refused and reported)
- [ ] Case ID + suite tag in the describe title; `// Step N` coverage complete; every Expected asserted with its value; platform deltas in ONE spec
- [ ] Zero raw locators, zero `pause()`, device conditions through the framework helpers, isolation in `beforeEach`
- [ ] Framework `src/` untouched; every missing piece recorded as a FRAMEWORK-GAP in HANDOFF Notes and the report
- [ ] Static gate clean (+ compile gate when evaluable); `Scripted` flipped ✅
