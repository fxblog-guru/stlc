---
name: designing-ui-cases
description: Use to design visual and layout UI cases per screen state and viewport (/qa-design --type ui).
version: 1.0.0
---

# Designing UI Cases (visual & layout)

> Profile first, by section (`profile.mjs`) — `§Test types` (is `ui` enabled), `§Platforms` (which
> platforms and targets the screens ship on), `§UI testing` (screens in scope, viewports, threshold,
> baselines, fonts, design tokens, themes), `§Application under test` (element registry),
> `§Quality gates`. QA root defaults to `<qa-root>/`. Contract: `node <qa-root>/scripts/shared/contracts.mjs 7 20`.

> **Code grounding**: routes, component names and test ids beyond the element registry resolve
> through `grounding-in-code` and are cited `frontend:<path>#<component> @ <sha>` in `## Data`.

## Prime directive — the unit is a screen STATE at a VIEWPORT on a PLATFORM
The `ui` type proves what a screen LOOKS like and whether it HOLDS ITS SHAPE: the empty list, the
error banner, the 80-character name in a 320-px column, the dialog over a long table. It is not a
journey (`e2e` proves the flow works) and not accessibility (`accessibility` proves everyone can use
it). A case names the screen, the states, the viewports, the platform, what is screenshotted, what
is masked and why, and which layout rules must hold without pixels.

## Action
Design ui cases for one feature slug — **one file per case** under `<qa-root>/cases/ui/<module>/` — and
append their rows to the plan's traceability table. `generating-ui-script` turns them into
Playwright specs (`/qa-script --type ui`), run by `npm run test:ui`.

## Inputs — resolve before designing (STOP conditions)
1. `<slug>`; the latest analysis (UI REQs, screens) and the plan with its traceability table — missing → STOP.
2. `ui` enabled in `§Test types` and in the plan's coverage targets; `§UI testing` read (defaults apply).
3. **Screen inventory**, in order: the slug's e2e cases (`**Feature:** <slug>` under `<qa-root>/cases/e2e/`),
   `<qa-root>/docs/element-registry.md`, the analysis UI REQs, `grounding-in-code`. None → STOP: nothing to design.
4. **Platforms**: the enabled §Platforms rows of kind `web`, `desktop`, `mobile`, `other` on which the
   screen ships. `api` is never a ui platform (lint error). Mobile ui cases are designed here and
   scripted by the mobile framework later (`generating-mobile-script`, CONTRACTS §15).

## Step 1: Screen × state inventory
For each in-scope screen, the states (each with HOW it is seeded — never by clicking through other screens):

| State | Seeded through |
|---|---|
| `empty` | an actor with no data (a pool account sees only what it was granted) |
| `loading` | `page.route` delaying the list call; screenshot the skeleton, then release |
| `error` | `page.route` fulfilling the call with the problem+json the API documents; or a refused submit |
| `populated` | factories — names of fixed-width digits (`uniqueDigits`), so widths never move between runs |
| `long/overflow data` | factories at the API's maximum lengths (BVA): the longest name, the most rows a page shows |
| `permission-limited` | a pool account granted the lowest role (controls hidden or disabled) |
| `dark mode` · `RTL` | only when §UI testing enables them: `colorScheme: 'dark'` · `dir="rtl"` / locale |

## Step 2: Viewports and platforms
Web: the §UI testing widths (default `320, 768, 1280`) on the `web` gate targets; desktop: the
window the app opens with (`desktop-electron` project, CONTRACTS §20); mobile: the §Mobile testing
gate devices. A state that only matters at one width (reflow) names that width alone. Add
`- skin: light` (or `dark`, or one line per skin when §UI testing `Themes` is on). A headless
browser follows the host's dark setting, so an unnamed skin is a baseline of whichever one CI had.

## Step 3: Visual baseline — what is screenshotted, what is masked
- One baseline per (state × viewport); name `<screen>-<state>-<width>` — the generator turns it into
  `<name>.png` under `__screenshots__/<os>/<project>/<spec path>/`.
