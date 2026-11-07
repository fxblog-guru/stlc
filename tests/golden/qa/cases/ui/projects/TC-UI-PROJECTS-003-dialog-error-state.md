# TC-UI-PROJECTS-003 — [Projects · Web] New project dialog — Owner submits it empty at 320 px → error state matches baseline, nothing clipped
**Feature:** demo  **Plan:** qa/plans/demo/2026-10-01-test-plan.md
**Type:** ui  **Module:** projects  **Priority:** P2
**Platform:** web
**AC:** —
**Tags:** @ui @projects @P2 @platform:web @req:demo/REQ-001

## Grounding
- code: api:tests/demo-app/openapi.yaml#createProject @ 0214e8c

## Objective
The New project dialog in its validation-error state looks like its baseline and keeps its layout at 320 CSS px.

## Technique
- error-guessing → negative

## Isolation
- creates: nothing (the dialog is submitted empty, the API refuses it)
- cleans: nothing
- actor: Owner (only the Owner sees New project)
- lock: none

## Screen states
- error — the dialog after an empty submit: "Name is required (1 to 80 characters)." under the field

## Viewports
- 320 CSS px wide, height 900
- skin: light

## Visual baseline
- `new-project-dialog-error-320.png` — the dialog element only (the list behind it holds other tests' projects)
- masked: nothing — the dialog has no run-dependent content

## Layout rules
- no element inside the dialog clips its text or leaves the viewport (`expectNoOverflow`)
- the dialog's controls do not overlap and are ≥ 24×24 CSS px (`expectNoOverlap`, `expectTouchTargets`)

## Preconditions
- The demo app is running and the setup project signed the Owner in

## Steps
1. Action: Open Projects at 320 × 900, open New project, press Create with the name empty
   Expected: the error "Name is required (1 to 80 characters)." is shown in the dialog
2. Action: Screenshot the dialog
   Expected: it matches `new-project-dialog-error-320.png`
3. Action: Measure the dialog's elements and controls
   Expected: nothing clips or leaves the viewport; controls do not overlap and are ≥ 24×24 CSS px

## Expected Result
- The error state renders as reviewed and stays usable at 320 px.

## Data
- none
