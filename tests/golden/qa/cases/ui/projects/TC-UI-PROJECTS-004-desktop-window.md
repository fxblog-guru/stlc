# TC-UI-PROJECTS-004 — [Projects · Windows] Main window — Owner opens the desktop build → window titled, no sideways scroll
**Feature:** demo  **Plan:** qa/plans/demo/2026-10-01-test-plan.md
**Type:** ui  **Module:** projects  **Priority:** P3
**Platform:** windows
**AC:** —
**Tags:** @ui @projects @P3 @platform:windows @req:demo/REQ-001

## Grounding
- none — desktop shell only; the window has no rule or operation of its own

## Objective
The Electron desktop build opens a titled main window whose content does not scroll sideways.

## Technique
- checklist

## Isolation
- creates: nothing
- cleans: the app is closed after the test (electron fixture)
- actor: none (the desktop build under test)
- lock: none

## Screen states
- populated — whatever the build's first window shows; the golden proves the wiring, not a product

## Viewports
- the window size the app opens with
- skin: light

## Visual baseline
- none — a desktop baseline needs the CI desktop runner (ci/README.md)

## Layout rules
- no horizontal scroll in the first window (`expectNoHorizontalScroll`)

## Preconditions
- `ELECTRON_APP_PATH` points at the desktop build (supplied by the app pipeline); without it the case is ⛔ skipped with that reason

## Steps
1. Action: Launch the build from ELECTRON_APP_PATH and take its first window
   Expected: the window has a non-empty title
2. Action: Measure the window's document
   Expected: it does not scroll sideways

## Expected Result
- The desktop window opens titled and reflows to its own width.

## Data
- ELECTRON_APP_PATH, ELECTRON_APP_ARGS (optional)
