# TC-A11Y-PROJECTS-001 — [Projects · Web] Projects list, New project dialog — Owner opens both → no critical/serious violations
**Feature:** demo  **Plan:** qa/plans/demo/2026-10-01-test-plan.md
**Type:** accessibility  **Module:** projects  **Priority:** P1
**Platform:** web
**AC:** —
**Tags:** @accessibility @projects @P1 @platform:web @req:demo/REQ-001

## Grounding
- standard: WCAG 2.2 AA

## Objective
The Projects list and the New project dialog have no critical or serious axe violations at WCAG 2.2 AA.

## Technique
- checklist

## Isolation
- creates: projects named by the run (factory)
- cleans: every created project is deleted in teardown
- actor: Owner, or a pool account per worker
- lock: none

## WCAG ref
- WCAG 2.2 AA — 1.3.1, 3.3.1, 4.1.2

## Scope
- Screen: /projects (list, New project dialog) · viewport 1280×720 · automated

## Preconditions
- The demo app is running and the setup project signed every actor in

## Steps
1. Action: Open Projects and run axe
   Expected: 0 critical and 0 serious violations
2. Action: Open the New project dialog
   Expected: it has an accessible name and takes focus
3. Action: Submit it empty
   Expected: the error is announced on the Name field

## Expected Result
- The error is announced on the Name field.

## Data
- none
