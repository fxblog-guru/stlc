# Mobile test heuristics — the device reality checklist

Reference for `designing-mobile-cases`. Walk every row for the feature's screens; design the cases
it names or record `N/A — <reason>`. The right-hand column names the mobile framework's helper
(agentic-fx `mobilewright-automation` API) the generated spec will use, so a case you design here is
scriptable without inventing framework code.

## 1. Lifecycle & state

| Condition | What breaks in real apps | Case shape | Framework helper |
|---|---|---|---|
| Cold start | slow first paint, splash hangs, token refresh on launch | launch → first screen within budget | `Performance.measureColdLaunch(isReady, budgetMs)` |
| Background → foreground | session dropped, unsaved form cleared, timers double-fired | background 60 s → state and session survive | `AppLifecycle.background(seconds)` |
| Force stop → relaunch | draft lost, "logged out" surprise, corrupted cache | terminate → launch → expected landing screen | `AppLifecycle.restart()` / `terminate()` + `launch()` |
| Reinstall / first run | onboarding re-shown, permissions reset, migration bug | reinstall → first-run flow completes | `AppLifecycle.reinstall(appPath)` |
| App state query | flow continues while app is backgrounded | assert foreground before acting | `AppLifecycle.isForeground()` |

## 2. Network

| Condition | What breaks | Case shape | Helper |
|---|---|---|---|
| Offline action | silent data loss, infinite spinner, duplicate on retry | submit offline → clear message + draft kept; back online → exactly one record | `Network.goOffline()` / `goOnline()` |
| Flapping network | double submit, partial upload, stuck state | `flap()` during submit → one record, recoverable UI | `Network.flap(cycles, offlineMs)` |
| Slow network | premature timeout, skeleton forever | long operation shows progress and completes (budget stated) | throttling per the framework's execution guide |
| Airplane → online | queue not drained, token not refreshed | queued action drains once connectivity returns | `Network` + read-back through the API |

## 3. Interrupts & system UI

| Condition | What breaks | Case shape | Helper |
|---|---|---|---|
| Incoming call / alarm mid-flow | form state lost, media not resumed | interrupt during step N → resume with state intact | `SystemInteraction` + `AppLifecycle.background()` |
| System dialog (permission, update) | test hangs; app mis-handles denial | accept/deny path both asserted | `SystemInteraction.acceptAlert()` / `denyAlert()` |
| Android back button | back exits the app or skips a step | back from screen X → expected screen (android-only Expected) | `SystemInteraction.pressBack()` |
| Home / recents | app relaunches cold instead of resuming | home → reopen → same screen | `SystemInteraction.goHome()` |
| Notification shade / push | deep-link from notification lands wrong | open notifications → tap → expected screen | `SystemInteraction.openNotifications()` |
| Keyboard | field hidden behind keyboard, submit unreachable | type in the last field → submit still reachable | `BaseScreen.type()` (hides keyboard), `SystemInteraction.hideKeyboard()` |

## 4. Permissions

| Condition | What breaks | Case shape | Helper |
|---|---|---|---|
| Denied at first ask | feature crashes instead of degrading | deny camera → clear explanation, no crash | `Permissions.set('camera', 'denied')` |
| Granted later | app does not recover without restart | deny → grant in settings → feature works | `Permissions.set(..., 'granted')` |
| Revoked while backgrounded | stale permission assumption | revoke → foreground → re-prompt or graceful path | `Permissions` + `AppLifecycle.background()` |
| Notification permission (iOS 13+/Android 13+) | push silently never arrives | denied → in-app fallback stated | `Permissions.set('notifications', …)` |

## 5. Device & display

| Condition | What breaks | Case shape | Helper |
|---|---|---|---|
| Orientation change | layout clipped, state reset, lists jump | landscape on a data screen → no loss, no clipping | `SystemInteraction.setOrientation('LANDSCAPE')` |
| Small screen / tablet | buttons off-screen, tap targets tiny | gate device + small-screen device in the profile | device matrix tiers |
| Scroll & gestures | element never reached, swipe deletes wrong row | scroll into view, swipe actions assert the right target | `Gestures.scrollIntoView/swipe*/longPress/dragAndDrop` |
| Locale / timezone | dates, currency, RTL layout | locale set in the environment → formats correct | `defaultLocale` per environment |
| Low storage / battery saver | upload fails silently, sync disabled | state the condition; assert the graceful path | documented device prep step |

## 6. Navigation & integration points

| Condition | What breaks | Case shape | Helper |
|---|---|---|---|
| Deep link (cold start) | app opens home instead of target, auth bounce loses target | cold start on link → target screen (logged in and out) | `DeepLink.open(path)` |
| Universal / app link | falls back to browser | https link → app opens the target | `DeepLink.openUniversal(url)` |
| WebView / hybrid screen | context never switches back, native asserts fail | native → web → native round trip | `Contexts.switchToWebView()/switchToNative()/inWebView(fn)` |
| Biometrics | fallback path missing on no-match | match → in; no-match → password fallback (real device or simulated enrol) | `Biometrics.enroll()/match()/noMatch()` |
| File upload / download | wrong mime, permission, path | attach a file → uploaded and visible | `Files` util |

## 7. Robustness & quality signals

| Condition | What breaks | Case shape | Helper |
|---|---|---|---|
| Crash / ANR | a crash is reported as an assertion failure | every case inherits crash detection; a sweep case navigates the new screens | `CrashDetector` (wired in `afterTest`) |
| App-level accessibility | unlabelled controls block screen readers | new screens: every interactive element labelled | `A11y.assertLabeled()`, `A11y.findUnlabeledInteractive()` |
| Performance budget | regressions creep in unnoticed | cold start and key transition under budget | `Performance.measure(label, action)` |
| Evidence on failure | untriageable CI failures | (automatic) screenshot + page source + device logs | `Evidence.captureFailure()` |

## 8. Data & isolation (design rules, not cases)

- Every case starts from a known app state (`AppLifecycle.restart()` in `beforeEach`) — never from
  whatever the previous case left.
- Users: stable accounts via `UserFactory.fromEnvironment(role)`; anything created by the test uses
  `UserFactory.generated()` so parallel workers never collide.
- Login is a precondition, not the subject, except in auth cases → `AuthFlow.ensureLoggedIn(role)`
  (session reuse / deep-link token / UI fallback).
- Boundary rows for input cases: empty, whitespace-only, oversized (256+), unicode + emoji,
  injection-looking strings — `UserFactory.invalidCredentials()` is the shape to copy.

## Coverage judgement

A feature's mobile suite is adequate when: every P0 journey passes on both platforms' gate devices,
and sections 1–4 each have at least one case (or a recorded `N/A`). Sections 5–7 are risk-driven:
design them where the feature actually touches the condition (a list screen needs orientation; a
camera feature needs permissions; a payment needs interrupt + offline).