- **Mask** every region whose content the run decides: dates and times, generated ids, unique names,
  avatars, counters fed by other tests' data, "Signed in as …". Each mask with its reason. Masking is
  not hiding a bug: a region masked to make a test pass is a finding, not a mask.
- A component that sits on shared data (a dialog over a list other tests fill) is screenshotted on
  its own element, not the page.
- A screen with live content nobody can freeze (a map, a video) → layout rules only, no baseline,
  with the reason in `## Visual baseline`.

## Step 4: Layout rules — the checks without pixels
Per state × viewport, pick from `references/ui-heuristics.md`: no horizontal page scroll · no text
clipped or spilling a container · no overlapping interactive elements · touch targets ≥ 24×24 CSS px
(WCAG 2.5.8) · focus visible on the screen's primary controls · design-token conformance of named
components when §UI testing declares a token file (otherwise: `skipped — no token file declared`).
Layout rules run at EVERY viewport the case names — they catch what no baseline exists for.

## Step 5: Case seeds (minimums per feature)
- **Per in-scope screen** → 1 visual case: the `populated` and `empty` states at every viewport
  (Variants rows `<state>-<width>`). P2 by default (P3 for back-office screens); P1 only when the
  screen IS the requirement (a printed invoice, a public landing page).
- **Per data screen** → 1 layout case at the narrowest viewport with `long/overflow data` (BVA).
- **Per form / dialog** → 1 error-state case (visual of the component + layout rules).
- **Per state the analysis names** (loading skeleton, permission-limited toolbar) → a Variants row,
  not a new case, when it shares the screen and the intent.

## Step 6: Placement, naming, reconcile
- Path: `<qa-root>/cases/ui/<module>/TC-UI-<MODULE>-<NNN>-<short-desc>.md`; `<module>` via `resolving-test-placement`.
- Identity = screen + state set + viewport set + platform — never the NNN. Check-then-upsert; report
  **created N · updated M · unchanged K · orphaned P**.

## Step 7: Write each case file (never print cases to chat)
**Grounding first** (CONTRACTS §7): before writing a case, open the sources it rests on (the wiki pages for its BRs, the impact note, the code citation) and list them under `## Grounding`; a source you did not open is not cited.

Skeleton: `<qa-root>/_templates/case-ui.md`. Header lines as CONTRACTS §7 plus
`**Platform:**` (§20); tags `@ui @<module> @P<n> @platform:<id>… [@req:<slug>/REQ-NNN] @agentic:gen`.
Sections: the core seven + `## Screen states` · `## Viewports` · `## Visual baseline` · `## Layout rules`.

**Title** (CONTRACTS §7 Title, §20; lint-checked): `[<Module> · <Platform label>]` · the screen as the
user sees it · the actor as a role + action + the state/viewport condition · `→` the observable
outcome. Example: `TC-UI-ORDERS-002 — [Orders · Web] Orders list — Clerk opens it with 200 rows at 320 px → no sideways scroll, totals not clipped`.

**Priority** (CONTRACTS §7 Priority): layout-only and cosmetic checks are P3 by the table, P2 when the
screen sits on a P0/P1 journey; never above the REQ.

## Step 8: Traceability + impact map
Append one row per new case to the plan (`Type` = `ui`, `Scripted` ❌, run columns `—`); append the
Case ID to the impact-map `TC` cell of each BR the screen cites (`maintaining-impact-map` Mode A).

## Done — ALL must be true
- [ ] Every in-scope screen has a visual case (populated + empty at every viewport) or a written reason
- [ ] Every data screen has a long-data layout case at the narrowest viewport; every form/dialog an error-state case
- [ ] Every state says how it is seeded (factory · pool account · `page.route`); no click-through setup
- [ ] Every mask has a reason; nothing masked that the case claims to check
- [ ] `**Platform:**`, `@platform:` tags and the title's platform agree; no case on `api`
- [ ] Token checks present when §UI testing declares a token file, else marked skipped with that reason
- [ ] `npm run qa:lint` clean for the new files; traceability rows appended; report delivered
