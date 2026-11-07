# TC-UI-PROJECTS-002 — [Projects · Web] Projects list — Member opens it with a long name at 320 px → no sideways scroll, nothing clipped
**Feature:** demo  **Plan:** qa/plans/demo/2026-10-01-test-plan.md
**Type:** ui  **Module:** projects  **Priority:** P2
**Platform:** web
**AC:** —
**Tags:** @ui @projects @P2 @platform:web @regression @req:demo/REQ-001

## Grounding
- code: api:tests/demo-app/openapi.yaml#listProjects @ 0214e8c

## Objective
At 320 CSS px the Projects list, holding an 80-character project name, keeps its layout without pixels.

## Technique
- BVA → boundary

## Isolation
- creates: two projects granted to this worker's pool account, one with an 80-character name (the maximum)
- cleans: every created project is deleted in teardown
- actor: pool account
- lock: none

## Screen states
- long/overflow data — an 80-character single-word name (the longest the API accepts) next to a short one

## Viewports
- 320 CSS px wide (the WCAG 1.4.10 reflow width), height 900
- skin: light

## Visual baseline
- none — this case checks layout rules only

## Layout rules
- no horizontal page scroll (`expectNoHorizontalScroll`)
- no element of the page clips its text or leaves the viewport (`expectNoOverflow` on body)
- no two interactive elements overlap (`expectNoOverlap`)
- interactive elements ≥ 24×24 CSS px or spaced so a 24 px target fits (`expectTouchTargets`, WCAG 2.5.8)

## Preconditions
- The demo app is running and the setup project signed every pool account in

## Steps
1. Action: Seed the two projects, open Projects as the pool account at 320 × 900
   Expected: the page does not scroll sideways
2. Action: Measure every element of the page
   Expected: no element clips its text or leaves the viewport
3. Action: Measure every interactive element
   Expected: no two overlap; each is ≥ 24×24 CSS px or has 24 px of free space around its center

## Expected Result
- The list reflows at 320 px: the long name wraps inside its cell and every control stays usable.

## Data
- names: `Project <8 digits>` and an 80-character single word
