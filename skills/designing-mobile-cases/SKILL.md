---
name: designing-mobile-cases
description: Use to design TC-MOB cases: one journey for both platforms plus device reality (interrupts, offline, permissions, deep links).
version: 1.0.0
---

# Designing Mobile Test Cases (Android + iOS)

> Profile first, by section (`profile.mjs`) — `§Test types` (is `mobile` enabled), `§Mobile testing`
> (framework repo, platforms, device matrix + tiers, test dirs, conventions, Write mode),
> `§Application under test` (the API the app talks to), `§Quality gates`, `§Domain knowledge`.
> QA root defaults to `<qa-root>/`. Contract: CONTRACTS §7 (`## Platforms` / `## Device profile`) and §15.

> **Domain grounding**: personas, business rules (`BR-###`) and terms resolve through
> `<qa-root>/wiki/compiled/index.md` when it exists (cite page + `sources:`); wiki silence is a gap.
> **Code grounding**: screen names, accessibility ids, deep-link schemes and app ids resolve through
> `grounding-in-code` against the app repo and the mobile framework's `src/screens/` — cited
> `<layer>:<path>#<symbol> @ <sha>` in `## Data`. Never invent an accessibility id.

## Prime directive — one journey, two platforms, and the device reality
A mobile case states the business intent ONCE; the platform difference belongs in the framework's
`Selector` layer, not in two twin cases. What justifies a separate case is a different *behaviour*
(iOS permission dialog wording, Android back button, platform-only feature) — not a different
locator. And the value this tier adds over api/e2e is the **device reality**: the call that arrives
mid-checkout, the tunnel that kills the network, the permission the user denied, the app killed in
the background, the tablet in landscape. A mobile suite that only re-tests the happy path the web
tier already covers is waste.

## Action
Design mobile cases for one feature slug — **one file per case** under `<qa-root>/cases/mobile/<module>/` —
and append their rows to the plan's traceability table. `generating-mobile-script` turns them into
WebdriverIO specs staged under `<qa-root>/scripts/mobile/` and handed to the mobile developers through
`<qa-root>/scripts/mobile/HANDOFF.md` (`/qa-script --type mobile`, run by `test:mobile`).

## Inputs — resolve before designing (STOP conditions)
1. `<slug>`; latest analysis (REQ-ids, personas, journeys) and plan with the traceability skeleton — missing → STOP.
2. `mobile` enabled in `§Test types` AND `§Mobile testing` filled (framework repo path, platforms,
   device matrix, test dirs, convention). Enabled-but-unconfigured → STOP with
   `> **Project setup required:** fill PROJECT-PROFILE §Mobile testing`.
3. **Screen + id inventory**, in order: the mobile framework's `src/screens/**` (the accessibility
   ids that already exist), the app repo's source through `grounding-in-code`, the analysis UI REQs,
   existing mobile cases. An id that exists nowhere is a `FRAMEWORK-GAP` note on the case, never a guess.
4. The e2e cases for the same journeys (`<qa-root>/cases/e2e/`) — read them to avoid re-testing the web
   flow; the mobile case exists for the app's own behaviour and the device conditions.

