---
name: generating-ui-script
description: Use to generate a Playwright visual and layout spec from one TC-UI case.
version: 1.0.0
---

# Generating UI Script (Playwright visual + layout)

> Profile first, by section (`profile.mjs`) — `§Test types` (is `ui` enabled), `§Platforms` (targets
> and runners), `§UI testing` (viewports, threshold, baselines, fonts, tokens, themes),
> `§Application under test` (element registry). QA root defaults to `<qa-root>/`.

> **Project setup required:** `<qa-root>/scripts/shared/ui/visual.ts` (`expectVisual`, `expectVisualOf`,
> `VIEWPORTS`) and `<qa-root>/scripts/shared/ui/layout.ts` (`expectNoHorizontalScroll`, `expectNoOverflow`,
> `expectNoOverlap`, `expectTouchTargets`, `expectFocusVisible`, `expectTokens`), exported from
> `shared/fixtures`; `snapshotPathTemplate` + `expect.toHaveScreenshot` defaults in
> `playwright.config.ts`; `UI_MAX_DIFF_PIXEL_RATIO` in `<qa-root>/.env.<env>`; `test:ui` / `test:ui:update`.

## Action
Generate ONE `.spec.ts` from ONE ui case. Invoked by `automation-engineer` via `/qa-script --type ui`.
Platforms `web` and `windows`/`macos` (Electron) are scripted here; a ui case on `android`/`ios` is
staged by `generating-mobile-script` (CONTRACTS §15), and one on `appium-desktop` or `other:<id>` is
staged under `<qa-root>/scripts/ui/` with a `HANDOFF.md` row (CONTRACTS §20).

## Input

| What | Where |
|---|---|
| The case | `<qa-root>/cases/ui/<module>/TC-UI-<MODULE>-<NNN>-<short-desc>.md` — §7 + `## Screen states` · `## Viewports` · `## Visual baseline` · `## Layout rules` |
| Discovery | the plan's traceability table; fallback grep `**Feature:** <slug>` under `<qa-root>/cases/`. **NEVER glob `<slug>.md`.** |
| Locators | page objects + components injected by `fixtures/<module>.fixture.ts` (same hierarchy as `generating-e2e-script`) |
| Seeding | factories (`<module>Factory`), pool accounts (`pool`, `<module>PageAs`), `page.route` for loading/error |
| Templates | `references/ui-templates.md` — visual rows, layout steps, states via `page.route`, tokens, desktop |
| Golden | `tests/golden/qa/scripts/ui/projects/` (4 specs: visual rows, layout at 320, dialog error state, desktop) |

## Output
- `<qa-root>/scripts/ui/<module>/<same-TC-basename>.spec.ts` — mirrors the case path 1:1.
- `Scripted` ❌ → ✅ in the plan (Step 6). Baselines are NOT written by this skill (Step 5).

## Rules

| # | Rule |
|---|---|
| 1 | **One test per Variants row** for visual cases (`<id> — row <Row>: <state>, <width> px → matches <baseline>`), so a diff names its state and width. Otherwise one test per case, one `test.step('Step N: …')` per case step |
| 2 | **Every screenshot through `expectVisual` / `expectVisualOf`** — never a raw `toHaveScreenshot` with ad-hoc options. The name is the case's `## Visual baseline` name; the helper adds `.png`, the stable options and the profile threshold |
| 3 | **Masks exactly as `## Visual baseline` lists them**, each from a page-object getter (`projectsPage.projectLinks`), with the reason in a comment. Never mask to make a red run green |
| 4 | **Seed the state, then arrive, then shoot**: factory / pool account / `page.route` first; `goto()` (its arrival assertion) second; the screenshot or layout check last. No click-through setup, no sleeps |
| 5 | **Viewport per row** with `page.setViewportSize({ width, height: 900 })` before `goto()`, or `test.use({ viewport })` when the case has one width. The skin is the case's `- skin:` line, passed as `expectVisual(page, name, { skin: 'light' })`; the helper sets it and hides the prototype banner, so never rely on the host's dark or light setting |
| 6 | **Shared-data screens → component shots**: when other tests' data can appear on the page (an Owner's list), screenshot the component (`expectVisualOf(dialog.root, …)`) or use a pool account that sees only its own data |
| 7 | **Layout rules run at every viewport the case names**, with the shared helpers on the narrowest container that holds the rule (`body` for page reflow, the dialog root for a dialog) |
| 8 | **Tokens only from the declared token file**: `expectTokens(locator, { 'background-color': '<value from the file>' })`; no token file → no token step, and the report says `skipped — no token file declared` |
| 9 | **Platform in `caseMeta`**: `platform: [...]` = the case's `**Platform:**`; a desktop spec takes `appWindow` (electron fixture) instead of `page` and skips by itself when `ELECTRON_APP_PATH` is unset |
| 10 | **Title mirrors the case** (CONTRACTS §7 Title): `<case id> — <case H1 text>` or the row form; steps `Step N` 1..n |

