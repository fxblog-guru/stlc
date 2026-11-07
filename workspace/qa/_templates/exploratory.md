---
slug: <slug>
artifact: exploratory
status: draft
authored_by: running-exploratory-sessions
reviewed_by: pending
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# XS-<slug>-NNN — <charter title>

<!-- Session-based exploratory testing sheet (CONTRACTS §14). Created by /qa-explore <slug>
     (charter mode) at <qa-root>/exploratory/<slug>/XS-<slug>-NNN-<charter-slug>.md. The tester fills
     Session / Notes / Bugs / Debrief during and right after the timebox; /qa-explore --debrief
     turns raw notes into the tables below; /qa-defect --from-exploratory raises the candidates.
     Headings and table columns are byte-exact and checked by `npm run qa:lint`. -->

## Charter
- **Mission:** Explore <area / flow> with <resources / personas / data> to discover <risk class>
- **Areas:** <screens, endpoints, modules>
- **Targets:** <R-### risks · BR-### rules · REQ-### · impact §4 gaps · review findings this charter attacks>
- **Out of scope:** <what a scripted case already proves>
- **Timebox:** <60 | 90 | 120> min
- **Heuristics:** <e.g. SFDIPOT · CRUD · boundaries · interrupts · concurrency · roles · data variety · undo/redo · time>

## Session
- **Tester:** <name/role> · **Env:** <env> · **Started:** YYYY-MM-DD HH:MM · **Ended:** HH:MM · **Build:** <sha/version>

## Notes
<!-- Timestamped observations; questions inline as (Q); test ideas as (T). -->
- HH:MM <observation>

## Bugs
| # | What happened | Expected | Evidence | Status |
|---|---|---|---|---|

## Follow-ups
| # | Kind | Detail | Action |
|---|---|---|---|

## Debrief
- **Past:** <what was covered vs the charter>
- **Results:** <bugs, candidates, learnings>
- **Obstacles:** <blockers, missing data, env issues>
- **Outlook:** <what to explore next>
- **Feelings:** <confidence in this area, in one line>