## Step 1: Scope — what belongs to this tier
| Belongs in `mobile` | Belongs elsewhere |
|---|---|
| App journeys a user completes on the phone (login, order, pay, upload, offline capture) | Pure API contract → `api` · DB seam → `integration` |
| Device conditions: interrupt, background/foreground, network loss, permissions, orientation, storage, battery-saver, locale | Web-only screens → `e2e` |
| Platform behaviours: Android back/recents, iOS swipe-back, push handling, deep/universal links, WebView tabs, biometrics | Pure in-process logic of the mobile app → `unit` (app repo's own framework, via §Unit testing) |
| App-level accessibility (labelled controls, dynamic type) | Web WCAG → `accessibility` |
| Cold-start/perf budgets the framework measures (`Performance.measureColdLaunch`) | Server load → `performance` |

## Step 2: Case seeds (minimums per feature)
Walk `references/mobile-heuristics.md`; for each row design cases for the surfaces it applies to, or
record `N/A — <reason>` in the summary. Coverage is judged against that file. The per-feature floor:

- **Per P0 journey** → 1 happy-path case, `## Platforms: android, ios` (P0/P1).
- **Per journey with input** → 1 validation/negative case driven by the framework's boundary data
  (`UserFactory.invalidCredentials()`-style rows: empty, oversized, unicode/emoji, whitespace).
- **Per feature** → the device-reality set, each as its own case:
  `interrupt` (call/alarm mid-flow → state preserved) · `background/foreground` (60 s background →
  session + unsaved input) · `offline` (action while offline → queued or clear error, no data loss;
  recovery when back online) · `flaky network` (`Network.flap()` during submit → no double submit) ·
  `permission denied then granted` (camera/location/notifications) · `orientation` (landscape on the
  data screen → no clipping/loss) · `deep link` (cold + warm start into the screen, authenticated and
  not) · `kill and relaunch` (state after force-stop).
- **Per feature with a WebView/hybrid screen** → 1 context-switch case (native → web → native).
- **Per feature behind auth** → 1 biometric case when the app offers it (match / no-match).
- **Per release** (feature-independent, designed once per module) → cold-start budget, crash/ANR-free
  navigation sweep, app-level accessibility labelling of the new screens.
- **Platform-only behaviour** → its own case with `## Platforms: android` (or `ios`) and the reason.

Priority: P0 = the journey cannot be completed on a gate-tier device, data loss, crash; P1 = broken
device condition on a primary journey; P2 = secondary screens, nightly-tier devices; P3 = cosmetic.

## Step 3: Platforms and device profile — the two mobile-only headers
- `## Platforms` — `android, ios` (both, the default for a journey) or one, with the reason. When an
  Expected differs per platform, state BOTH in the step (`Expected (android): system back returns to
  the list; (ios): swipe-back returns to the list`). Never fork the case for a locator difference.
- `## Device profile` — device names from the `§Mobile testing` matrix (`pixel-8-emu-api34`,
  `iphone-15-sim-17`, …) or a tier (`gate`, `nightly`), plus the conditions the case exercises:
  `orientation: landscape`, `network: offline → online`, `permission: camera denied`,
  `interrupt: incoming call`, `locale: vi-VN`, `storage: low`. `default` when the case needs nothing
  special. A case that needs a REAL device (biometrics, push, SIM) says so — emulator-only would be
  a false pass.

## Step 4: Placement, naming, reconcile
- Path (contract): `<qa-root>/cases/mobile/<module>/TC-MOB-<MODULE>-<NNN>-<short-desc>.md`; `<module>` = the
  plan's business module (via `resolving-test-placement`), never the screen class name.
- Identity = covered REQ set + journey/condition + platforms — never the `<NNN>`. Check-then-upsert
  (glob the module folder, read `**Feature:**`, title, `@req:`, `## Platforms`); match → update in
  place (keep filename, `<NNN>`, `@tms:`), no match → create at the next `<NNN>`; orphans flagged,
  never deleted. Report **created N · updated M · unchanged K · orphaned P**.

## Step 5: Write each case file (never print cases to chat)

```markdown
# TC-MOB-<MODULE>-<NNN> — [<Module>] <Screen> — <Actor> <action> [<condition>] → <expected>
**Feature:** <slug>  **Plan:** <qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md
**Type:** mobile  **Module:** <module>  **Priority:** P0–P3
**AC:** <AC-NNN, … from the analysis AC register | —>
**Tags:** @mobile @<module> @P<n> [@smoke] [@regression] [@req:<id>] @agentic:gen

## Objective
<ONE sentence — the single intent this case proves; a second intent is a second case>

## Technique
- use-case → journey, positive
- error-guessing → negative          <!-- device reality: offline, interrupt, permission -->

## Isolation
- creates: <records the journey creates>
- cleans: app data reset before; records deleted through the API after
- actor: pool `<role>`
- lock: <device | none>

## Platforms
- android, ios   <!-- or one + the reason; platform-specific Expected deltas are stated per step -->

## Device profile
- Devices: gate tier (`pixel-8-emu-api34`, `iphone-15-sim-17`)   <!-- or explicit names / `real device required: <why>` -->
- Conditions: network offline → online · orientation portrait   <!-- or `default` -->

## Preconditions
- App installed at the build under test (`ANDROID_APP`/`IOS_APP`); user logged in as `standard`
  (flow: `AuthFlow.ensureLoggedIn('standard')`); [DATA:<entity>-<state>] tokens for seeded data

## Steps
1. Action: open the Orders screen from Home (tap `orders-tab`)
   Expected: the order list renders with at least one row (`orders-list`)
2. Action: turn the network off, then tap Submit on the order form
   Expected: a clear offline message (`order-offline-banner`); the draft is kept; no duplicate order
3. Action: restore the network and tap Retry
   Expected: the order is created exactly once; the list shows it with status "Open"
4. Action: send the app to the background for 60 s, then foreground it
   Expected: the session survives; the order list still shows the new order
   Expected (android): the system back button from the list returns to Home, not to the login screen

## Expected Result
- <the journey completes on both platforms under the stated conditions; no data loss, no duplicate,
  no crash (crash/ANR detection is automatic in the framework's afterTest hook)>

## Data
- Accessibility ids used: `orders-tab`, `orders-list`, `order-offline-banner` (from the framework's
  `src/screens/...` — cite `mobile:src/screens/orders/OrdersScreen.ts#OrdersScreen @ <sha>`)
- FRAMEWORK-GAP: <screen object / util the framework lacks — for the mobile developers> (or none)
- Test data: `UserFactory.fromEnvironment('standard')` · seeded order via the API
```

**Title** (CONTRACTS §7 Title; lint-checked): `[<Module>]` = the module folder in Title Case · <Screen> · the actor as a role (never "the user") + action + condition · `→` an observable outcome. No "Verify that"/"Ensure"/bare "successfully"/"works"; one outcome; ≤ 120 chars. Example: `TC-MOB-ORDERS-002 — [Orders] Orders screen — Driver submits a draft offline, then reconnects → exactly one Open order`.

**Priority** (CONTRACTS §7 Priority): start from the REQ's priority (analysis §6 hint); P0 only for the main success path of a P0 REQ, an authz/security denial or data loss/money/irreversible state; main negatives and error contracts → P1; boundaries, alternative paths, rarer roles → P2; cosmetic/copy/rare edges → P3. Never above the REQ unless a denial or data-integrity case, with a one-line `Priority reason:` under the header. Header, `@P<n>` and the traceability Priority are one value.

**Grounding first** (CONTRACTS §7): before writing a case, open the sources it rests on (the wiki pages for its BRs, the impact note, the code citation) and list them under `## Grounding`; a source you did not open is not cited.

Skeleton: `<qa-root>/_templates/case-mobile.md` (CONTRACTS §7). `## Objective` is one sentence; `## Technique` uses the §7
vocabulary and names the axes it buys (`npm run qa:score` counts them per REQ and fails a P0/P1 REQ
without negative — and, for api, authz and error-contract — coverage); `## Isolation` says what the case
creates, cleans and which pool actor it uses so cases run in parallel; `**AC:**` lists the AC ids it
proves (add the Case ID to the plan's `## AC coverage` row for each). Techniques:
[`test-design-techniques.md`](../qa-phase-protocol/references/test-design-techniques.md).

### Tags — derived, never invented
Order per `<qa-root>/docs/tag-taxonomy.md`: `@mobile @<module> @P<n> [@smoke] [@regression] [@req:<id>]
[@tms:<id>] [@defect:<id>] [@quarantined:<until>] @agentic:gen`. The suite tag also decides the
target directory in the framework repo (`§Mobile testing` test-file convention), so a case with no
`@smoke`/`@regression` lands in the default suite the profile names.

## Step 6: Append traceability rows to the plan
ONE row per Req ↔ Case pair, `Scripted` ❌, run columns `—`:
`| REQ-021 | TC-MOB-ORDERS-003 | mobile | orders | P0 | ❌ | — | — | — |`.
Any in-scope journey or heuristic row with no case → `⚠️ No case covers <journey/condition>` note
under the table. Append Case IDs to impact-map `TC` cells for every BR cited (Mode A).

### Escape backfill (CONTRACTS §13)
If `<qa-root>/defects/ESCAPES.md` has a row for this slug with `Backfill` = `pending` whose defect's
`### Backfill` names the journey or device condition this case covers, set that row's `Backfill` cell to
the new Case ID (comma-append when several) — the ledger is how `/qa-metrics` proves the hole closed.

## Step 7: Report ONLY this summary to chat
```
✓ Reconciled <qa-root>/cases/mobile/: created {N} · updated {M} · unchanged {K} · orphaned {P}
✓ Appended traceability rows to <qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md
Platforms: {both {n} · android-only {a} · ios-only {i}} | Device conditions covered: {list} | N/A: {row + reason}
REQs covered: {ids} | Uncovered: {ids or "none"} | FRAMEWORK-GAPs: {n, listed for the mobile devs} | Real-device-required: {ids}
Next: /qa-script <slug> --type mobile  (WDIO specs → <qa-root>/scripts/mobile/ + HANDOFF.md → the framework repo)
```

## Common pitfalls
1. Twin cases for Android and iOS that differ only in locator — one case, `## Platforms: android, ios`.
2. Re-testing the web journey on the phone and calling it mobile coverage — the device conditions are the point.
3. Inventing an accessibility id — unresolved ids are `FRAMEWORK-GAP`s handed to the mobile developers.
4. A biometric/push/SIM case on an emulator-only profile — say `real device required` or don't design it.
5. Forgetting the interrupt/offline/permission set because the happy path passed.
6. Putting the suite tag only in the case body — the tag drives both suite selection and the target file.

## Done — ALL must be true
- [ ] Every case has `## Platforms` and `## Device profile` (devices/tier + conditions, or `default`).
- [ ] The Step 2 minimums are designed or explicitly `N/A — reason`; device-reality cases exist, not just happy paths.
- [ ] Platform-specific Expected deltas are stated inside the shared case; no locator-only twins.
- [ ] Accessibility ids come from the framework/app source with a citation; unresolved → FRAMEWORK-GAP, never a guess.
- [ ] Files at `<qa-root>/cases/mobile/<module>/TC-MOB-<MODULE>-<NNN>-<short-desc>.md` with `**Feature:**`/`**Plan:**` headers and taxonomy-ordered tags; reconciled by identity.
- [ ] Traceability rows appended (`Scripted` ❌); impact-map TC cells appended; escape backfill cells closed; only the Step 7 summary printed.
