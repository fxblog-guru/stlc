# TC-E2E-<MODULE>-<NNN> — [<Module> · Web] <Screen or dialog, as the user sees it> — <Actor> <action> [<condition>] → <expected>
**Feature:** <slug>  **Plan:** <qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md
**Type:** e2e  **Module:** <module>  **Priority:** P0–P3
**Platform:** web   <!-- or windows · macos · android · ios · other:<id> (PROJECT-PROFILE §Platforms, CONTRACTS §20) -->
**AC:** <AC-NNN, … from the analysis AC register | —>
**Tags:** @e2e @<module> @P<n> @platform:web [@req:REQ-NNN] @agentic:gen

<!-- Template (CONTRACTS §7). Copy to <qa-root>/cases/e2e/<module>/TC-E2E-<MODULE>-<NNN>-<short-desc>.md.
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
- use-case → journey, positive
- error-guessing → negative

## Isolation
<!-- What the case owns, so cases can run in parallel. `lock:` names shared state that cannot be
     isolated (a singleton setting, a device); `none` otherwise. -->
- creates: <records the journey creates>
- cleans: <deleted through the API in teardown>
- actor: pool `<role>`
- lock: none

## Preconditions
- Signed in as a `<role>` pool user; [DATA:<entity>-<state>]

## Steps
<!-- Numbered; one action per step; every step has an Expected with an observable value.
     e2e: exact UI element names and navigation paths; one UI action per step. -->
1. Action: Navigate to <Menu > Item>
   Expected: the "<form/page name>" opens with <visible state>
2. Action: <enter/click the exact element>
   Expected: <toast/text/URL/row that proves it>

## Variants
<!-- Extra inputs for the SAME intent go here as rows, not as extra steps. Delete when unused. -->
| Row | Technique | Input | Expected |
|---|---|---|---|
| 1 | error-guessing | <invalid input> | inline error "<exact text>"; nothing saved |

## Expected Result
- <final visible state of the journey>

## Data
- <values entered; [DATA:] tokens>
