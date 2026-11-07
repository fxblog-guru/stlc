# UI heuristics — what breaks visually, and the check that catches it

Read by `designing-ui-cases` (Step 4) and `generating-ui-script` (layout steps). Each row: the
failure as a user sees it, the state that provokes it, and the shipped check (`<qa-root>/scripts/shared/ui/`).

## Layout rules (pixel-free)

| Failure | Provoke with | Check | Notes |
|---|---|---|---|
| Page scrolls sideways on a phone | narrowest viewport (320 CSS px) × long data | `expectNoHorizontalScroll(page)` | WCAG 1.4.10 reflow; a data table that declares its own scroll container is exempt — assert the container instead |
| Text cut off / spills its box | longest values the API accepts (BVA), translated strings (+30 %), large numbers | `expectNoOverflow(locator)` | elements with `overflow-x: auto/scroll` are scroll containers, not clipping |
| Buttons on top of each other | narrow viewport, toolbar with many actions, long labels | `expectNoOverlap(locator)` | nested elements (an icon inside its button) never count |
| Targets too small to tap | dense toolbars, icon buttons, table row actions | `expectTouchTargets(locator, 24)` | WCAG 2.2 SC 2.5.8 minimum 24×24 CSS px; inline links in a sentence are exempt |
| Focus invisible | keyboard focus on the primary controls, both themes | `expectFocusVisible(control)` | outline or box-shadow ring; the full keyboard pass belongs to `accessibility` |
| Off-brand color, font or spacing | named components (primary button, heading, card) | `expectTokens(locator, { 'background-color': …, 'font-family': …, 'padding': … })` | only when §UI testing declares a token file; values copied from it, never eyeballed |

## Visual baselines

| Do | Why |
|---|---|
| `animations: 'disabled'`, `caret: 'hide'`, `scale: 'css'` (the `expectVisual` defaults) | a blinking caret or a mid-animation frame is a diff nobody can fix |
| wait for `document.fonts.ready` (done by `expectVisual`) | a webfont that lands after the shot moves every line |
| mask dates, ids, unique names, avatars, other tests' counts | run-decided content is not the design |
| screenshot a component on shared data, not the page | a full page over a list other workers fill diffs on their data |
| names of fixed-width digits (`uniqueDigits`) for populated rows | equal widths every run → stable column widths |
| one baseline per state × viewport × project | a diff then names exactly what changed where |
| generate baselines in the CI image (Linux); review the diff images like code | fonts and anti-aliasing differ per OS; a local Windows set lives in `win32/` beside it |
| update with `--update-snapshots=changed` (`npm run test:ui:update`) in the CI image | rewrites only baselines that changed, so the review diff stays small |
| never re-run `--update-snapshots` to turn a red run green | that accepts the regression; a diff is a FUNCTIONAL (product) or SCRIPT (mask missing) triage |

## States worth a baseline (and how to seed them)

| State | Seed | Typical defect |
|---|---|---|
| empty | an actor with nothing granted | the empty-state message missing, a table header with no body, a lonely "0 items" |
| loading | `page.route('**/api/<list>**', (r) => setTimeout(() => r.continue(), …))` — screenshot the skeleton before release | layout jump when data arrives, spinner over content |
| error | `page.route(…, (r) => r.fulfill({ status: 500, contentType: 'application/problem+json', body }))` or a refused submit | raw JSON on screen, error banner pushing the form off-screen |
| long data | factories at max lengths; the most rows one page shows | clipped names, wrapped buttons, totals overflowing |
| permission-limited | pool account with the lowest role | a gap where hidden buttons were, disabled controls that look enabled |
| dark mode | `test.use({ colorScheme: 'dark' })` (only when §UI testing enables it) | hard-coded colors, invisible borders, unreadable focus rings |
| RTL | the app's RTL locale / `dir="rtl"` (only when enabled) | icons not mirrored, padding on the wrong side, truncated start of text |
