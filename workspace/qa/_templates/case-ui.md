# TC-UI-<MODULE>-<NNN> — [<Module> · Web] <Screen or dialog, as the user sees it> — <Actor> <action> [<state, viewport>] → <expected>
**Feature:** <slug>  **Plan:** <qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md
**Type:** ui  **Module:** <module>  **Priority:** P0–P3
**Platform:** web   <!-- or windows · macos (Electron desktop) · android · ios · other:<id> — never api (CONTRACTS §20) -->
**AC:** <AC-NNN, … from the analysis AC register | —>
**Tags:** @ui @<module> @P<n> @platform:web [@req:<slug>/REQ-NNN] @agentic:gen

<!-- Template (CONTRACTS §7, §20). Copy to <qa-root>/cases/ui/<module>/TC-UI-<MODULE>-<NNN>-<short-desc>.md.
     The `ui` type proves what a screen LOOKS like and whether it holds its shape — visual baselines
     and pixel-free layout rules — never a journey (e2e) or WCAG conformance (accessibility).
     qa:lint enforces the core sections plus ## Screen states · ## Viewports · ## Visual baseline ·
     ## Layout rules; **Platform:**, the @platform: tags and the title's platform agree.
     Title (CONTRACTS §7 Title, §20): [<Module> · <Platform label>]; actor is a role; → an observable
     outcome; ≤ 120 chars. Priority: layout-only/cosmetic → P3, P2 on a P0/P1 journey's screen.
     Guidance: .claude/skills/designing-ui-cases/SKILL.md + references/ui-heuristics.md -->

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
<ONE sentence: the screen and the states/viewports whose look or layout this case holds.>

## Technique
<!-- pairwise for state × viewport rows; BVA for longest-data layout; error-guessing for error states. -->
- pairwise → positive

## Isolation
- creates: <data that produces the states — factories; names of fixed-width digits>
- cleans: <teardown>
- actor: pool `<role>` (sees only its own data → deterministic states) | <named actor>
- lock: none

## Screen states
<!-- each with HOW it is seeded: factory · pool account · page.route stub — never click-through setup -->
- empty — <how>
- populated — <how>
- <loading · error · long/overflow data · permission-limited · dark mode · RTL> — <how, or "covered by TC-UI-…">

## Viewports
- 320, 768, 1280 CSS px wide (PROJECT-PROFILE §UI testing default) <!-- desktop: the app's window; mobile: §Mobile testing devices -->

## Visual baseline
- `<screen>-<state>-<width>.png` per Variants row, project `web-chromium`
- masked: <region — why (unique per run, date, avatar, other tests' data)> | nothing
<!-- "none — layout rules only: <reason>" when the screen cannot be frozen (live map, video) -->

## Layout rules
- no horizontal page scroll · no clipped text · no overlapping controls · targets ≥ 24×24 CSS px (WCAG 2.5.8)
- design tokens: <component → token from the declared token file> | skipped — no token file declared

## Preconditions
- <the actor is signed in by the setup project; [DATA:<entity>-<state>] tokens>

## Steps
1. Action: Seed the row's state, open <screen> at the row's width
   Expected: the screenshot matches `<screen>-<state>-<width>.png` within UI_MAX_DIFF_PIXEL_RATIO

## Variants
| Row | Technique | Input | Expected |
|---|---|---|---|
| e320 | pairwise | empty, 320 px | matches <screen>-empty-320 |
| p1280 | pairwise | populated, 1280 px | matches <screen>-populated-1280 |

## Expected Result
- <every row matches its baseline; the layout rules hold at every viewport>

## Data
- <values that produce the states; baselines under <qa-root>/scripts/ui/__screenshots__/<os>/<project>/…>
