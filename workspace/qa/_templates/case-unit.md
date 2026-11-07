# TC-UNIT-<MODULE>-<NNN> — [<Module> · API] <Subject.symbol> — <Actor> <action> [<condition>] → <expected>
**Feature:** <slug>  **Plan:** <qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md
**Type:** unit  **Module:** <module>  **Priority:** P0–P3
**Platform:** api
**AC:** <AC-NNN, … from the analysis AC register | —>
**Tags:** @unit @<module> @P<n> @platform:api [@req:REQ-NNN] @agentic:gen

<!-- Template (CONTRACTS §7). Copy to <qa-root>/cases/unit/<module>/TC-UNIT-<MODULE>-<NNN>-<short-desc>.md.
     qa:lint enforces: header line agrees with folder and tags · every core section present and
     non-empty · Objective = one sentence · Technique from the vocabulary · Isolation has
     creates/cleans/actor · every step has an Expected · [DATA:] tokens defined in <qa-root>/docs/test-data.md.
     Title (CONTRACTS §7 Title, §20): [<Module> · <Platform label>] = the module folder in Title Case, then the platform labels; actor is a role, never
     "the user"; → names an observable outcome; no "Verify that"/"Ensure"/bare "successfully"; ≤ 120 chars.
     Priority (CONTRACTS §7 Priority): never above the REQ's priority unless a `Priority reason:` line
     follows the header (authz/security denial or data integrity only).
     Vague Expected words (works, correct, properly, as expected, fine, ok, a bare "successfully")
     are warnings. Techniques: .claude/skills/qa-phase-protocol/references/test-design-techniques.md
     (shared by every designing-* skill). -->

## Grounding
<!-- What this case was designed FROM, read before it was written (CONTRACTS §7, §10). One source a
     line; a cited BR needs its compiled wiki page, a cited path must exist. P0/P1 grounded in
     nothing fails /qa-review (UNGROUNDED).
     - BR-NNN — wiki/compiled/business-rules/br-NNN-<desc>.md
     - wiki: wiki/compiled/<category>/<page>.md
     - code: <layer>:<path>#<symbol> @ <short-sha>
     - impact: analysis/<slug>/YYYY-MM-DD-impact.md §<n>
     - ticket: <KEY> § <field>
     - standard: <WCAG 2.2 1.4.3 | OWASP ASVS 4.2.1 …>   (accessibility, security)
     - profile: §<section>   (an SLO or gate — performance)
     - none — <why no rule, page or code applies> -->
- BR-NNN — wiki/compiled/business-rules/br-NNN-<short-desc>.md

## Objective
<ONE sentence: the single intent this case proves. A second intent is a second case.>

## Technique
<!-- One per line: `- <technique>[, <technique>] [→ <axis>, …]`. Techniques: EP | BVA |
     decision-table | state-transition | pairwise | error-guessing | use-case | checklist.
     Axes (what qa:score counts): positive | negative | boundary | authz | error-contract | journey. -->
- EP → positive, negative
- BVA → boundary

## Isolation
<!-- What the case owns, so cases can run in parallel. `lock:` names shared state that cannot be
     isolated (a singleton setting, a device); `none` otherwise. -->
- creates: nothing (in-memory values)
- cleans: nothing
- actor: none
- lock: none

## Subject
- <layer>:<path>#<symbol> @ <sha>   <!-- or TESTABILITY-GAP: <reason> -->

## Test matrix
| Row | Given (input / state) | When (call) | Then (expected) | Technique | Guards |
|---|---|---|---|---|---|
| 1 | <input> | <call> | <value or exception> | <technique> | <token guarded> |

## Doubles
- <ports faked, never the subject | none>

## Preconditions
- none — Given is hermetic (no I/O, clock, random)

## Steps
<!-- one numbered step per matrix row, same order -->
1. Action: Row 1
   Expected: <the Then of row 1>

## Expected Result
- <the subject's contract holds across every row>

## Data
- <constants cited from the subject>
