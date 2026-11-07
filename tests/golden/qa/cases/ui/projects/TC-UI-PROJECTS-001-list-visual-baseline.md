# TC-UI-PROJECTS-001 — [Projects · Web] Projects list — Member opens it empty and populated at 320/768/1280 → matches the baseline
**Feature:** demo  **Plan:** qa/plans/demo/2026-10-01-test-plan.md
**Type:** ui  **Module:** projects  **Priority:** P2
**Platform:** web
**AC:** —
**Tags:** @ui @projects @P2 @platform:web @regression @req:demo/REQ-001

## Grounding
- code: api:tests/demo-app/openapi.yaml#listProjects @ 0214e8c

## Objective
The Projects list looks the same as its reviewed baseline in the empty and populated states at every web viewport.

## Technique
- pairwise → positive

## Isolation
- creates: three projects granted to this worker's pool account (populated rows only)
- cleans: every created project is deleted in teardown
- actor: pool account (sees only the projects granted to it, so the list is deterministic under parallel runs)
- lock: none

## Screen states
- empty — a pool account with no grants: "0 projects", the "No projects yet." row
- populated — three projects granted as member (factory `withMember`), names of fixed-width digits
- loading · error · long/overflow data · permission-limited — covered by TC-UI-PROJECTS-002 (long data) and TC-UI-PROJECTS-003 (error); the list has no loading state (server-rendered)

## Viewports
- 320, 768, 1280 CSS px wide (PROJECT-PROFILE §UI testing default), height 900, full page
- skin: light

## Visual baseline
- `projects-list-<state>-<width>.png` per Variants row, project `web-chromium`
- masked: the project-name links (unique per run), the "Signed in as …" text (the pool account differs per worker)

## Layout rules
- none in this case — the pixel-free checks are TC-UI-PROJECTS-002

## Preconditions
- The demo app is running and the setup project signed every pool account in

## Steps
1. Action: Seed the row's state, open Projects as the pool account at the row's width
   Expected: the full-page screenshot matches `projects-list-<state>-<width>.png` within UI_MAX_DIFF_PIXEL_RATIO

## Variants
| Row | Technique | Input | Expected |
|---|---|---|---|
| e320 | pairwise | empty, 320 px | matches projects-list-empty-320 |
| e768 | pairwise | empty, 768 px | matches projects-list-empty-768 |
| e1280 | pairwise | empty, 1280 px | matches projects-list-empty-1280 |
| p320 | pairwise | populated, 320 px | matches projects-list-populated-320 |
| p768 | pairwise | populated, 768 px | matches projects-list-populated-768 |
| p1280 | pairwise | populated, 1280 px | matches projects-list-populated-1280 |

## Expected Result
- Every row's screenshot matches its baseline; a difference attaches the diff image to the run.

## Data
- three projects named `Project <8 digits>` granted as member; the baselines under `scripts/__screenshots__/<os>/web-chromium/ui/projects/`