## Procedure

### 1. Parse the case
Case ID, slug, tags, `**Platform:**`, the four ui sections, steps, Variants. A missing section → STOP
for this case (lint would fail it anyway). A platform this workspace cannot run → stage + HANDOFF row.

### 2. Resolve page objects, masks and seeds
For each state: the factory call or `page.route` stub; for each mask: a page-object getter (add a
getter to the page object when missing — never a raw locator in the spec). Unresolvable →
`// UNRESOLVED: <what>` and report it.

### 3. Write the spec
Pick the template in `references/ui-templates.md` (visual rows · layout · component state · route
stub · desktop). Imports from `../../shared/fixtures` only. No `test.describe`, no conditionals in a
test (lookup tables like `SEED[row.state]` instead), timeouts from `TIMEOUTS.*`.

### 4. Validate offline
```bash
cd qa && npm run heal:check     # tsc + eslint: no sleeps, no skip/only, no conditionals, every test asserts
```

### 5. Baselines — generated where they will be compared
Baselines are per OS (`__screenshots__/<os>/<project>/…`, the `{platform}` token). Tell the user,
never do it silently:
- **CI (the truth):** run `npm run test:ui:update` (= `--update-snapshots=changed`) in the CI image
  (the `qa:ui-baselines` manual job, `<qa-root>/ci/README.md`), download the `linux/` PNGs from its artifacts,
  review every image, commit them.
- **Local (Windows/macOS):** the first `npm run test:ui -- --update-snapshots=missing` writes
  `win32/` or `darwin/` beside the CI set — useful for local feedback, never a substitute for it.
- A red visual run is triaged like any failure: `FUNCTIONAL` (the product changed — a defect, or an
  intended change whose new baseline is reviewed and committed) · `SCRIPT` (a missing mask) — never
  "re-run with `--update-snapshots` until green".

### 6. Traceability write-back + report
Flip `Scripted` ❌ → ✅. Report: spec path, rows/states/viewports covered, masks (with reasons),
layout rules asserted, token checks (or skipped with reason), baselines still to be generated in CI,
UNRESOLVED list.

## Done — ALL must be true
- [ ] Case located via traceability / `**Feature:**` grep; spec mirrors the case path under `<qa-root>/scripts/ui/<module>/`
- [ ] One test per Variants row (visual) or per case; steps `Step N` 1..n; title mirrors the case
- [ ] Every screenshot via `expectVisual`/`expectVisualOf`; masks exactly the case's, each with a reason
- [ ] States seeded via factories / pool accounts / `page.route`; viewport set before arrival
- [ ] Layout rules at every viewport the case names; tokens only from a declared token file
- [ ] `caseMeta({ platform })` = the case's `**Platform:**`; desktop specs use `appWindow`
- [ ] `heal:check` clean; `Scripted` ✅; the baseline step (CI job or local folder) stated in the report
