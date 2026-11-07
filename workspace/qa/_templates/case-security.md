# TC-SEC-<MODULE>-<NNN> — [<Module> · API] <METHOD /path | operationId> — <Actor> <action> [<condition>] → <expected>
**Feature:** <slug>  **Plan:** <qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md
**Type:** security  **Module:** <module>  **Priority:** P0–P3
**Platform:** api
**AC:** <AC-NNN, … from the analysis AC register | —>
**Tags:** @security @<module> @P<n> @platform:api [@req:REQ-NNN] @agentic:gen

<!-- Template (CONTRACTS §7). Copy to <qa-root>/cases/security/<module>/TC-SEC-<MODULE>-<NNN>-<short-desc>.md.
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
- decision-table → authz, negative

## Isolation
<!-- What the case owns, so cases can run in parallel. `lock:` names shared state that cannot be
     isolated (a singleton setting, a device); `none` otherwise. -->
- creates: <nothing | entities owned by another tenant for IDOR>
- cleans: <teardown>
- actor: pool `<role under test>`
- lock: none

## OWASP ref
- A01

## Authorization
- Target: <own application> — surface: <API/route>
- Environment: <env authorized in §Environments>
- Scope: own application only

## Preconditions
- Signed in as `<role>`

## Steps
<!-- Numbered; one action per step; every step has an Expected with an observable value.
     security: every denied cell asserts the refusal AND that nothing leaked or changed. -->
1. Action: <METHOD /path> as <role>
   Expected: 403; body = { code: "forbidden" }; no <resource> fields in the body

## Variants
<!-- Extra inputs for the SAME intent go here as rows, not as extra steps. Delete when unused. -->
| Row | Technique | Input | Expected |
|---|---|---|---|
| 1 | decision-table | <role × action cell> | <401 | 403 | 404 per contract> |

## Expected Result
- <the control holds: denied, nothing exposed>

## Data
- <roles, tenants, payloads>
