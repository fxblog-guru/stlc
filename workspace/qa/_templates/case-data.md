# TC-DATA-<MODULE>-<NNN> — [<Module> · API] <from> → <to> — <check> → <expected>
**Feature:** <slug>  **Plan:** <qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md
**Type:** data  **Module:** <module>  **Priority:** P0–P3
**Platform:** api
**AC:** <AC-NNN, … from the analysis AC register | —>
**Tags:** @data @<module> @P<n> @platform:api [@req:<slug>/REQ-NNN] @agentic:gen

<!-- Template (CONTRACTS §7, §28). Copy to <qa-root>/cases/data/<module>/TC-DATA-<MODULE>-<NNN>-<short-desc>.md.
     qa:lint enforces the §7 core sections and §28: `## Hop` (from, to, relationship, grain, window;
     dedup order / quarantine when the relationship needs them), `## Oracle` (known kinds; a P0/P1
     case has a value-level oracle), `## Tolerance` (`- exact`, or reason + owner per line).
     Data cases are never quarantined (CONTRACTS §12, §28). -->

## Grounding
- profile: §Data testing R1 (contract) · R3 (hop map)
- BR-NNN — wiki/compiled/business-rules/br-NNN-<short-desc>.md

## Objective
<ONE sentence: the relationship between the two sides of this hop that the case proves.>

## Technique
- decision-table → positive, negative
- BVA → boundary

## Isolation
- creates: nothing in the warehouse (CI engine over the fixture)
- cleans: nothing
- actor: none
- lock: none

## Hop
- from: <layer.table>
- to: <layer.table>
- relationship: exact | dedup | filtered | aggregated | source
- grain: one row per <key>
- window: <n> days late-arrival, by <column> on each side | none — <why>
- dedup order: <column> desc        <!-- dedup only -->
- quarantine: <layer.table>          <!-- filtered only -->

## Oracle
- row-count: source settled rows = target settled rows
- distinct-keys: <key> on both sides
- sum: <measure> (decimal, own type)
- row-hash: <columns>, key-level anti-join names the rows that differ

## Tolerance
- exact

## Preconditions
- Fixture <path from §Data testing R7> loaded; it contains <the rows that make each check able to fail>

## Steps
1. Action: run the row-count check on both sides, inside the window
   Expected: source = target = <n>
2. Action: run the row-hash check
   Expected: 0 mismatched keys

## Expected Result
- <the hop relationship holds at value level; any difference names its key>

## Data
- Fixture rows that make the checks fail on a defect: <e.g. o-1 loaded twice (dedup), 199.98 amount (rounding)>
- Models: <layer>:<path>#<model> @ <sha>
