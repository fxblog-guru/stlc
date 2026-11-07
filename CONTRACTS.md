---
bundle: agentic-fx-qa
schema: 1
---

# CONTRACTS.md — the single source of truth for every cross-file contract

Skills, agents, and commands REFERENCE this file; they do not copy it. **When any other file in
this bundle disagrees with CONTRACTS.md, CONTRACTS.md wins** — fix the other file. The mechanical
half of these rules is enforced by `npm run qa:lint` (`<qa-root>/scripts/shared/lint-qa.mjs`; the QA
root is `.stlc/` or `<qa-root>/`, §2).

## 1. Identifiers

| Id | Format | Rules |
|---|---|---|
| Requirement | `REQ-NNN` (zero-padded, ≥3 digits: `REQ-001`), unique **within one slug** | permanent; never renumbered; the join key between analysis and traceability. Outside the slug's own files it is written slug-qualified: `<slug>/REQ-NNN` (below) |
| Acceptance criterion | `AC-NNN`, unique within one slug; slug-qualified `<slug>/AC-NNN` outside it | minted by the dev bundle's handoff packet, kept verbatim |
| Test case | `TC-<TYPE>-<MODULE>-<NNN>` — TYPE ∈ `API INT E2E SEC PERF UNIT A11Y MOB UI DATA`, MODULE UPPER-KEBAB, NNN 3 digits, next free **per module folder** | identity = REQ set + normalized title, never the NNN; files are not renamed except by `renumber-case.mjs` to resolve a collision (below) |
| Defect | `DEF-<slug>-NNN` | one OPEN defect per distinct failure; recurrences append, never twin; lifecycle in §13 |
| Exploratory session | `XS-<slug>-NNN` | one file per charter/session (§14) |
| Business rule | `BR-NNN` | permanent, wiki-owned |
| Clarification | `Q-NNN` | per-slug sheet |
| Run | `<run-id>` = `YYYY-MM-DD-HHmm` | every run has its `<qa-root>/runs/<type>/<slug>/<run-id>/` folder — no run without evidence |
| TMS id | `@tms:<id>` — ADO work-item number (`48211`) or Jira key (`PROJ-1234`) | only a REAL id returned by the TMS, written by `/qa-publish`; defects use `@tms-bug:<id>` |

**Slug-qualified requirement refs.** REQ and AC numbers restart per feature: the dev bundle numbers
`REQ-001` per slug, and a handoff packet's ids are kept verbatim (`analyzing-docs`). A bare `REQ-001`
is therefore ambiguous anywhere that sees more than one feature. Case tags and spec annotations
write `@req:<slug>/REQ-NNN` and `@ac:<slug>/AC-NNN` (the Playwright kit's `caseMeta` already
annotates `<slug>/REQ-NNN`). The traceability `Req` column stays bare `REQ-NNN` — the table lives in
one slug's plan. `qa:lint` accepts the legacy `@req:REQ-NNN` with a warning and errors on a slug
with no plan. Numbering: with a dev handoff packet the packet's ids are the register, and a REQ
found only in another input continues after the packet's highest id; without a packet QA mints
`REQ-NNN` itself, starting at `REQ-001` for a new slug and continuing from the slug's own highest id
on a brownfield re-analysis. A slug never continues another slug's numbering.

**Case-id collisions.** NNN is the next free number in the module folder on the designer's branch,
so two branches can mint the same id; git merges both files without a conflict. `qa:lint` errors
on two case files with one Case ID, on a traceability row whose Case ID has no case file, and on a
case whose `**Feature:**` slug has no plan. The fix is mechanical and done by whoever merges second:
`node scripts/shared/renumber-case.mjs <case-file> [<new-id>] [--dry-run]` renames that case and its
mirrored scripts, rewrites its H1, its rows in its own plan (and `re-verify` rows pointing at it),
and its staged-handoff rows, then lists — never rewrites — the impact-map, suite, quarantine and
defect lines that name the old id, because only a person knows which of the twins they meant. A
case that was already published (`@tms:`) or has run history is the one that KEEPS its id.

## 2. Artifact paths (all relative to the QA root, `<qa-root>/`: `.stlc/` by default, `qa/` kept)

**The QA root.** Every artifact below sits under one folder, written `<qa-root>/` in this bundle. A
new project keeps it in `.stlc/`, out of the product's tree. A project installed before 2.1 keeps
`qa/`, which stays fully supported: nothing has to move. One resolver,
`<qa-root>/scripts/shared/lib/root.mjs`, finds it in this order:

1. an explicit `--root <path>`;
2. `QA_ROOT` (env), relative to the project root;
3. PROJECT-PROFILE `QA root`, unless the line still carries the template's `(default)` marker;
4. whichever of `.stlc/` or `qa/` exists, `.stlc/` first;
5. `.stlc`.

Scripts that run inside the root (`npm run …`) take it from `QA_ROOT_DIR`, else the working
directory. **Recorded paths** (a review's `reviewed:`, a readiness report's `inputs:`, a
traceability `Report` cell, a HANDOFF `Staged script`, `state.json`) are project-relative, and
**both prefixes, `qa/` and `.stlc/`, name the QA root** whatever it is called today, so a record
written before a migration still resolves after it. Newly written paths use the root's real name.
Hashes cover file bodies, never a path (§18). `node <qa-root>/scripts/shared/migrate-root.mjs --to
.stlc|qa [--write]` moves a project between the two (a dry run without `--write`): `git mv`, the
profile key, recorded prefixes wherever no hash covers them, the wiring (package.json, .gitignore,
CI, playwright.config, `.claude/settings.json`), then a rebuilt `state.json`. `afx update` never
moves a root.

```
analysis/<slug>/YYYY-MM-DD-analysis.md            plans/<slug>/YYYY-MM-DD-{strategy,test-plan,estimate}.md
analysis/<slug>/YYYY-MM-DD-clarifications.md      cases/<type>/[<surface>/]<module>/TC-<TYPE>-<MODULE>-<NNN>-<short-desc>.md
analysis/<slug>/YYYY-MM-DD-impact.md              docs/impact-map.md   # BR ↔ module ↔ endpoint/screen ↔ TC (§10)
analysis/<slug>/sources/<KEY>.md                  # snapshot of a ticket fetched from the tracker (Jira key) — the cited input
scripts/<type>/[<surface>/]<module>/<same-TC-basename>.{spec.ts|js|conf}   # mirrors cases 1:1 (accessibility, ui → .spec.ts)
scripts/<type>/__screenshots__/<os>/<project>/<spec path>/<name>.png   # ui: visual baselines per OS × project (§20)
scripts/<type>/HANDOFF.md                         # a platform on a non-Playwright runner (appium-desktop, other:<id>): staged → its repo (§20)
scripts/unit/<module>/<same-TC-basename>.<ext>    # unit: STAGED mirror (.test.ts|.cs|.py|.java|.kt per §11)
scripts/unit/HANDOFF.md                           # unit: staged → repo target path, status (§11)
scripts/mobile/<module>/<same-TC-basename>.spec.ts   # mobile: STAGED mirror (WDIO spec — §15)
scripts/mobile/HANDOFF.md                         # mobile: staged → mobile framework repo path, status (§15)
scripts/data/<module>/<same-TC-basename>.<ext>    # data: STAGED mirror (.sql|.yml|.py per §28)
scripts/data/HANDOFF.md                           # data: staged → pipeline repo target path, status (§28)
scripts/shared/                                   # the shipped shared layer (fixtures · http · db · schemas · pages · a11y · constants)
runs/<type>/<slug>/<run-id>/                      runs/env-checks/<env>/<run-id>/readiness.md
runs/unit/<slug>/<run-id>/coverage-summary.md     # unit: per-module line/branch % (§11)
runs/{security,accessibility}/<slug>/<run-id>/findings.md   # 7-column findings table (§7 note)
runs/mobile/<slug>/<run-id>/device-matrix.md      # mobile: per-device verdicts (§15)
runs/data/<slug>/<run-id>/recon-summary.md        # data: per-hop reconciliation verdicts (§28)
runs/performance/<slug>/<run-id>/perf-verdict.md  # performance: budget + baseline verdict (qa:perf)
baselines/performance/<Case ID>.json              # performance: the signed-off run a case is compared with (committed)
reports/<slug>/YYYY-MM-DD-report.md               reports/release/<id>/YYYY-MM-DD-signoff.md
reports/metrics/YYYY-MM-DD-metrics.md             defects/<slug>/DEF-<slug>-NNN-<short-slug>.md
reports/coverage/YYYY-MM-DD-coverage.md           # /qa-coverage — what the suite covers of the app (§22)
defects/ESCAPES.md                                # escaped-defect ledger (§13)
reviews/<slug>/YYYY-MM-DD-case-review.md          regression/regression-suite.md
reviews/<slug>/YYYY-MM-DD-unit-review.md          regression/quarantine.md          # quarantine ledger (§12)
exploratory/<slug>/XS-<slug>-NNN-<charter-slug>.md   # exploratory session sheets (§14)
run-plans/<name>.md                               # run plans: a saved selection you pick and run (§19)
reviews/_pr/<pr-id>-<YYYY-MM-DD-HHmm>.md          # /qa-review-pr — a teammate's testing PR (§21); `_pr` is never a slug
runs/plans/<name>/<run-id>/                       # a run plan's evidence (summary.md · junit.xml · results.json)
docs/{tag-taxonomy,element-registry,test-data,impact-map}.md fixtures/   ci/   # CI templates (gitlab · github)
state.json                                        # DERIVED read model (§17) — never hand-edited, git-ignored
```

`<short-desc>` / `<short-slug>` / `<charter-slug>`: **lowercase-kebab**. `<surface>` only when
PROJECT-PROFILE §Application under test declares Surfaces.

### 2.1 Artifact front matter (2.1)

Analysis, clarifications, impact notes, strategies, test plans, estimates, defects and exploratory
sheets open with the same block. Then the tools read a status instead of parsing prose:

```yaml
---
slug: <slug>                # the folder it sits in
artifact: <analysis|clarifications|impact|strategy|test-plan|estimate|defect|exploratory>
status: <draft|in-review|superseded>
authored_by: <skill name>
reviewed_by: <review skill name | pending>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
---
```

There is no `approved` status, for the reason the dev bundle gives: whether an artifact passed is
recorded in its review (`reviews/<slug>/…`, §18), never in the artifact. `authored_by` and
`reviewed_by` are never the same skill. Reports, sign-offs and reviews keep their own front matter
(§16, §18). Cases carry header lines instead (§7). `qa:lint` warns on a missing block through 2.1.x
(an error from 2.2) and errors on a block with a missing key, a `slug` that disagrees with the
folder, or an `artifact` that disagrees with the file name.

**Clarifications** (2.3). Each question in `analysis/<slug>/YYYY-MM-DD-clarifications.md` is a
`### Q-NNN [BLOCKING|NON-BLOCKING] — <question>` heading with exactly one marker and a `**Status:**`
line: `OPEN` · `ANSWERED — <answer> (<date>, <who>)` · `assumed — autonomous-run …` (§24). A
BLOCKING question is open until `ANSWERED`; an assumed one is not an answer. `qa:lint` errors on a
missing or doubled marker, a missing status, and a `YYYY-MM-DD-test-plan.md` for the slug dated on or
after a non-superseded sheet that still has an open BLOCKING question: planning waits for the answer.

## 3. The traceability table (single source of truth)

Heading, byte-exact: `## Traceability (Requirement ↔ Case)`
Columns, byte-exact: `| Req | Case ID | Type | Module | Priority | Scripted | Last run | Status | Report |`

Created **EMPTY** by planning-tests (zero data rows — never pre-seeded). Column ownership:
designers APPEND rows (run columns filled `—`) → generators flip `Scripted ❌→✅` → execution
fills `Last run`/`Status`/`Report` → report/gates READ ONLY. Nobody edits another owner's column.
A case tagged `@manual` keeps `Scripted` ❌ for life; reports count it under `manual`, never under
"not automated".

**Status vocabulary** (`qa:lint` checks it): `✅` · `❌` · `⛔ <reason>` (could not execute — re-triaged
every run) · `⊘ deprecated` (the case no longer describes the product; kept as history, never run,
never in a suite — distinct from blocked) · `—` (not run yet). `⊘ deprecated` and the case's
`@deprecated:<slug>` tag (the slug whose change retired it) are written together by the designer;
`qa:lint` errors when one is present without the other.

**Re-verify rows.** A new slug that lands on modules with existing cases re-runs them under its own
plan. Its table carries one row per baseline case from the impact note's `## 3. Existing cases to
re-verify`: `Req` = `re-verify:<baseline-slug>`, `Case ID` = the baseline case, `Type`/`Module`/
`Priority`/`Scripted` copied from the baseline row, run columns `—`. `planning-tests` appends them
(the one exception to "created empty"), `/qa-run` runs them with the slug's own rows and fills
their run columns here — the baseline plan's row is left alone. `qa:lint` errors when the case's
`**Feature:**` is not `<baseline-slug>`, when the row names its own slug, or when the case is
deprecated. A case that appears in another slug's table under a plain `REQ-NNN` is a warning: it
should be a re-verify row.

## 4. Plan section headings (byte-exact, in order)

`## 1. Coverage targets` · `## 2. Schedule of phases` · `## 3. Roles` ·
`## 4. Phase entry/exit gates` · `## Performance SLOs` · `## Quality gates` ·
`## Traceability (Requirement ↔ Case)` · `## AC coverage` · `## Test environment` ·
`## Suspension & resumption` · `## Risk register` · `## Approvals` · `## Change log`

The five headings between the traceability table and the change log are a MINOR addition (CHANGELOG
[Unreleased]): appended, the earlier order unchanged, to cover the ISO/IEC/IEEE 29119-3 test-plan items the plan lacked.
`## AC coverage` columns, byte-exact: `| AC | REQ | Case IDs | Status |` — one row per AC in the
analysis AC register (§7), `Case IDs` comma-separated or `—`, `Status` ∈ `covered | partial |
not covered | deferred (<reason>)`. `## Approvals` columns: `| Role | Name | Decision | Date |`.
**Once the traceability table has a row**, the tables under `## 1.`–`## 4.`, `## Quality gates` and
`## Approvals` must have rows and the three prose sections must not be empty — a plan is filled
before cases are designed against it. `## Risk register` may be a link to the analysis §6 table.

## 5. Failure triage vocabulary (canonical tokens, written by executing-tests into failures.md)

`FUNCTIONAL` (product wrong → `/qa-defect`) · `SCRIPT` (test wrong → `/qa-heal`) ·
`SETUP/ENV` (fixture/data/env/config → setup fix or `/qa-env`) ·
`FLAKY` (identical immediate re-run passed → `/qa-quarantine` decision; Status stays ❌).
No other tokens. `/qa-report` and `/qa-defect` match these verbatim. A failure raised by the
`serverWatch` fixture (server log lines matching `QA_SERVER_LOG_FAIL` during the test), a fuzz finding
and a broken model invariant are `FUNCTIONAL`, with the log excerpt / printed request + seed / minimal
sequence as the evidence. `npm run qa:triage` (`triage.md` in the run folder) groups failures by
cause and suggests one of these tokens with its reason; it is input to the decision, never the
classification, and never writes `failures.md`. The traceability `Status`
is always the truth of the run — a quarantined case that fails is still ❌ in the table; the
quarantine (§12) changes how gates COUNT it, never what the table SAYS.

## 6. Tags

Vocabulary and slot order live in `<qa-root>/docs/tag-taxonomy.md` (the taxonomy is the source; this
section just names it). Writers: `@tms:` only `/qa-publish` (or `/qa-design` promoting an imported case from the project's own TMS, §29) · `@defect:` only `/qa-defect` ·
`@smoke`/`@regression` only `/qa-regression` · `@quarantined:<until>` only `/qa-quarantine` ·
`@manual` at design time only · `@deprecated:<slug>` at design time only, by the slug whose change
retired the case (with the `⊘ deprecated` Status, §3) · `@platform:<id>` at design time, one per
`**Platform:**` id (§20) · everything else at design time.
Suites and run sets exclude `@deprecated:` cases; `qa:lint` errors on one that still carries
`@smoke`/`@regression` or holds a row in a suite manifest.

## 7. Case file format (canonical block)

```markdown
# TC-<TYPE>-<MODULE>-<NNN> — [<Module> · <Platform label>] <Screen | Operation> — <Actor> <action> [<condition>] → <expected>
**Feature:** <slug>  **Plan:** <plan path>
**Type:** <type>  **Module:** <module>  **Priority:** P0–P3
**Platform:** <id>[, <id>…]   # web · android · ios · windows · macos · api · other:<id> (§20)
**AC:** <AC-NNN, … from the analysis AC register | —>
**Tags:** <per <qa-root>/docs/tag-taxonomy.md, in slot order>
## Grounding            # what it was designed FROM, read first: `- BR-NNN — <wiki page>` · `- wiki:` · `- code:` · `- impact:` · `- ticket:` · `- standard:` · `- profile:` · `- none — <why>`
## Objective            # ONE sentence — the single intent; a second intent is a second case
## Technique            # one or more lines: `- <technique>[, …] [→ <axis>, …]`
## Isolation            # creates: · cleans: · actor: (pool or named actor) · lock: (shared state | none)
## Preconditions        # [DATA:<entity>-<state>] tokens for reusable data (→ docs/test-data.md)
## Steps                # numbered; Action + Expected on EVERY step; ≥1 step
## Variants             # optional: | Row | Technique | Input | Expected | — more inputs, same intent
## Expected Result
## Data
```
Per-type skeletons: `<qa-root>/_templates/case-<type>.md` (one per type). A case that proves a
deploy check adds `**Deploy check:** <check>[, …]` under `**Tags:**` (§30).

**Grounding** (2.1) proves the knowledge was read before the case was written. Each line is one
source the designer opened. A cited `BR-NNN` must have a compiled wiki page
(`wiki/compiled/**/br-NNN-*.md`), and a cited `wiki/…` or `analysis/…` path must exist; `qa:lint`
errors otherwise. `- none` carries its reason. A missing or empty section is a lint error (2.3; a
warning through 2.2.x). A P0/P1 case grounded only in `none` is a warning; `/qa-review` fails
it as UNGROUNDED (High). The review also audits the other direction: every BR the analysis or impact
note names must be cited by at least one case (`## BR coverage`, §10).

**Title** (the H1 after the id). From the title alone a reader knows the module, the screen or
operation, the scenario and the expected outcome:
`# TC-<TYPE>-<MODULE>-<NNN> — [<Module> · <Platform label>] <Screen | Operation> — <Actor> <action> [<condition>] → <expected>`

- `[<Module> · <Platform label>]` — the case's module folder in Title Case, hyphen = space (`orders` →
  `Orders`, `purchase-orders` → `Purchase Orders`); it must match the folder (case-insensitive).
  **Error.** Then ` · ` and the labels of the case's `**Platform:**` ids, comma-separated: `[Orders · Web]`,
  `[Orders · Android, iOS]`, `[Orders · API]`, `[Orders · Windows]` (labels: Web, Android, iOS, Windows,
  macOS, API; `other:<id>` → the id in Title Case). A label that disagrees with the header: **error**;
  no platform segment: warning for one minor version (§20).
- `<Screen | Operation>` — UI types (e2e, accessibility, ui, mobile) name the screen or dialog as the user
  sees it (`Orders list`, `New order dialog`); api, integration and security name the operation as
  `METHOD /path` (`POST /orders`, `GET /orders/{id}`) or an operationId (anything else: warning);
  performance names the transaction; unit names the subject symbol (`OrderTotal.round`).
- Scenario — the actor as a role (`Owner`, `Viewer`, `Anonymous`, `Driver`; never `a user` /
  `the user` where roles differ: warning) + the action + an optional condition.
- `→ <expected>` — an observable outcome (status, message, state, value). Missing: **error**.
  ASCII `->` is accepted with a warning.
- Banned wording (**error**): `Verify that`, `Check that`, `Test that`, `Ensure`, a bare
  `successfully`, `works`, `properly`, `correctly`, `as expected`, `etc`.
- One intent: ` and ` joining two outcomes after `→` is a warning — split the case.
- Length: ≤ 140 characters after the id (**error** above; warning above 120). Segments are separated
  by ` — ` (em dash).
- **Scripts mirror the title.** A Playwright test title starts with the case id (a different id:
  **error**) and is `<case id> — <case title text>` (otherwise a warning); a table-driven test is
  `<case id> — row <Row>: <input> → <expected>`, where `<Row>` is a Row id of the case's
  `## Variants` table (any other: **error**; a Variants row with no test: warning). Steps are
  `test.step('Step N: …')`, N = the case step number, 1..n in order (gap or duplicate: **error**).
  Naming of files and support code: `<qa-root>/scripts/shared/README.md` § Script naming & numbering.

| Type | Example title |
|---|---|
| e2e | `TC-E2E-ORDERS-003 — [Orders · Web] New order dialog — Owner saves an order without lines → "Add at least one line" shown, nothing saved` |
| api | `TC-API-INVOICES-002 — [Invoices · API] POST /invoices/{id}/void — Owner voids a paid invoice → 409 invoice_paid` |
| security | `TC-SEC-PROJECTS-001 — [Projects · API] DELETE /projects/{id} — Viewer deletes a project → 403, project still readable` |
| accessibility | `TC-A11Y-CUSTOMERS-001 — [Customers · Web] Customers list — Keyboard user tabs through filters and table → focus order matches visual order` |
| ui | `TC-UI-PROJECTS-001 — [Projects · Web] Projects list — Owner opens it empty and populated at 320/768/1280 → matches the baseline, no overflow` |
| mobile | `TC-MOB-ORDERS-004 — [Orders · Android, iOS] Orders screen — Driver submits offline, then reconnects → exactly one Open order` |
| e2e (desktop) | `TC-E2E-INVOICES-007 — [Invoices · Windows] Export dialog — Accountant exports a month → CSV saved with 12 rows` |

**Priority** (`**Priority:**`, P0–P3). A case's priority is its REQ's priority (the analysis §6
`Priority hint` for that REQ, carried into the plan) adjusted by the scenario's role in that REQ:

| Case priority | When |
|---|---|
| P0 | the REQ is P0 and the case is its main success path; or an authz/security denial; or data loss, money or irreversible state — a failure blocks release |
| P1 | main negatives and error contracts of a P0/P1 REQ; the main success path of a P1 REQ |
| P2 | boundaries, alternative paths, less frequent roles of a P0/P1 REQ; anything of a P2 REQ |
| P3 | cosmetic, copy or layout-only checks, rare edge cases; anything of a P3 REQ |

A case is never higher than the highest priority among its REQs, except an authz/security denial or
a data-integrity case, which may be raised to P0 with a one-line `Priority reason: <why>` directly
under the header lines (**error** otherwise). `**Priority:**`, the `@P<n>` tag and the traceability
`Priority` cell are the same value (**error** when any two disagree).

- **Header line** `**Type:**`/`**Module:**`/`**Priority:**` agrees with the id stem, the module
  folder and the `@P<n>` tag. `**AC:**` lists ids from the AC register of the feature's analysis
  (`### AC register (AC ↔ REQ)`, columns byte-exact `| AC | REQ | Acceptance criterion (verbatim) | Source |`,
  criteria carried verbatim from the dev handoff or ticket when present) or `—`.
- **Technique** vocabulary: `EP` · `BVA` · `decision-table` · `state-transition` · `pairwise` ·
  `error-guessing` · `use-case` · `checklist`. Coverage **axes** a line may claim after `→`:
  `positive` · `negative` · `boundary` · `authz` · `error-contract` · `journey`; a line without `→`
  claims its technique's default (EP→positive, BVA→boundary, error-guessing→negative,
  use-case→journey+positive, decision-table/state-transition/pairwise→positive, checklist→none).
  Guidance: `skills/qa-phase-protocol/references/test-design-techniques.md`.
- **Core sections** (Objective · Technique · Isolation · Preconditions · Steps · Expected Result ·
  Data) are present and non-empty (`- none` when genuinely empty); performance cases replace Steps.
- **One intent per case.** Extra inputs for the same intent are `## Variants` rows, columns
  byte-exact `| Row | Technique | Input | Expected |`, never extra steps. There is no step-count
  minimum for any type; every step carries an `Expected:` with an observable value.
- **Vague Expected** wording (`works`, `correct`, `properly`, `as expected`, `fine`, `ok`, a bare
  `successfully`) is a lint warning; an empty Expected is an error.
- **Data tokens** `[DATA:<entity>-<state>]` (lowercase-kebab) must have a Glossary row in
  `docs/test-data.md` (Token cell = the token).
- **Coverage score** (`npm run qa:score`, `case-score.mjs`): per REQ in a plan's traceability table,
  the axes its cases claim (security cases also count `authz` + `negative`). A P0/P1 REQ with an
  api/integration/e2e/security/unit/mobile case must have `negative`; with an api case also `authz`
  and `error-contract`; with an e2e case also `journey`. A gap exits 1 unless listed in
  `--baseline <file>` (`<slug>/<REQ>/<axis>` per line).
Security cases add `## OWASP ref` (bare `A01`…`A10`) + `## Authorization`; performance cases add
`## Workload` + `## SLOs`; unit cases add `## Subject` (the unit under test as a §10 citation
`<layer>:<path>#<symbol> @ <sha>`, or `TESTABILITY-GAP: <reason>`), `## Test matrix` (columns
byte-exact: `| Row | Given (input / state) | When (call) | Then (expected) | Technique | Guards |`)
and `## Doubles` (ports that may be faked; the subject never) — their `## Steps` = one step per
matrix row; mobile cases add `## Platforms` (the platforms the case must pass on: `android`, `ios`, or
both — plus any platform-specific Expected deltas) and `## Device profile` (device names from the
§Mobile testing matrix, plus the device conditions the case exercises: orientation, network, permission
state, interrupt, locale — `default` when none); accessibility cases add `## WCAG ref` (bare success-criterion ids `1.4.3`, `2.1.1`, …
plus the conformance target `WCAG 2.2 AA`) + `## Scope` (screen/route, UI state, viewport, and
`automated` | `manual` check kind); ui cases add `## Screen states` (empty · loading · error ·
populated · long/overflow data · permission-limited — each with how it is seeded), `## Viewports`
(from the §Platforms targets; web default `320, 768, 1280`, plus a `- skin: light | dark` line: a
baseline names the skin it was taken in, because a headless browser follows the host's setting), `## Visual baseline` (the screenshots,
the masked regions and why each is masked) and `## Layout rules` (the pixel-free checks: no horizontal
page scroll, no clipped text, no overlapping controls, touch targets ≥ 24×24 CSS px, focus visible,
design tokens when §UI testing declares a token file). Run columns at design time: `—`.

**Bug-hunting cases** (generated inputs and orders — `designing-functional-cases` Step 1b,
`designing-api-cases` Step 3c):
- **Model test** = an api case with Technique `state-transition` and a `## Model` section after
  `## Steps`: `- State:` · `- Actions (pre → call → model update):` (one sub-bullet per action) ·
  `- Invariants (after every step, against the API):` (one sub-bullet each, the business rule as a
  sentence) · `- Budget:` (runs × steps, seed variable, shrink limit) · `- Model code:` (the
  `scripts/shared/model/<module>.model.ts` path). Its title's operation slot is `model <name>`.
- **Fuzz case** = an api case in the cross-module folder `cases/api/_fuzz/` (a leading `_` marks a
  folder that is not one module; `**Module:**` and `[<Module>]` drop the `_`), operation slot
  `every OpenAPI operation`, one `## Variants` row per actor, and in `## Data` the opt-in lines
  `- fuzz-allow: <operationId, … | *>` and `- fuzz-deny: <operationId> (<reason>), …`.
- **UI risk classes** = an optional `## UI risk classes` section on e2e cases, one line per class
  of `designing-functional-cases` Step 1b the case exercises; `reviewing-cases` indexes it.

**Findings table** (security and accessibility runs write `findings.md`; `reporting-results` reads
it) — columns byte-exact: `| ID | Severity | Source | Evidence | Affected REQ | Case | Status |`.
`ID` = `SEC-F-NNN` | `A11Y-F-NNN` (sequential per run) · `Severity` ∈ `Critical High Medium Low`
(axe impact maps critical→Critical, serious→High, moderate→Medium, minor→Low) ·
`Status` ∈ `open | triaged | false-positive | resolved`.

## 8. Language rule

Artifact PROSE follows PROJECT-PROFILE §Project → Artifact language (steps, descriptions,
reports may be written in the team's language). STRUCTURAL tokens are English and byte-exact
regardless: section headings, table columns, ids (`REQ-`/`TC-`/`DEF-`/`BR-`/`Q-`/`XS-`), tags,
status values (`APPROVED`, `✅/❌/⛔/⊘ deprecated`, `OPEN/CLOSED`), and triage tokens
(`FUNCTIONAL`/`SCRIPT`/`SETUP/ENV`/`FLAKY`) — parsers, gates, and `qa:lint` match them literally.

## 9. Behavioral invariants

1. Cases are located by content (traceability / `**Feature:**` grep), never by filename glob.
2. Nothing is fabricated — REQ-ids, locators, endpoints, numbers, TMS ids. Gaps are reported as gaps.
3. Runs never fix; generators never run — execution belongs to `/qa-run` with its run folder.
4. A gate without data is `not evaluable`, never `pass`. A stale report cannot sign a release.
5. Security/performance touch only the app in §Application under test, on §Environments-authorized envs.
6. Application source is read-only grounding: no skill edits, builds, runs, or re-indexes it. A code fact
   without a `<layer>:<path>#<symbol> @ <short-sha>` citation (§10) is a gap; wiki, Code KB, and
   impact-map silence are gaps — never inferred.
   **The three declared exceptions — the `unit` type (§11), the `mobile` type (§15) and the `data` type (§28):**
   `executing-tests` may run ONLY the commands declared in PROJECT-PROFILE §Unit testing /
   §Mobile testing / §Data testing, and `generating-unit-script` / `generating-mobile-script` /
   `generating-data-script` may write ONLY under the test directories declared there, ONLY when that
   section's Write mode is `apply`. A data run reads the warehouse through the declared commands only;
   it never writes to a production schema.
   Production source paths (and a mobile framework's `src/` layers) are never written by anyone; a
   subject that cannot be tested without changing production code is a `TESTABILITY-GAP` handed to
   the developers, never a refactor. A missing screen object or util in the mobile framework is a
   `FRAMEWORK-GAP` in the handoff Notes — the bundle stages the spec, developers extend the layer.
7. Quarantine is visible, bounded, and owned (§12): a flaky case is never silently retried, skipped,
   or deleted — it carries `@quarantined:<until>` and a ledger row, keeps running, and expires.
8. Every defect reaches an end state (§13): `CLOSED` only with a `**Resolution:**`, and
   `fixed` only after a passing verification run recorded in `## Verification`. Nobody closes a
   defect from memory.
9. Nothing is written to an external tracker or TMS (ADO, Jira) without the user's explicit
   confirmation of the exact list being pushed — reads are free, writes are confirmed.
10. A verdict is a claim about one system and stays true only while its parts do (§31): it names the
   system it reached (identity), counts only reads that were reads (observation), is judged by an
   oracle nobody moved (oracle), blames the product only after the harness is ruled out
   (attribution), closes a defect only on a guard that passed on a changed system (closure), is read
   against what changed (delta), and raises a defect only against something written down.

## 10. Knowledge grounding (wiki · Code KB · impact map · tracker)

| Source | Entry point | Citation shape | Writer |
|---|---|---|---|
| Domain wiki | `<qa-root>/wiki/compiled/index.md` → atomic page, read whole | `<page path> ← <sources: entry>` | `building-domain-wiki` only |
| Code KB | PROJECT-PROFILE §Code knowledge → MCP server `<project>-<layer>` (`search`, `read_document`) or `python3 -m rag search` in the repo; fallback read-only grep of §Source repos | `<layer>:<path>#<symbol-or-heading> @ <short-sha>` | nobody in this bundle — the repo's CI owns `rag ingest`/`eval` |
| Impact map | `<qa-root>/docs/impact-map.md` | row `(BR, Module)` | see ownership below |
| Tracker ticket | Jira key via the Atlassian MCP (`getJiraIssue`) → snapshot `analysis/<slug>/sources/<KEY>.md` | `<KEY> § <field or heading>` (from the snapshot, never from memory) | `analyzing-docs`, `analyzing-escaped-defects` (snapshot only — the ticket itself is never edited) |

Impact-map heading, byte-exact: `# Impact map`
Columns, byte-exact: `| BR | Module | Endpoint / Screen | TC | Last verified | Notes |`
Row identity = `(BR, Module)` · `BR` ∈ `BR-NNN` · `Module` = plan module folder name or `?` ·
`Endpoint / Screen` = Code KB citation(s) and/or `screen <name>` or `?` · `TC` = comma-separated
`TC-<TYPE>-<MODULE>-<NNN>` or `—` · `Last verified` = `YYYY-MM-DD` or `—`.
Ownership: `BR`/`Module` rows minted by `building-domain-wiki` (module `?`) and resolved by
`maintaining-impact-map` · `Endpoint / Screen` from `grounding-in-code` citations only · `TC` APPENDED by
the designing-* skills · `Last verified` written only by `/qa-impact` or a human. Rows are never deleted.
Rows are kept **sorted by BR number, then Module** and inserted in place, never appended: two
branches adding rows then touch different lines instead of both editing the table's last line.
`qa:lint` errors on an out-of-order row and warns on a `TC` id with no case file. The `Endpoint /
Screen` citations' paths are what `scripts/shared/changed-modules.mjs` matches a `git diff
--name-only` against (change-based selection, `/qa-impact` and `/qa-run`).

Impact note: `analysis/<slug>/YYYY-MM-DD-impact.md` — headings byte-exact, in order:
`## 1. Business rules touched` · `## 2. Modules & code touched` · `## 3. Existing cases to re-verify` ·
`## 4. Gaps & questions` · `## 5. Impact map delta`. Written only by `/qa-impact`; INPUT to analyze/plan/design.

## 11. Unit-test handoff (the `unit` type's bridge into the application repo)

Unit tests must live beside the code they test, so the `unit` type keeps the QA-side contract
intact and adds one bridge artifact:

| Artifact | Path | Rule |
|---|---|---|
| Case | `<qa-root>/cases/unit/<module>/TC-UNIT-<MODULE>-<NNN>-<short-desc>.md` | §7 format + `## Subject` / `## Test matrix` / `## Doubles` |
| Staged script (always written) | `<qa-root>/scripts/unit/<module>/<same-TC-basename>.<ext>` | `<ext>` by framework: `.test.ts` (vitest/jest) · `.cs` (xunit/nunit/mstest) · `.py` (pytest) · `.java`/`.kt` (junit5). Content = the exact file to land in the repo; `npm run qa:lint` mirror-checks it |
| Handoff table | `<qa-root>/scripts/unit/HANDOFF.md` | heading byte-exact `# Unit-test handoff`; columns byte-exact `\| Case ID \| Staged script \| Target path \| Write mode \| Status \| Applied \| Notes \|` (without the backslashes); row identity = `Case ID`; rows are never deleted |
| Target path | inside a §Unit testing test directory, named by that layer's **test-file convention** (e.g. `tests/Billing/PriceCalculatorTests.cs`, `src/billing/price.test.ts`) | the ONLY path outside `<qa-root>/` this bundle may write, and only in Write mode `apply` |
| Coverage summary | `<qa-root>/runs/unit/<slug>/<run-id>/coverage-summary.md` | columns byte-exact `\| Module \| Files \| Line % \| Branch % \| Target \| Verdict \|`; written by `executing-tests` from the declared coverage report, or `not evaluable` |

`Status` ∈ `proposed` (staged, awaiting a developer) · `applied` (written to the target path by
this bundle or a human, not yet on the default branch) · `merged` (on the default branch; `Applied`
= `YYYY-MM-DD`) · `rejected` (developer declined — reason in Notes) · `superseded` (case updated;
a newer staged file replaced it). `Write mode` ∈ `propose | apply` as it was at generation time.

Column ownership: `Case ID`/`Staged script`/`Target path`/`Write mode` written by
`generating-unit-script` · `Status` `proposed`→`applied` by `generating-unit-script` (apply mode)
or a human · `applied`→`merged`/`rejected` by a human (or `/qa-run --type unit` when it finds the
target file on the default branch at `HEAD`) · `Notes` appended by anyone (`TESTABILITY-GAP:`,
MR link). `executing-tests` marks a `proposed` case's row `⛔ blocked — awaiting handoff`, never
❌ and never ✅.

Test-to-case linkage inside the generated file is mandatory so run output maps back to the table:
the Case ID appears verbatim in the test container name/attribute (`describe('TC-UNIT-… — …')`,
`[Trait("Case", "TC-UNIT-…")]`, `class TestTcUnit…:` docstring or `@pytest.mark.case("TC-UNIT-…")`,
`@Tag("TC-UNIT-…")`) and every matrix row as a `// Row N:` (or `# Row N:`) marker.

## 12. Quarantine (flaky cases — visible, bounded, owned)

| Artifact | Rule |
|---|---|
| Tag | `@quarantined:<YYYY-MM-DD>` on the case's `**Tags:**` line — the date is the **expiry** (`Until`). Written and removed ONLY by `/qa-quarantine` (`curating-regression`, quarantine mode) |
| Ledger | `<qa-root>/regression/quarantine.md` — heading byte-exact `# Quarantine ledger`; columns byte-exact `\| Case ID \| Since \| Until \| Reason \| Evidence \| Ticket \| Released \|`; row identity = `(Case ID, Since)`; rows are never deleted — a release fills `Released` (`YYYY-MM-DD`), an extension appends a new row |
| Grant | `Until` ≤ `Since` + 30 days (§Quality gates → Flake budget may shorten it, never lengthen it). `Evidence` = the run-ids that proved the flake (a `FLAKY` triage in `failures.md`); `Ticket` = the tracker id for the fix, or `—` with the reason in `Reason` |
| Eligibility | e2e / api / integration / security-spec / accessibility / mobile cases only. **Unit tests are never quarantined** — a flaky unit test is a `NON-DETERMINISTIC` defect of the test (regen). Performance scenarios are never quarantined (a flaky SLO is a finding) |

Consequences everyone applies identically:
- `executing-tests` still RUNS quarantined cases and writes their true `Status`; the run summary
  lists them under `quarantined (excluded from gate)`.
- Gates (`reporting-results`, `summarizing-release`, `/qa-status`) exclude quarantined ❌ rows from
  the fail count and print the count `(quarantined: n — listed)`; a quarantined **P0/P1** case is a
  named CONDITION in `/qa-signoff`, never silent.
- `curating-regression` excludes quarantined cases from `@smoke`/`@regression`.
- `npm run qa:lint` errors on: a tag without an unreleased ledger row · an unreleased ledger row
  without the tag · `Until` past today without `Released` · `Until` − `Since` > 30 days · a
  `TC-UNIT`/`TC-PERF` case carrying the tag.

## 13. Defect lifecycle

Defect file header (byte-exact field names; `**Status:**`, `**Origin:**`, `**Resolution:**` are lint-checked):

```markdown
# DEF-<slug>-NNN — <title>
**Status:** OPEN | CLOSED   **Severity:** Critical | High | Medium | Low (<rule fired>)   **Raised:** YYYY-MM-DD   **Closed:** YYYY-MM-DD | —
**Origin:** INTERNAL | ESCAPED | EXPLORATORY   **Feature:** <slug>   **Case:** <TC-id | —>   **REQ:** <ids | —>   **Env:** <env>   **Run:** <run-id | —>
**Resolution:** — | fixed (verified <run-id>) | not-a-bug (<reason>) | duplicate of DEF-<slug>-NNN | wont-fix (accepted by <role> on YYYY-MM-DD)
## Steps to reproduce · ## Expected (verbatim from the case) · ## Actual (verbatim from the run output) · ## Evidence · ## Impact
## Recurrence     # appended per re-observation: `- <run-id> · <env> · <date>`
## Verification   # appended ONLY by /qa-defect --verify: `- <run-id> · <env> · <Case ID> ✅ · <date>`
## Escape analysis   # ESCAPED only (below)
```

Rules:
- `OPEN` → `CLOSED` is written ONLY by `reporting-defects` (`/qa-defect --verify`, or the verify pass
  that opens every `/qa-defect` run) and ONLY with a `**Resolution:**`. `fixed` requires a
  `## Verification` line whose run-id is newer than every `## Recurrence` run-id and whose case
  `Status` was ✅ in that run. `not-a-bug` / `duplicate` / `wont-fix` require the human's decision
  quoted in the resolution — never inferred.
- A `CLOSED` defect whose case fails again with the same Expected/Actual pair is **re-opened**
  (`**Status:** OPEN`, `**Closed:** —`, `**Resolution:** —`, a `## Recurrence` line) — never twinned.
- `@defect:` tags on the case stay after closure (history); `/qa-report` reads the file's Status.
- `**Origin:**` — `INTERNAL` (found by a run) · `ESCAPED` (found in production / by a customer /
  after release — via `/qa-escape`) · `EXPLORATORY` (found in a session sheet — via
  `/qa-defect --from-exploratory`).

**Escape analysis** (`ESCAPED` defects, headings byte-exact): `### Phase missed` — one token of
`ANALYZE | PLAN | DESIGN | SCRIPT | RUN | ENV | QUARANTINE | OUT-OF-SCOPE` with the evidence ·
`### Type missed` — the type that should have caught it (or `—`) · `### Backfill` — the exact
commands/artifacts that close the hole (REQ appended, case to design, regression seat, impact-map row).

**Escaped-defect ledger** `<qa-root>/defects/ESCAPES.md` — heading byte-exact `# Escaped defects`;
columns byte-exact `\| DEF \| Feature \| Reported \| Phase missed \| Type missed \| Backfill \| Status \|`;
row identity = `DEF`; `Backfill` = the `TC-…` id(s) designed since, or `pending`; written only by
`analyzing-escaped-defects` (row) and the designing-* skills (`Backfill` cell). `/qa-metrics` reads it
for the defect escape rate.

## 14. Exploratory sessions (session-based test management)

Path `<qa-root>/exploratory/<slug>/XS-<slug>-NNN-<charter-slug>.md`; headings byte-exact, in order:
`## Charter` (mission · areas · risks/BRs targeted · out of scope · timebox) · `## Session`
(tester · env · started · ended · build/sha) · `## Notes` (timestamped observations) · `## Bugs`
(columns byte-exact `\| # \| What happened \| Expected \| Evidence \| Status \|`, `Status` ∈
`candidate | raised DEF-<slug>-NNN | not-a-bug | duplicate DEF-<slug>-NNN`) · `## Follow-ups`
(columns byte-exact `\| # \| Kind \| Detail \| Action \|`, `Kind` ∈ `CASE | QUESTION | RISK | DATA`) ·
`## Debrief` (PROOF: Past · Results · Obstacles · Outlook · Feelings — one line each).

Writers: `## Charter` by `running-exploratory-sessions` (charter mode); `## Session`/`## Notes`/
`## Bugs`(rows)/`## Debrief` by the human tester or the skill's debrief mode from the tester's raw
notes; `## Bugs` `Status` `candidate → raised DEF-…` ONLY by `reporting-defects`
(`/qa-defect --from-exploratory`); `## Follow-ups` `Action` filled by the skill with the exact
command (`/qa-design <slug> --type <t>`, `/qa-clarify`, …). A session sheet is evidence, never a
traceability row: exploratory coverage appears in reports as `sessions: n (debriefed m)`.

An agent-driven mobile session may leave **flow seeds** beside its sheet:
`<qa-root>/exploratory/<slug>/XS-<slug>-NNN-seed-<n>.yaml`, a draft Maestro flow of a candidate the
agent reproduced twice, named by a `CASE` follow-up. A seed is never under `scripts/`, never run, linted
or counted; `generating-mobile-script` rewrites it onto the kit once the case exists.

## 15. Mobile-test handoff (the `mobile` type's bridge into the mobile automation repo)

Mobile specs must live inside the mobile framework repo (its WebdriverIO config, Appium drivers,
screen objects and device matrix are there), so the `mobile` type reuses the §11 bridge shape:

| Artifact | Path | Rule |
|---|---|---|
| Case | `<qa-root>/cases/mobile/<module>/TC-MOB-<MODULE>-<NNN>-<short-desc>.md` | §7 format + `## Platforms` / `## Device profile` |
| Staged spec (always written) | `<qa-root>/scripts/mobile/<module>/<same-TC-basename>.spec.ts` | the exact file to land in the framework repo (WDIO + Mocha, imports resolved against §Mobile testing path aliases); `npm run qa:lint` mirror-checks it |
| Handoff table | `<qa-root>/scripts/mobile/HANDOFF.md` | heading byte-exact `# Mobile-test handoff`; columns byte-exact `\| Case ID \| Staged script \| Target path \| Write mode \| Status \| Applied \| Notes \|` (without the backslashes); row identity = `Case ID`; rows are never deleted |
| Target path | inside a §Mobile testing test directory, named by that repo's **test-file convention** (e.g. `tests/regression/orders.negative.spec.ts`) | the ONLY path outside `<qa-root>/` this type may write, and only in Write mode `apply` |
| Device verdicts | `<qa-root>/runs/mobile/<slug>/<run-id>/device-matrix.md` | columns byte-exact `\| Device \| Platform \| OS \| Type \| Cases run \| Pass \| Fail \| Notes \|`; written by `executing-tests` from the run output, or `not evaluable` |

`Status` and `Write mode` vocabularies, column ownership, and the never-deleted rule are exactly
§11's. `executing-tests` marks a `proposed` case's row `⛔ blocked — awaiting handoff`, never ❌.

**Maestro (Runner `maestro`, §20) — the mobile type without a second repo.** When a mobile platform's
§Platforms Runner is `maestro`, the case's script is ONE flow that runs from `<qa-root>/` itself. Nothing is
staged, there is no HANDOFF row, and there is no Write mode:

| Artifact | Path | Rule |
|---|---|---|
| Flow | `<qa-root>/scripts/mobile/<module>/<same-TC-basename>.yaml` | `name:` = `<Case ID> — <case title>` (the JUnit test name); `appId: ${APP_ID}`; `tags:` = `mobile`, module, priority, suite tags (bare words); one `label: "Step N: …"` block per case step, 1..n; `id:` only from `${output.<module>.<key>}`; `timeout:` only from `${output.T.<name>}`; every `runFlow`/`runScript` path exists. All checked by `qa:lint` |
| Kit | `<qa-root>/scripts/shared/maestro/` — `config.yaml` · `elements/<module>.js` · `flows/*.yaml` · `scripts/*.js` | the layers a flow composes (README there); extended per module, never copied into a flow |
| Run | `npm run test:mobile:maestro -- --platform <android\|ios> [--tags …] [--cases …] [--device …]` | `.env.<env>` → `-e` variables (values never printed); `quarantined` always excluded |
| Evidence | `<qa-root>/runs/<…>/mobile/<platform>/` — `junit.xml` · `results.json` · `maestro-output.log` · `artifacts/` · `device.log` (Android); `repo-state.txt` beside it | a case is ✅ only when it passed on every platform it ran on; no report is ⛔ `SETUP/ENV` |
| Crashes | `results.json` `crashes[]` (`kind` `java` \| `anr` \| `native`, `line`, `title`, `excerpt`) and `deviceLog` (the log's path, or `not captured — <why>`) | the device log is cleared before the run and read after it, for the app id only; a crash fails the run even when every flow passed, and is `FUNCTIONAL` evidence — never a `FLAKY` retry, never healed |

One case has ONE mobile script: a `.yaml` flow and a `.spec.ts` for the same Case ID is an **error**.
A case on a `maestro` platform with only a staged spec is listed `⛔ blocked — awaiting handoff`
with the command that writes the flow.

Test-to-case linkage is mandatory: the Case ID appears verbatim in the spec's `describe` title
(`describe('TC-MOB-ORDERS-004 — … @regression', …)`) so the run output maps back to the table, and
every case step carries a `// Step N:` marker. Suite tags live in the title (the framework's Mocha
`grep` selects on them), never in a separate mechanism.

## 16. Report and sign-off contract (the parts the dev bundle parses)

`agentic-fx-dev` reads two of this bundle's files at its G10 deploy gate, read-only: the latest
feature report and, where one exists, the release sign-off. Everything it parses is below; the rest
of each document is prose for people and may evolve without a contract change.

The paths below are relative to the QA root (§2). A consumer looks under `.stlc/` and `qa/` alike
(the same order as §2: the profile, then whichever exists, `.stlc/` first); the files, keys,
headings and vocabulary are the same under either name.

**Feature report** `reports/<slug>/YYYY-MM-DD-report.md` — written only by `reporting-results`.
Front matter, keys byte-exact:

```yaml
---
slug: <slug>
date: YYYY-MM-DD
shipped_sha: <7–40 hex | —>      # the plan header's **Shipped SHA:** (from the dev handoff packet)
runs: [<run-id>, …]              # every run folder the report read
overall: pass | fail | not evaluable
---
```

Headings byte-exact, in order: `## Executive summary` · `## Coverage by type` · `## Quality gates` ·
`## Performance SLOs` · `## Security findings` · `## Unit coverage & handoff` ·
`## Accessibility findings` · `## Device matrix & mobile handoff` · `## Quarantined & manual` ·
`## Exploratory sessions` · `## Failure digest` · `## Deviations from plan` · `## Residual risk` ·
`## Trend` · `## Gaps & recommendations`. A section whose type is disabled or not run holds one
line saying so — never omitted.

`## Quality gates` columns byte-exact: `| Gate | Target | Actual | Verdict | Evidence |`.
`Verdict` ∈ `pass | fail | not evaluable`; `Evidence` names the row, file or run that decided it
(never empty — a verdict nobody can retrace is not a verdict). `overall` is **derived**: `fail` if
any row is `fail`, else `not evaluable` if any row is, else `pass`. `qa:lint` errors when the front
matter disagrees with the rows. Which gate rows exist is this bundle's choice (the dev bundle reads
the columns and `overall`, not row names); a plan with `re-verify` rows (§3) adds the row
`Re-verify set` — `pass` only when every re-verify row ran ✅ in a run at or after `shipped_sha`, so a
feature cannot go green at G10 with the baseline cases it touches unrun.

**Release sign-off** `reports/release/<id>/YYYY-MM-DD-signoff.md` — written only by
`summarizing-release`. Front matter: `release: <id>` · `date: YYYY-MM-DD` · `features: [<slug>, …]` ·
`recommendation: GO | NO-GO | CONDITIONAL GO`. Headings byte-exact, in order:
`## Executive summary` · `## Recommendation & conditions` · `## Feature posture` · `## Exit criteria` ·
`## Open defects` · `## Lessons learned` · `## Appendix`. `## Exit criteria` columns byte-exact:
`| # | Exit criterion | Verdict | Evidence |`, `Verdict` ∈ `met | NOT met | not evaluable`.
`## Recommendation & conditions` carries the table `| # | Condition | Owner | Due | Evidence |`.
Rules `qa:lint` enforces: `GO` requires every criterion `met`; `CONDITIONAL GO` requires at least
one condition row. The recommendation is advisory — release authority accepts or overrides it in
writing, outside this file.

**What the dev bundle does with them.** G10 is blocked until the latest report for the slug has
`overall: pass` (every `## Quality gates` row `pass`) and a `date` after the shipped SHA's G8 run,
or a sign-off whose `features` include the slug says `GO`, or a named human waives QA in writing on
its side. Changing a key, a heading or a vocabulary token here is a MAJOR version of this bundle and a
coordinated change on the other side.

`reports/metrics/` and `reports/retro/` are this bundle's own and are not parsed by anyone else.

## 17. `<qa-root>/state.json` — a derived read model, not a source of truth

The QA artifacts (plans, reports, defects, reviews, sign-offs, the quarantine ledger, env checks)
are authoritative. `<qa-root>/state.json` is **generated** from them by
`<qa-root>/scripts/shared/build-state.mjs`, never hand-edited, and rebuilt by the `Stop` hook at the end
of every turn. It is git-ignored in the workspace: it is a cache of the artifacts, not a record.
Its purpose is that nothing outside this bundle has to parse markdown — the VS Code board
(`editor/vscode-stlc`), CI and the `SessionStart` brief read this one file or the same derivation.

If `<qa-root>/state.json` and the artifacts disagree, **the artifacts are right**. The header makes the
disagreement detectable rather than silent:

```jsonc
{
  "schema": 1,
  "generator_version": "1.1.0",        // bumped when the derivation changes
  "generated_at": "2026-10-04T15:00:00Z",
  "source_hash": "<sha256 over every file read, as path:body-hash lines, sorted>",
  "project": "<§Project Name, or the project folder>",
  "types_enabled": ["unit", "api", "e2e"],   // §Test types rows with Enabled = yes; null = no profile found

  // Env checks belong to an environment, not to a feature: the newest readiness.md per env,
  // with its "Runnable verdict per enabled type" lines verbatim.
  "environments": [
    { "env": "uat", "run_id": "2026-09-10-0900", "path": "<qa-root>/runs/env-checks/uat/2026-09-10-0900/readiness.md",
      "verdicts": { "e2e": "READY", "performance": "BLOCKED" },    // READY | NOT READY | BLOCKED
      "stale": false, "changed": [] }                              // §18
  ],

  "slugs": [{
    "slug": "orders",
    "title": "orders",                  // from the plan's `# Test Plan — <title> — <date>` line
    "phase": "Report",                  // the ladder below
    "analysis": "<qa-root>/analysis/orders/2026-09-01-analysis.md",
    "plan": "<qa-root>/plans/orders/2026-09-01-test-plan.md",   // the newest *-test-plan.md, never a strategy or estimate

    "traceability": { "total_cases": 9, "scripted": 5, "last_run_pass": 2, "last_run_fail": 2,
                      "blocked": 1, "not_run": 4 },        // Status ✅ · ❌ · ⛔ · anything else
    "types": { "e2e": { "cases": 1, "scripted": 1, "pass": 0, "fail": 1, "blocked": 0 } },

    "review": { "date": "2026-09-05", "verdict": "READY FOR /qa-script",   // | REVISE FIRST | null
                "path": "<qa-root>/reviews/orders/2026-09-05-case-review.md",
                "reviewed": 8, "stale": false, "changed": [] },   // §18: null when it recorded no hashes

    "report": { "date": "2026-09-11", "path": "<qa-root>/reports/orders/2026-09-11-report.md",
                "overall": "fail", "shipped_sha": "8556e8f",
                "runs": ["2026-09-10-1000", "2026-09-10-1030"],
                "gates": [{ "gate": "Functional", "target": "…", "actual": "…", "verdict": "fail" }],
                "stale": true, "newer_runs": ["2026-09-10-1040"] },

    "signoff": { "release": "2026-09", "date": "2026-09-12", "recommendation": "NO-GO",
                 "path": "<qa-root>/reports/release/2026-09/2026-09-12-signoff.md", "conditions": [] },

    "defects": { "total_open": 2, "by_severity": { "Critical": 0, "High": 2, "Medium": 0, "Low": 0 },
                 "items": [{ "id": "DEF-orders-001", "severity": "High", "origin": "INTERNAL",
                             "title": "…", "path": "<qa-root>/defects/orders/DEF-orders-001-order-list-blank.md" }] },

    "quarantine": { "active": 1, "expired": 0, "nearest_expiry": "2026-09-30",
                    "items": [{ "case_id": "TC-E2E-ORDERS-001", "since": "2026-09-10", "until": "2026-09-30",
                                "reason": "…", "ticket": "PROJ-1001", "expired": false }] }
  }]
}
```

**Slugs** are the folder names §2 keys by slug — under `analysis/`, `plans/`, `reports/` (except
`release/`, `metrics/`, `retro/`), `defects/`, `reviews/`, `exploratory/`, and
`runs/<type>/` for every registered type (never `runs/env-checks/`). `cases/` and `scripts/` are never
read for slugs: their folders are modules, and a module is not a feature. Folders starting with
`_` (templates) are not slugs.

**Phase** — the same ladder `/qa-status` prints, top rung first:

| Phase | Condition |
|---|---|
| Signed-off | the newest sign-off whose `features` names the slug says `GO` or `CONDITIONAL GO` |
| Report | a `YYYY-MM-DD-report.md` exists |
| Run | a `runs/<type>/<slug>/` folder exists, or a traceability row has a `Last run` |
| Script | a traceability row is `Scripted ✅` |
| Design | the traceability table has a row |
| Plan | a `YYYY-MM-DD-test-plan.md` exists |
| Analyze | otherwise |

The phase says roughly where a slug is; `review`, `report`, `signoff`, `defects` and `quarantine`
say exactly.

**Attribution.** A quarantine row belongs to the slug whose traceability table lists its Case ID
(never a slug guessed from the id: the id carries the module). A defect belongs to the folder it is
in; only `**Status:** OPEN` counts as open, and a severity or origin the header does not state is
`null`, never a default. A sign-off belongs to every slug its `features` names.

**Staleness.** `report.stale` is `true` when the traceability table records a run newer than every
run in the report's `runs` (listed in `newer_runs`): the report no longer describes the latest
evidence. It is `null` when the report cites no runs. `review.stale` and each environment's `stale`
follow `§18`: `true` when a file the verdict hashed has changed (named in `changed`), `null` when it
recorded no hashes at all.

**Compatibility.** `schema` only increases; fields are added, never repurposed. A consumer meeting
an unknown `schema` says so rather than guessing.

**`qa:lint`.** A `state.json` that is not JSON, or has no `generator_version` / `source_hash`, is an
`error` (it was hand-edited). One whose `source_hash` differs from a fresh derivation is a `warn`
(an artifact changed since; the `Stop` hook rebuilds it).

**Hooks** (`settings.json`; each is a no-op where its script is absent):

| Event | Runs | Effect |
|---|---|---|
| `PostToolUse` (Write · Edit · MultiEdit) | `<qa-root>/scripts/shared/lint-on-write.mjs` | lints with cwd = the QA root; errors in the file just written exit 2 and reach the model; files outside the QA root are ignored |
| `Stop` | `build-state.mjs --quiet` | rebuilds `<qa-root>/state.json`; silent, and silent where there is no QA root |
| `SessionStart` | `status.mjs --brief` · `recall context` | the posture per slug, plus one update line when `afx` recorded a newer `qa` bundle in `.claude/.agentic-fx-updates.json` (`update-notice.mjs`; silent otherwise or with `AFX_NO_UPDATE_CHECK=1`); the team briefing where Recall is configured |
| `SessionEnd` | `recall session end` | session and token usage per command and skill, where Recall is configured |

Each hook looks for its script under `$QA_ROOT`, then `.stlc/`, then `<qa-root>/` (§2), and the script then
resolves the root itself, PROJECT-PROFILE `QA root` included. A root named anything else sets
`QA_ROOT`.

---

## 18. Gate verdicts that go stale (`/qa-review`, `/qa-env`)

A verdict describes the bytes it was given. A case review that said `READY FOR /qa-script` and a
readiness report that said `e2e: READY` both stop being true the moment their inputs change — and
neither could say so, because neither recorded what it read. Both now do.

**Case review** `<qa-root>/reviews/<slug>/YYYY-MM-DD-case-review.md` carries front matter:

```yaml
---
slug: orders
date: 2026-09-05
verdict: READY FOR /qa-script      # | REVISE FIRST — the same two tokens the body's **Verdict:** line uses
reviewed:
  - path: <qa-root>/cases/api/orders/TC-API-ORDERS-001-create-order-contract.md
    sha256: 8f14e45fce…          # the case's BODY hash (front matter excluded), as §5.2 of the dev
                                 # contract defines it; `build-state.mjs --hash <path>` prints it
---
```

`reviewed` lists **every case the verdict covers**, one entry per file, in path order. A review that
audited cases it does not list is not a review of those cases.

**Readiness report** `<qa-root>/runs/env-checks/<env>/<run-id>/readiness.md` carries front matter:

```yaml
---
env: uat
date: 2026-09-10
run_id: 2026-09-10-0900
verdicts: { e2e: READY, api: READY, performance: BLOCKED }   # one key per ENABLED type
inputs:
  - path: <qa-root>/.env.uat
    sha256: 3c59dc048e…          # whole-file hash: a .env has no front matter to exclude
  - path: .claude/PROJECT-PROFILE.md
    sha256: b6d767d2f8…
---
```

`inputs` records the files whose contents decided the verdicts: the environment file the check read
(never its values — `§9.5`), and the profile section that declared the URLs, authorization and
tooling. A readiness report is scoped to its environment, not to a feature.

| Rule | Detail |
|---|---|
| Vocabulary | review `verdict` ∈ `READY FOR /qa-script \| REVISE FIRST`; env `verdicts` values ∈ `READY \| NOT READY \| BLOCKED`. The front matter and the body must agree; `qa:lint` errors when they disagree, because two verdicts in one file means neither is the verdict |
| Hashing | markdown is hashed over its **body** (front matter excluded), anything else whole — one rule, one implementation (`lib/doc.mjs`), so a hash means the same thing everywhere |
| STALE | an entry whose file is missing, or whose hash no longer matches, makes the verdict **STALE**: `state.json` sets `stale: true` and names the changed paths. STALE is not a failure — it says "this verdict no longer describes what is on disk", and the fix is to re-run the command |
| Never silent | a verdict with no `reviewed` / `inputs` entries is `stale: null` (unknown), never `false`. A bundle that cannot tell says so |
| Who writes | `reviewing-cases` and `checking-environment` only. Nothing else edits these files, and neither skill edits what it judged |

## 19. Run plans (a named, saved selection you pick and run)

The **test plan** (`plans/<slug>/YYYY-MM-DD-test-plan.md`, §3–§4) is the planning DOCUMENT of one
feature: scope, gates, the traceability table. A **run plan** is something you EXECUTE: a named
selection of cases across features and types — the TestRail / Azure DevOps "test run" — saved as
`<qa-root>/run-plans/<name>.md`, run locally or in CI with the same definition. A run plan selects; it
never owns a verdict. Results land where they always do: the run folder and the run columns of the
traceability rows of every feature the cases belong to.

**File.** `<name>` is lowercase-kebab and equals the `name:` key. Front matter, keys byte-exact:

```yaml
---
name: orders-release                 # = the file name
description: <what it is for and when it runs>
env: uat                             # default env (`--env` overrides); else §Environments default
owner: <role or person>              # optional
select:                              # keys AND-ed, values OR-ed; at least one key
  features: [orders, invoices]       # slugs: their own rows AND their `re-verify:` rows (§3)
  types: [api, integration, e2e, security, performance, accessibility]
  modules: [orders]
  priorities: [P0, P1]               # P0..P3
  suites: [smoke, regression]        # the curated tags (§6) — run plans select by them, never curate
  tags: ['@defect:*']                # any case tag; a trailing * is a prefix match
  cases: [TC-API-ORDERS-001]         # explicit ids, always added
  platforms: [web, api]              # §20 platform ids — a case runs only on the listed ones it has
include:                             # optional: a second selection, OR-ed with select (same keys)
exclude:                             # keys OR-ed (same keys as select, plus quarantined)
  quarantined: true                  # default true; deprecated cases are ALWAYS excluded
browsers: [chromium]                 # web targets for e2e · accessibility · ui (`chromium` or `web-chromium`; default PW_PROJECTS)
workers: 4                           # optional
shards: 1                            # CI shards (1–50)
retries: 0                           # must be 0 — a pass-on-retry is FLAKY (§5), never a pass
---
```

Body: a short purpose, then `## Resolved cases` — generated by `run-plan.mjs resolve`, never hand-
edited — with columns byte-exact `| Case ID | Type | Platform | Module | Priority | Feature | Script |`
(the 1.0 header without `Platform` is still read for one minor version), so a reviewer sees exactly what runs. `Script` is the mirrored script path(s), or `manual`.

| Rule | Detail |
|---|---|
| Resolution | cases are read from `cases/**` (id, `**Type:**`/`**Module:**`/`**Priority:**`, `**Feature:**`, `**Tags:**`), never from filenames alone (§9.1); `features` also reads each slug's latest test plan for its re-verify rows; quarantine from the ledger (§12). Disabled types (§Test types) are dropped and listed |
| Runners | `unit` and `mobile` run in their own repos (§11, §15) and are not run-plan types; `/qa-run --type unit\|mobile` runs them — except that a plan which selects `platforms: [android \| ios]` may list `mobile`, and its cases are reported as handoff rows with their command (§20). Every Playwright tier runs in ONE `playwright test` with a `--grep` of the exact Case IDs and `--project` setup + api + `web-<target>` per browser + `desktop-electron` when a selected case runs on an Electron desktop platform; performance runs k6 per script; the ZAP baseline runs per selected security `.conf`. A selected case's platform on a non-Playwright runner is listed (`handoff: <id> on <platform> — <command>`) and marked ⛔ `blocked — awaiting handoff`, never silently dropped |
| Authorization | security and performance run only on an env whose §Environments row says yes (§9.5). Otherwise the run is **refused**, whole — never silently narrowed. No profile found = refused |
| Manual | `@manual` cases are listed (`manual`) and never run; a selected case with no script that is not `@manual` makes `resolve` and `run` fail |
| Verdicts | §3 vocabulary per case: ❌ if any of its tests failed (a pass-on-retry is impossible, retries are 0); ⛔ `blocked — skipped: <reason>` when a test or step was skipped (never ✅); ⛔ when setup failed or no test carried the id. The run exits non-zero on ❌ and on any ⛔ it did not declare; a declared skip is reported, not failed |
| Evidence | `runs/plans/<name>/<run-id>/` with `summary.md` (plan name, env, git SHA, `QA_RUN_ID`, counts per type, one row per case), `junit.xml`, `results.json`, `run.json`. CI shards: `runs/ci/<pipeline>-plan-<name>/shard-<i>/`, merged by `run-plan.mjs merge` |
| Write-back | executing-tests Step 6 unchanged: `Last run` = run-id, `Status`, `Report` = the run folder, in the plan of EVERY slug whose table lists the case (its own row, and the re-verify row when the plan selected that feature). Nothing else is written. CI runs do not write back; `/qa-ingest` imports them |
| Evidence for gates | `/qa-report` and `/qa-signoff` accept a run-plan run like any other: it is a run folder the traceability `Report` column names |
| Lint | `qa:lint` errors on an unknown key, a bad `name`, `retries` ≠ 0, an explicit `cases:` id with no case file or a deprecated one, a `features:` slug with no plan, `unit` in `types` (and `mobile` without `platforms: [android \| ios]`), a `platforms:` id that is not an enabled §Platforms row; warns on a stale `## Resolved cases` table |
| Writers | `/qa-run-plan` (`composing-run-plans`) writes plans from a prompt and the standard set (`full` · `smoke` · `regression` · `feature-<slug>` · `release-<id>`); humans may edit any of them. `run-plan.mjs resolve` writes only `## Resolved cases` |

## 20. Platforms (where a case runs — orthogonal to its type)

A test **type** says what a case proves (§1: api, e2e, ui, …); a **platform** says where it runs. The
same product is often web, mobile and desktop at once, and a reader must see the platform under test
everywhere — in the case, its tags, its title, the spec, the run plan, the run summary and the report.

**Profile.** PROJECT-PROFILE `## Platforms`, columns byte-exact
`| Platform | Kind | Runner | Targets | Tier | Enabled |`:

| Platform id | Kind | Runner (default) | Targets | Label |
|---|---|---|---|---|
| `web` | web | `playwright` | browser projects `chromium` `firefox` `webkit` `mobile-chrome` `mobile-safari` → Playwright projects `web-<target>` | Web |
| `android` · `ios` | mobile | `appium-wdio` — the §15 handoff; or `maestro` — flows run from `<qa-root>/` (§15 Maestro) | devices from §Mobile testing | Android · iOS |
| `windows` · `macos` | desktop | `playwright-electron` (Electron apps → project `desktop-electron`, `ELECTRON_APP_PATH`) or `appium-desktop` (Appium Windows / Mac2 driver — staged + handoff like mobile) | `electron` or the driver's device | Windows · macOS |
| `api` | service | `playwright-request` → project `api` | `api` | API |
| `other:<id>` | other | `handoff` only — cases designed, scripts staged under `scripts/<type>/` with a `HANDOFF.md` (§11 shape), results ingested by `/qa-ingest` | the team's own | `<id>` in Title Case |

`Tier` ∈ `gate | nightly | weekly` as in §Browsers & devices; a target may carry its own tier in
`Targets` (`chromium (gate), firefox (nightly)`). A profile without `## Platforms` is read the 1.0
way — §Browsers & devices becomes the `web` row's targets, `api` is enabled, `android`/`ios` follow the
`mobile` type — with a lint warning, for one minor version.

**Case.** Every case carries `**Platform:** <id>[, <id>…]` under the Type line and one
`@platform:<id>` tag per id (after `@P<n>`), and its title's module segment shows the labels
(`[Orders · Android, iOS]`, §7 Title). Header, tags and title agree (**error** when they differ).
Defaults when a case does not say: api · integration · security · performance · unit · data → `api`;
e2e · accessibility · ui → `web`; mobile → `android, ios`. A case without `**Platform:**` is a
**warning** through 2.0.x (it was 1.1.x; 1.2 was never released) that names the inferred default; from 2.1 it is an error.

| Rule (`qa:lint`) | Level |
|---|---|
| a `**Platform:**` id is not a platform id, or names a row that is missing or `Enabled = no` in §Platforms | error |
| `**Platform:**`, the `@platform:` tags and the title labels disagree | error |
| a `mobile` case on anything but `android`/`ios` | error |
| a `ui` · `e2e` · `accessibility` case on `api` | error |
| an `api` · `integration` case on a UI platform (correct only when the case drives that UI — say how in `## Preconditions`) | warning |
| no `**Platform:**` / no `@platform:` tag / no platform in the title | warning (through 2.0.x) |

**Runtime.** `caseMeta({ platform: [...] })` adds the `@platform:<id>` tags. `playwright.config.ts`
names projects per platform + target — `web-chromium`, `web-firefox`, …, `desktop-electron`, `api` —
from `PW_PLATFORMS` (§Platforms ids) and `PW_PROJECTS` (targets; the 1.0 names `chromium`, … stay
accepted as aliases). A browser-tier spec runs on `web-*` unless it is tagged only for other
platforms; `desktop-electron` runs the specs tagged `@platform:windows|macos`, with the window from
`fixtures/electron.fixture.ts`; without `ELECTRON_APP_PATH` those specs skip with that reason (⛔, never
✅). Visual baselines (the `ui` type) live under
`__screenshots__/{platform}/{projectName}/{testFilePath}/` — `{platform}` is the OS the baseline was
rendered on, so the CI image's `linux` baselines and a local `win32` set never overwrite each other.

**Run plans and reports.** `select.platforms` / `exclude.platforms` filter cases by platform (§19).
The run routes each case × platform to its runner: Playwright platforms run in the one `playwright
test`; a **wrapper runner** (`maestro` today) runs once per runner × platform through its wrapper
script; `appium-wdio`, `appium-desktop` and `handoff` platforms are listed with the command that runs
them and reported ⛔ `blocked — awaiting handoff` — never silently dropped.

**Runners are a registry** (`scripts/shared/lib/runners.mjs`). Each runner is one entry. Its engine
is `playwright`, `wrapper` or `handoff`. The entry also names the language its scripts are written
in, the types it runs, and the script extension. The Runner vocabulary above is the registry's key
list. A wrapper is called as `node <wrapper> --platform <id> --env <env> --cases <Case ID,…>` with
`RUN_DIR` set. It writes `<RUN_DIR>/<platform>/results.json`, the **results contract**:
`{ exit, noReport, unmapped: [<test name>], cases: { <Case ID>: { pass, fail, skip, message } } }`.
`lib/junit.mjs` builds `cases` from any JUnit XML, keyed by the Case ID that starts each test name.
A case is ✅ only when it passed on every platform it ran on. A wrapper that wrote no report is ⛔
SETUP/ENV. A run's `summary.md` adds a
`## Platforms × types` matrix (one row per platform, one column per type). `/qa-report` adds the same
matrix under `## Coverage by type` and **appends** one gate row per gate-tier platform to
`## Quality gates` (`Platform: <label>` — 0 failing P0/P1 cases on that platform's gate targets; a
platform with no run is `not evaluable`). The §16 headings, columns and vocabulary are unchanged: these
are rows, which the dev bundle does not key on.

## 21. Pull-request reviews (`/qa-review-pr` — a teammate's testing PR)

Several people write cases and scripts in one repository; each branch is reviewed before it merges.
A PR review judges **one diff**, across features, and is not a phase: it moves no feature forward and
owns no traceability cell. It is distinct from the case review (§18), which judges one feature's case
set before scripting.

**File.** `reviews/_pr/<pr-id>-<YYYY-MM-DD-HHmm>.md`, `<pr-id>` = `gitlab-<n>` · `github-<n>` · the
branch with `/` → `-`. `_pr` is not a slug and never appears on the board. Front matter:

| Key | Value |
|---|---|
| `pr` | `gitlab!<n>` · `github#<n>` · `<branch>` |
| `kind` | `testing` (the dev bundle's `/sdlc-review-pr` writes `development` into `dev/pr-reviews/`) |
| `base` · `head` | `<ref> @ <sha>` — the merge base and the reviewed head; a newer head makes the review stale |
| `reviewer` | `reviewing-test-pull-requests` |
| `verdict` | `APPROVE` · `REQUEST CHANGES` · `COMMENT` |
| `date` | `YYYY-MM-DD` |

**Body**, in order: `## Scope` · `## Run` · `## Checklist` · `## Findings` · `## Notes` ·
`## Comment to post` (+ `## Resolution` on a second round: `RESOLVED` · `ACCEPTED` · `REOPENED` per
prior finding). Findings use this bundle's severities (High · Medium · Low); `REQUEST CHANGES` when
any High exists.

**The scanner.** `scripts/shared/pr-scan.mjs` is the mechanical half and runs the same locally and
in CI (GitLab `qa:pr-scan`, GitHub `pr-scan`; both fail on High only). A number is fetched from
`origin` as `merge-requests/<n>/head` or `pull/<n>/head` — no platform CLI or token. Rule ids are
`QPR-*`; adding one is MINOR, changing what an existing id means is MAJOR.

**Rules.** The review edits nothing but its own file and never posts to the platform. A run it could
not perform is `N/A (<reason>)`, never `PASS`.

## 22. Coverage map (`/qa-coverage` — how much of the application the suite covers)

`reports/coverage/YYYY-MM-DD-coverage.md` is written only by `scripts/shared/coverage-map.mjs`
(`npm run qa:coverage`). It is read-only over the workspace: it edits no case, plan or script, and
it owns no traceability cell. Front matter, byte-exact keys: `date` · `scope` (slugs) · `measured` ·
`not_measurable` · `below_target`. Headings, in order:
`## Summary` · `## Coverage by dimension` · `## Coverage by test type` · `## API operations` ·
`## Screens` · `## Unit code coverage` · `## Gaps` · `## Sources`.

Each dimension is **covered / total over a surface the application owns**, with the file each side
was read from:

| Dimension | Total (denominator) | Covered when |
|---|---|---|
| requirements | REQ ids in the analysis registers, plus any the plans add | ≥1 traceability row (deprecated cases excluded) |
| REQ × type | ✅ / ⚠ cells of the analysis §5 `\| REQ \| unit \| api \| …` matrix | a case of that type for that REQ |
| acceptance criteria | AC ids in the analysis AC registers | the plan's `## AC coverage` row lists a case |
| API operations | operations of the OpenAPI spec | an `api` case title's subject is `METHOD /path` or the `operationId`; `security` for authz |
| screens | `## <Page> (\`<route>\`)` blocks of `docs/element-registry.md` | an e2e, `ui` or accessibility case title's subject is the page name, or contains its route |
| business rules | `wiki/compiled/**/br-NNN-*.md` | a case's `## Grounding` cites `BR-NNN` (§7) |
| risks | analysis §6 risks | every REQ the risk names has a case |
| automation | designed cases, `@manual` excluded (all, and P0/P1) | `Scripted` ✅ |
| execution | scripted cases | a run id in `Last run`; passing when `Status` is ✅ |

A dimension whose total cannot be read is `not measurable`, and the report names the file that
would make it measurable. It is never `0 %` and never `100 %`, and dimensions are never averaged
into one score. Unit code coverage is transcribed from the latest
`runs/unit/<slug>/<run-id>/coverage-summary.md` (§11), never recomputed. A case whose title names a
screen the registry does not list is printed under `## Screens`, not silently matched. `--strict`
exits 1 when a requirement or a High risk has no case.


## 23. Lessons and the heal guard (`/qa-learn`, `/qa-flaky`, `/qa-heal` — what the suite learns, and what a fix may not do)

**Lessons.** `learnings/LRN-<TOPIC>.md`, one lesson per file, from `_templates/learning.md`. Written
only by `/qa-learn` (`learning-from-runs`) and only after `npm run qa:learn -- check` prints
`0 error(s)`. Front matter, all keys required:

| Key | Rule |
|---|---|
| `id` | `LRN-<TOPIC>` (uppercase kebab), equal to the file name; permanent, never reused |
| `title` | one line: the habit, not the incident |
| `status` | `active` \| `deprecated` (with `superseded_by: LRN-…` or `reason:`); files are never deleted |
| `confidence` | `provisional` on one source; `established` only on two independent sources (two run dirs, a run and a review) or a `human:` entry |
| `applies_to` | `[ … ]` test types, modules, skill names or globs — what `qa:learn recall` matches |
| `evidence` | `[ … ]` paths under the QA root that exist (a run dir, a run file, a review, a report) or `human: <who> — <what>` |
| `probe` | the question a future run would ask that this answers, ending in `?` |
| `created` · `updated` | `YYYY-MM-DD` |

The body is at most 30 lines: **Do** · **Why** · **Not** (the tempting wrong fix). The gate also
rejects a near-duplicate of an active lesson (title + probe overlap ≥ 60 %): one topic is one file,
updated. A lesson is never a fact about the product — that is the wiki (§10) — and never evidence: a
skill that recalls one treats it as the first hypothesis; the case, the code and the run decide.
`qa:learn audit` names provisional lessons with no new support in 60 days.

**Lesson safety.** A recalled lesson enters an agent's prompt, so every front-matter value and the body
pass `scripts/shared/lib/lesson-scan.mjs`. Four categories are refused:

| Category | Flags |
|---|---|
| `injection` | text that steers the reader: ignore / disregard previous instructions or your rules, "you are now …", the system prompt, "new instructions:", act / pretend as if you…, hide it from the user, chat-role markers |
| `exfiltration` | curl / wget / fetch / Invoke-WebRequest carrying a key, token, password or env var; send / post / upload a secret to a URL; reading `.env`, `.netrc`, `.aws/credentials`, `~/.ssh/`, private keys; dumping the environment |
| `secret` | a credential itself: AWS, GitHub, GitLab, model-API, Slack, Google, Stripe key shapes, a private-key block, a JWT, a `Bearer` value, `password=<value>` |
| `unicode` | invisible and bidi characters: U+200B–U+200F, U+2060, U+202A–U+202E, U+2066–U+2069, U+FEFF, tag characters U+E0000–U+E007F |

`check` reports each hit as an error `<file>: unsafe: <field>[:<line>] — <category> (<rule>)`, so
`/qa-learn` cannot write the lesson; `recall` and `show` withhold a flagged lesson and warn on stderr
(`show` then exits 1); `audit` lists it as `FLAGGED`; `harvest` prints a signal whose run text trips
the scan as `FLAGGED` without its subject and exits 1. A finding names the rule and a redacted shape,
never the matched text. There is no override flag: a flagged lesson is rewritten without the text,
and a flag on prose that is truly benign is a scanner fix with a test, never an exemption in the file.

Recall is two steps: `qa:learn recall` prints an index (id, confidence, title, probe), ranked by how
many of type / module / skill a lesson's `applies_to` matches, then established before provisional,
capped at `--limit` (default 8); `qa:learn show <id> …` prints the bodies. A skill reads the bodies
only of the hits whose probe is its question. `recall --full` prints every body — the duplicate check
in `/qa-learn` Step 2 needs them all.

**Where recall runs.** Every design, plan, script and heal phase runs recall as a preflight step of
`qa-phase-protocol` (§1 step 5, `references/recall.md`), keyed by the skill it invokes, before the
author writes. The paths of the relevant lessons go to the author in the dispatch. **A reviewer is
never given lessons:** `reviewing-cases`, `reviewing-unit-tests` and `reviewing-test-pull-requests`
do not recall, and a review dispatch carries no `Lessons:` line. A primed reviewer checks for last
time's mistake and misses this time's. Recall never stops a phase.

**Across projects (optional).** `qa:learn push` sends each `established`, active lesson that passes the
scan to Recall as `kind: lesson` with its confidence, tagged `stlc`, its `applies_to` and
`project:<PROJECT-PROFILE §Project Name>`; `learnings/.pushed.json` records what went, so a lesson goes
once and again only when it changes. A provisional lesson stays local. `qa:learn recall --shared` adds
up to three lessons Recall shares with every project (`--scope shared`, so a project key never returns
the project's own lessons), scanned like a local lesson and labelled as another project's habit, never
a rule here. `STLC_RECALL_BIN` overrides the binary; `RECALL_URL` and `RECALL_API_KEY` reach the
server. Both fail open: no Recall is at most one line, and nothing waits on it.

**Learning brief.** The SessionStart hook runs `learnings.mjs brief --root <qa-root>`. It prints, once, what
is new since the last brief: harvest signals not yet a lesson, cases newly measured `flaky` in a
`stability.md`, new rows in `defects/ESCAPES.md`, and lessons written, retired or gone stale. It
remembers what it said in `logs/learn-brief.json`, which is per machine and not tracked. When nothing
is new, it prints nothing. `--peek` prints without remembering. It always exits 0: a missing root,
an unreadable memory or a crash never fails a session.

**Repeated-run stability.** `/qa-flaky` measures with `--repeat-each=<n> --retries=0` into
`runs/flaky/<slug>/<run-id>/`; `npm run qa:flaky -- <run dir>` writes `stability.md`:
`| Case ID | Project | Failed | Rate | Verdict | Errors |`, verdict `stable` (0/n) · `flaky` · `broken`
(n/n — a real failure, triaged under §5, never stabilised).

**Heal guard.** `npm run qa:heal-guard [-- --base <ref>] [--human "<quote>"]` compares the Playwright
specs, `scripts/shared/`, `scripts/setup/` and `playwright.config.ts` with the base ref and writes
`reports/heal-guard/<YYYY-MM-DD-HHmm>.md` (`# Heal guard — OK` or `# Heal guard — BLOCKED (<n>)`):

| Kind | Allowed |
|---|---|
| `removed` — an assertion or test gone; a spec deleted while its case is not `@deprecated:` | never |
| `weakened` — a matcher down the scale exact → partial → presence, or an assertion now under try/catch, `.catch()`, `if`, a ternary, `&&` `\|\|` `??`, a switch case, or after `return`/`throw` | never |
| `suppressed` — skip / fixme / only / slow, `waitForTimeout`, `setTimeout`, `timeout:`, `retries:`, `configure()`, `toPass()`, `grepInvert`/`testIgnore`, a `test.fail` naming no OPEN `DEF-<slug>-NNN` | never |
| `expected` · `data` — an expected value, a `not`, a test title, a test datum | when every new literal is in the mirrored case and a replaced one is not, or with `--human` |
| `contract` — `scripts/shared/schemas/**` | only with `--human` |
| `maintenance` — locators, helpers, page objects, a renamed subject | always, listed |

`/qa-heal` and `/qa-flaky` are not done until it exits 0. `/qa-review-pr` may cite its report.

## 24. Autonomy (an unattended run — `scripts/shared/autonomy.mjs`)

`QA_AUTONOMY` (env), else PROJECT-PROFILE `Autonomy`, else `off`. A run is started by a named human
(`autonomy.mjs start --run <run-id> --by <name>`). In `assisted`, a `non-blocking` clarification is
answered with its recommendation, marked `assumed — autonomous-run <run-id> (started by <name>)` in
the sheet; a `blocking` one is still asked. In `full`, both are answered that way. An assumed
answer stays in Needs you until a human confirms it.

Hard stops hold in every mode. `autonomy.mjs check <action>` runs before each one; exit 3 is a stop,
exit 4 a provisional sign-off (the run goes on, and the merge waits). Each stop is in
`runs/<run-id>/stops.jsonl` and is an activity event (`docs/activity-format.md`).

| Class | Actions |
|---|---|
| outward | `push-main` · `merge-main` · `file-defect` (an outside tracker) · `publish-results` · `delete-data` |
| security | `security-scan` / `perf-load` on an env that §Environments does not mark `yes` · `suppress-finding` · `quarantine-test` |
| sign-off | `release-signoff` (exit 4) |
| budget | any action past `QA_BUDGET_TOKENS` / `QA_BUDGET_MINUTES` |

`autonomy.mjs report --run <run-id>` writes `runs/<run-id>/report.md`, which is the Draft MR
description of `ci/.gitlab-ci.qa.yml` `qa:autonomy`. After review, `autonomy.mjs resolve --run <run-id> --by <name>`
writes the `pass` event that clears the run's stops from Needs you (same slug and link).

## 25. Guarded commands and redacted evidence (`scripts/shared/bash-guard.mjs`, `scripts/shared/lib/redact.mjs`)

**Bash guard.** `settings.json` runs `bash-guard.mjs` as a PreToolUse hook on every Bash call. A
command that trips a rule exits 2, and the reason goes to stderr: Claude Code refuses the call, and
nothing an agent says lifts it. A human who means it runs the command themselves. `permissions.deny`
lists the same rules as globs. That is the first fence. The hook parses the command line, so it also
catches what a glob cannot see, such as `git push origin main --force` or `rm -r -f ~`.

| Rule | Refused | Allowed look-alike |
|---|---|---|
| `force-push` | `git push` with `-f`, `--force`, `--force-with-lease` or a `+ref` | `git push -u origin feat/x` |
| `rm-root` | a recursive forced `rm` of `/`, `~`, `$HOME`, `.`, `./` or `*` | `rm -rf node_modules`, `rm -rf runs/_adhoc/<run>` |
| `drop-database` | `DROP DATABASE`, `DROP SCHEMA` | — |
| `truncate` | `TRUNCATE` in a SQL client call or a quoted statement | `grep TRUNCATE file` |
| `reset-hard-remote` | `git reset --hard origin/…` or `upstream/…` | `git reset --hard HEAD~1` |
| `no-verify` | `git commit` or `git push` with `--no-verify` | — |
| `env-write` | a redirect, `tee` or `sed -i` into `.env` or `.env.<env>` | `.env.example`, and `cp .env.example .env.<env>` (`preparing-test-tooling` creates the empty file) |

The guard never throws. A payload it cannot parse is allowed through: a crashed hook must not block
work.

**Redacted evidence.** The text evidence of a run (`failures.md`, `triage.md`, `stability.md`,
`summary.md`, `findings.md`, `perf-verdict.md`) is committed (§2), and a failure message quotes what the test saw.
`lib/redact.mjs` masks secret values with `‹masked›` and keeps their labels. It covers the password
in `scheme://user:password@host`, `Authorization` and `Bearer` values, `x-…-api-key` and `x-…-token`
headers, `?token=` / `api_key=` style parameters, `"password": "…"` and `password=…`, and every key
shape in §23's `secret` category. `qa:triage`, `qa:flaky`, `qa:perf` and `qa:plan:run` mask before they write,
and their `--json` output is masked too. `executing-tests` runs `npm run qa:redact -- <run dir>` after
it writes `failures.md`. Masking is idempotent. Text with no secret in it is left byte-identical.

## 26. The benchmark (`scripts/shared/bench.mjs`, `docs/benchmark.md`)

`npm run qa:bench -- score [--label <l>] [--out <file.json>]` scores one QA root, using only files
the bundle already writes:

| Key | Source |
|---|---|
| `first_pass` `{k, of, rate, ci95}` | the earliest `reviews/<slug>/*-case-review.md` per feature; `k` = those whose verdict is `READY FOR /qa-script` |
| `flaky` `{k, of, rate, ci95, measured, quarantined}` | `FLAKY` entries in `runs/**/failures.md` over all classified entries; `measured` = cases `flaky` in a `stability.md`; `quarantined` = rows of `regression/quarantine.md` with Released `—` |
| `escapes` `{total, unbackfilled}` | rows in `defects/ESCAPES.md`; `unbackfilled` = Backfill `pending` |
| `repeated` `{total, uncovered}` | `qa:learn harvest` signals; `uncovered` = no active lesson cites the evidence |
| `lessons` `{active, established}` | `learnings/` |

`ci95` is the 95 % Wilson score interval. `compare <before.json> <after.json>` exits 1 in any of
these cases:

- the later `first_pass` interval lies wholly below the earlier one;
- the later `flaky` interval lies wholly above the earlier one;
- `escapes.unbackfilled` rose;
- `repeated.uncovered` rose;
- `repeat_errors` rose (failures that came back after an active lesson about them, `qa:learn ladder`).

With `--reason "<why>"` it exits 0 and prints the reason. Overlapping intervals are "not measurable at
this sample size". A side with no data is "not evaluable", and neither is ever worse.

Each score also carries `task_id` · `bundle` · `version` · `condition` (`lessons` | `no-lessons`) ·
`lessons_active` · `repeat_errors` · `tokens` and `duration_s` per phase (from `--costs <file>`; `null`
when not measured, never estimated) · `estimate_tokens` (the plans' §27 sizing) · `actual_tokens` and
`cost_vs_estimate` (`null` unless every phase was measured).

## 27. Sizing (`scripts/shared/sizing.mjs`, `scripts/shared/lib/sizing.mjs`)

A test plan dated from 2026-10-26 has a `## Sizing` section above `## 1. Coverage targets`, one
`- key: value` per line: `change_class` (`trivial` · `standard` · `high-risk`), `worth_testing`
(`yes — <why>` · `no — <why>`), `types`, `skipped` (`<type> — <why>; …` or `—`), `estimate_tokens`,
`spawns`, and when needed `over_budget: approved — <name> <YYYY-MM-DD>` and `spawn_reason`. The
deploy keys (`deploy_impact` and the keys it calls for) are §30's.

| Class | Types at most | Spawn budget | Review before scripting | Must cover or skip with a reason |
|---|---|---|---|---|
| `trivial` | 1 | 2 | no | — |
| `standard` | every type | 6 | yes | — |
| `high-risk` | every type | 12 | yes | `security` |

`qa:lint` errors on: a missing section; an unknown class; `worth_testing` without a reason; a skip
that still has traceability rows; more types than the class allows; a traceability type the sizing
does not list; an enabled type neither listed nor skipped with a reason; a non-numeric estimate; an
estimate over the profile's `**Token budget per run:**` without `over_budget`; more spawns in
`logs/spawns.jsonl` than the class budget without `spawn_reason`; scripted rows with no case review
when the class requires one. `sizing.mjs fanout` is the only source of the types a design or script
phase spawns for: the sized `types` ∩ §Test types, grouped by agent. `sizing.mjs spawn` records a
spawn and exits 3 past the budget. `next-id` and `trace-upsert` mint an id and add a row without
reading the table; `brief` gives a reviewer the lint findings, changed cases and uncovered REQs.

## 28. Data pipelines (the `data` type — ELT, warehouse and transformation testing)

A data case proves that data moving from a source through each layer hop to a target is correct,
complete and stable. Like `unit` and `mobile`, the tests live in another repo (the pipeline's dbt
project, Spark job or orchestration repo), so the type reuses the §11 bridge:

| Artifact | Path | Rule |
|---|---|---|
| Case | `<qa-root>/cases/data/<module>/TC-DATA-<MODULE>-<NNN>-<short-desc>.md` | §7 format + `## Hop` / `## Oracle` / `## Tolerance` |
| Staged script (always written) | `<qa-root>/scripts/data/<module>/<same-TC-basename>.<ext>` | `.sql` (dbt singular test) · `.yml` (dbt generic or unit test) · `.py` (pytest / PySpark); the exact file to land in the pipeline repo |
| Handoff table | `<qa-root>/scripts/data/HANDOFF.md` | heading byte-exact `# Data-test handoff`; columns and vocabularies exactly §11's |
| Target path | inside a §Data testing test directory, named by its test-file convention | the ONLY path outside `<qa-root>/` this type may write, and only in Write mode `apply` |
| Recon summary | `<qa-root>/runs/data/<slug>/<run-id>/recon-summary.md` | columns byte-exact `\| Hop \| Check \| Source \| Target \| Tolerance \| Verdict \|`; written by `executing-tests` from the run's result files, or `not evaluable` |

**Case sections.**
- `## Hop` — `- from: <layer.table>` · `- to: <layer.table>` · `- relationship:` one of `exact`
  (1:1 copy or typing) · `dedup` (latest row per key) · `filtered` (minus a named quarantine) ·
  `aggregated` (target grain coarser than source) · `source` (a check on one side, no hop) ·
  `- grain: one row per <…>` · `- window: <late-arrival window> | none — <why>`. A dedup hop adds
  `- dedup order: <column> desc`; a filtered hop adds `- quarantine: <table>`.
- `## Oracle` — one line per check, `- <kind>: <what is compared>`. Kinds: `row-count` ·
  `distinct-keys` · `sum` · `min-max` · `row-hash` · `conservation` (by key: nothing vanished,
  nothing invented) · `unit-rows` (given rows → expected rows) · `rule` (violating rows = failure)
  · `schema` · `freshness` · `pii-shape` · `idempotent-rerun` · `late-data` · `backfill`.
- `## Tolerance` — `- exact`, or one line per non-exact check with `reason:` and `owner:`.

**Rules `qa:lint` enforces** (`lib/data-case.mjs`): the three sections present; a known
relationship and oracle kinds; `from`, `to`, `grain` and `window` present; dedup and filtered hops
name their order and quarantine; a P0/P1 case has at least one value-level oracle (`sum` ·
`min-max` · `row-hash` · `conservation` · `unit-rows` · `rule`), because counts cannot see a changed
value; every non-exact tolerance names a reason and an owner. Data cases are never quarantined: on
a fixed fixture a pipeline is deterministic, so a flaky data test is a defect.

**Run verdict.** A data run is ✅ only when every check of the case passed AND the suite ran
something: no result file, zero tests, or a skipped test is ⛔ `SETUP/ENV`, never ✅ (§9.4). Pass and
fail come from exit codes and result files (`run_results.json`, JUnit), never from log text.
Before a data suite counts toward a gate, its §Data testing `Mutation command` must have run on the
same commit with every planted defect caught; without it the data gate is `not evaluable`.

## 29. Importing an existing suite (`/qa-import` — a project that had tests before stlc)

A project that already runs tests starts with an inventory, not a design. `scripts/shared/import-suite.mjs`
(`npm run qa:import`) reads one CSV or JSON export per tool (Jira/Xray/Zephyr, Azure DevOps,
TestRail, spreadsheets) and, optionally, the folders of existing test scripts. It is read-only over
every source and writes only these two files:

| Artifact | Path | Rule |
|---|---|---|
| Exports | `<qa-root>/imported/exports/` | gitignored, because exports can carry customer data |
| Inventory | `<qa-root>/imported/inventory.jsonl` | one case per line: `source` · `id` · `title` · `module` · `priority` · `steps` · `flags` · `scripts` · `dupOf`; regenerated on every run |
| Report | `<qa-root>/reports/import/YYYY-MM-DD-import.md` | front matter `date` · `sources` · `cases` · `exact_duplicates` · `near_duplicates` · `linked_to_script` · `orphan_scripts`; headings in order `## Summary` · `## By source` · `## By module` · `## Duplicates` · `## Step quality` · `## Automation links` · `## Orphan scripts` · `## Next steps` |

**Rules.** Columns are found by header name, never by position; an export with neither an id nor a
title column is refused. A row with no id and no title is one more step of the case above. A script
links to a case only on evidence: a tool key (`PROJ-123`), a TestRail `C<n>`, a numeric id next to
a word that says it is a case id (`TestCase: 48211`, `@tms:48211`), or a test name equal to the
case title. A bare number never links. Without script folders, automation is `not measured`, never 0 %.

**Imported cases are not §7 cases.** They sit in the inventory, outside `cases/`, outside
traceability, and outside every gate. One is promoted when a feature touches its module: `/qa-design`
rewrites it as a §7 case for that slug and cites `- ticket: <source>:<id> § imported` in its
Grounding. When the source is the project's §Test management TMS, it also carries `@tms:<id>` so
that `/qa-publish` updates the work item rather than creating a twin. That is the one case where
`@tms:` is written outside `/qa-publish` (§6). Bulk promotion of a whole suite is refused.

## 30. Deploy-impacting changes (`scripts/shared/lib/deploy-impact.mjs`)

A change that touches the database schema, existing rows or an API request/response contract is
tested for its deploy window and its rollback, not only for its behaviour. The plan declares the
impact in `## Sizing` (§27), one `- key: value` line each:

| Key | When | Values |
|---|---|---|
| `deploy_impact` | plans dated from 2026-11-03 (a warning when absent) | `none` · `none — <why>` · `db` · `api` · `db, api` |
| `db_change` | `db` | `additive` · `expand` · `contract — <release from which the code no longer uses the old shape>` |
| `data_change` | `db` | `none` · `backfill`, `transform`, `split-merge`, `type-change`, `delete`, `import` (comma-separated) |
| `rollback` | `db` | `redeploy`, `down-migration`, `snapshot-restore` (comma-separated) |
| `backup` | `data_change` ≠ `none` | the backup the rollback restores |
| `post_backup_writes` | `data_change` ≠ `none` | `delta-export — <how>` · `replay — <how>` · `write-freeze — <how>` |
| `api_change` | `api` | `additive` · `versioned` · `deprecated` |
| `deploy_skipped` | optional | `<check> — <why>; …` |

A case proves a check with a header line `**Deploy check:** <check>[, <check>…]` under `**Tags:**`.
The checks each declaration requires:

| Declared | Required checks |
|---|---|
| `db` | `migration-round-trip` · `migration-volume` · `migration-integrity` · `n-1-compat` · `rollback-redeploy` · `post-deploy-verify` |
| `rollback` names `down-migration` or `snapshot-restore` | + `rollback-restore` |
| `data_change` ≠ `none` | + `backup-restore` · `data-baseline` · `migration-resumable` · `migration-idempotent` · `data-verify-after` · `rollback-data` · `n-1-data` |
| `api` | `api-old-client` · `api-cached-client` · `rollback-redeploy` · `post-deploy-verify` |
| `api_change` `versioned` or `deprecated` | + `api-versioning` |

`qa:lint` errors on: an unknown impact, `db_change`, `data_change`, `rollback` or `api_change`
value; `db` without `db_change`, `data_change` or `rollback`; `contract` without its release;
`api_change: breaking` (a breaking change ships only versioned or deprecated); a data change
without `backup` or `post_backup_writes`; `worth_testing: no` with an impact; a `deploy_skipped`
entry with no reason or naming `n-1-compat`, `rollback-redeploy`, `post-deploy-verify`,
`backup-restore`, `data-baseline`, `data-verify-after` or `rollback-data`, which no reason waives;
an unknown check on a case; and, once the traceability table has rows, a required check that no
non-deprecated case of the slug with a row in the plan names. What each check's case does:
`skills/qa-phase-protocol/references/deploy-change-cases.md`.

## 31. Verdict integrity (`qa:target`, `qa:delta`, `scripts/shared/lib/integrity.mjs`)

Every verdict this bundle writes is a sentence of one shape: *on system S, behaviour B held* (or did
not). It is true only when each of its parts is true — and each part can go false while every check
around it stays green. The seven principles below are those parts. Each has a mechanism that makes it
cheap to keep and a check that fails when it is broken; a principle without a failing check is a hope.

| # | Principle | Mechanism | The check that fails |
|---|---|---|---|
| 1 | **Identity** — a verdict is about the system the run can prove it reached | `qa:target` before every run; `target.json` in the run folder | the `Target identity` gate row (`qa:lint` recomputes it); a run does not start on `NOT_DEPLOYED` |
| 2 | **Observation** — a read that failed is `UNKNOWN`, never a value | readers throw, or return UNKNOWN | `qa:lint`: a `.catch(() => 0 / false / '' / [] / {} / null …)` in test code without `// unknown-ok: <reason>` |
| 3 | **Oracle** — the case judges the test; neither moves to meet the product | case-review hashes (§18); the heal guard (§23) | `qa:heal-guard` finding `oracle`; `qa:lint`: an empty `test.step` |
| 4 | **Attribution** — FUNCTIONAL is the explanation left after the harness is ruled out | the `attribution:` line in `failures.md` | `qa:lint`: a FUNCTIONAL entry without precondition · control · repro |
| 5 | **Closure** — "fixed" means a guard went green on a different system than it failed on | `· target <identity>` on `## Recurrence` / `## Verification` lines | `qa:lint`: `fixed` with no `**Case:**`, or verified on the identity it failed on |
| 6 | **Delta** — results are read against what changed, in the product and around it | `qa:delta` → `delta.md` | the report's `## Trend` cites it; a NEW-FAIL on an unchanged system carries the hint |
| 7 | **Findings need an oracle** — a defect contradicts something written down | REQ / BR / AC / standard / spec on the defect | `qa:lint`: an EXPLORATORY defect naming no oracle |

### 31.1 Identity — what the run judged

A system is more than a build. Five **kinds** of component decide what a user meets, and each one can
differ from what the plan assumed without raising any error:

| Kind | What goes stale silently |
|---|---|
| `code` | a pod that did not roll; a preview environment of another branch; a serverless alias still on the old version; a re-pointed container tag |
| `client` | a CDN serving yesterday's web bundle; a device with last week's app build; a desktop install that did not update |
| `config` | the right build with a feature flag flipped, a tenant setting changed, an environment variable missing |
| `schema` | a migration not applied, or applied ahead of the code |
| `data` | a seed or snapshot older than the cases that rely on it |

**Declaration** — PROJECT-PROFILE §Environments, sub-section `### Target identity`, one row per
component, columns byte-exact `| Env | Component | Kind | Probe | Read | Expect |`:

| Column | Values |
|---|---|
| Env | an environment of §Environments, or `*` for every environment |
| Component | the name the team uses (`api`, `web`, `android`, `billing-svc`, `flags`, `schema`, `seed`) |
| Kind | `code` · `client` · `config` · `schema` · `data` |
| Probe | `GET <url>` · `HEADER <url> <name>` · `CMD <command>` · `FILE <path>` — `${VAR}` reads `<qa-root>/.env.<env>`; GET and HEADER send no credentials; CMD runs only what is declared here |
| Read | `json:<dot.path>` · `regex:<pattern>` (group 1, else the match) · `raw` (the first line) · `sha256` (a 16-hex digest of the whole answer — for a flag set or a config file, whose identity is its content) |
| Expect | `shipped-sha` (must equal the plan's `**Shipped SHA:**`) · `recorded` (read and kept; compared by `qa:delta`, or pinned with `--expect`) |

Examples across system shapes — not a menu; declare what *your* system can answer:
`GET ${API_URL}/version` + `json:commit` (a service) · `GET ${WEB_URL}/` + `regex:name="build" content="([^"]+)"`
(a web bundle) · `CMD kubectl get deploy billing -o jsonpath={.spec.template.spec.containers[0].image}` +
`regex:@(sha256:\w+)` (a container) · `CMD adb shell dumpsys package <pkg>` + `regex:versionName=(\S+)`
(an installed app) · `FILE builds/app.json` + `json:version` (the artifact under test) ·
`GET ${API_URL}/flags` + `sha256` (a flag set) · `CMD git -C ../app rev-parse HEAD` + `raw` (a local checkout).

**A system that cannot say what it is** has a testability gap, not a probe problem: a
`TESTABILITY-GAP` handed to the developers (§9) — expose the commit on a version endpoint, a response
header or a build-info file. Until then its runs are `UNVERIFIED`, and say so.

**`qa:target -- --env <env> [--plan <slug>] [--expect <component>=<identity> …] [--out <run dir>]`**
probes every declared component and writes `target.json`, committed with the run's text evidence:

```json
{ "schema": 1, "env": "uat", "probed_at": "…", "verdict": "MATCH",
  "expected_from": "plans/orders/2026-09-01-test-plan.md", "shipped_sha": "8556e8f",
  "components": [ { "component": "api", "kind": "code", "probe": "GET ${API_URL}/version",
                    "observed": "8556e8f0c1", "expected": "8556e8f", "origin": "3fa1…", "status": "MATCH", "reason": null } ] }
```

Component `status` ∈ `MATCH | MISMATCH | UNREAD | RECORDED`. The run's `verdict`, in the order a
reader acts on it:

| Verdict | Means | Exit | What happens |
|---|---|---|---|
| `NOT_DEPLOYED` | a component read back as a different identity than expected | 1 | the run does not start; every selected case is ⛔ with `NOT_DEPLOYED <component> <observed> ≠ <expected>` |
| `UNVERIFIED` | a pinned component could not be read, or nothing is declared | 2 | the run may proceed; its summary says `identity: UNVERIFIED — <reason>`; it cannot make the gate `pass` |
| `MATCH` | every pinned component read back as expected | 0 | the run proceeds |
| `UNPINNED` | everything read, nothing expected (no shipped commit) | 0 | the run proceeds; identities are recorded for `qa:delta` |

A commit matches by any common prefix of seven or more hex digits, and a version string that carries
the commit (`2.4.1+9f8e7d6`) matches it; any other identity matches only exactly. An empty answer is
never an identity. The host is recorded as a hash of its origin, never its name; environment values
never reach the file (§9).

**The report gate.** A feature report whose `shipped_sha` is not `—` carries the `## Quality gates`
row `Target identity` when the profile declares `### Target identity` (a warning when it does not):

| Verdict | When |
|---|---|
| `pass` | every run in `runs:` has a `target.json` reading `MATCH` against the report's `shipped_sha` |
| `fail` | a run read `NOT_DEPLOYED`, or reached a commit other than the report's — last week's build cannot vouch for this week's |
| `not evaluable` | a run has no `target.json`, read `UNVERIFIED` or `UNPINNED`, or the report reads no runs |

`qa:lint` recomputes the row from the runs' `target.json` and errors when the typed verdict differs.
This is how a verdict goes stale by identity: a new shipped commit turns every older run's `MATCH`
into a `fail` for the new report, with no date arithmetic.

### 31.2 Observation — three answers, never collapsed

Every read answers one of three things: **a value** (including `0`, `""` and an empty list),
**confirmed absent** (looked for in the right scope, and not there), or **could not read** (timed out,
refused, an error page, a changed shape). Only the first two may support a PASS or a product FAIL;
the third is `UNKNOWN`. `count().catch(() => 0)` turns "could not read" into "there are none";
`isVisible().catch(() => false)` into "hidden"; `json().catch(() => ({}))` into "an empty body".
`qa:lint` errors on such a fallback in `scripts/**/*.ts` unless the line, or the one above it, says why
the unknown can never reach a verdict: `// unknown-ok: <reason>`. Rethrowing with context is always fine.

### 31.3 Oracle — the judge does not move

The case's `## Steps`, `## Expected Result`, `## Variants` and `## Data` are the oracle. The moves that
turn a red run green without a fix, all forbidden: editing the case to where the product is; dropping
or softening an Expected; skipping the step that broke; widening a comparison or a wait; **reading the
answer through an easier channel** than the one the case names (an API read cannot see what a screen
renders); **substituting an easier subject** than the one the case names; **counting a step as
performed because its title printed**; and **certifying half of a compound Expected** ("A and B" is
two claims). The mechanical half:

- `qa:heal-guard` reads the mirrored case **as it was at the base**. A change that edits the oracle
  together with its spec is the finding `oracle` — allowed only when a `READY FOR /qa-script` case
  review lists the case with its new body hash (§18), or with `--human`. Until then the spec is judged
  against the oracle as it stood.
- `qa:lint` errors on a `test.step(…)` whose body is empty or only logs.

### 31.4 Attribution — the harness is ruled out first

A failure is not evidence about the product until the harness is ruled out. Every `FUNCTIONAL` entry
in `failures.md` carries one line:

```
- attribution: precondition <held at the failing assertion: evidence> · control <evidence | n/a — why> · repro <evidence>
```

**precondition** — the state the case needs still held *at* the assertion (setup can be undone between
arrange and assert, or never have been reachable for that account). **control** — the same check with
the state inverted gives the other answer; when both states give the same result, the check is not
measuring what it claims. **repro** — the failure outside the harness (a request, a manual step, a
minimal sequence). Any may be `n/a — <why>`; none may be missing. Several cases of one family failing
identically point at their shared fixture before the product: diff them against the family's passing
cases first. `qa:lint` errors on a FUNCTIONAL entry without all three keys.

### 31.5 Closure — a guard, on a changed system

Defect lines take an optional suffix `· target <identity>` — the `code` identity of the run, from its
`target.json`: `## Recurrence` `- <run-id> · <env> · <date> · target <id>`, `## Verification`
`- <run-id> · <env> · <Case ID> ✅ · <date> · target <id>`. `qa:lint` errors when a `fixed` defect has
`**Case:** —` (a fix is closed by the case that reproduces it — red before, green after; an escaped
defect designs that case first, §13), and when its last verification carries the same identity as its
last recurrence (a pass without a change to the system is a flake or an environment change, not a fix).

### 31.6 Delta — read results against change

`qa:delta -- <run dir> [--base <run dir>]` compares a run with the previous run folder beside it and
writes `delta.md`: per case `NEW-FAIL · STILL-FAILING · FLAKY · FIXED · NEW · GONE · SKIPPED · STEADY`,
and the identity diff of the two `target.json` — `same · changed · unknown` per component; a missing
reading is never "same". The diff gives the classes their meaning, as hints beside them and never as
classifications: a NEW-FAIL on an unchanged system points at the test, its data or the environment
before the product; a FIXED on an unchanged system is not a fix. `reporting-results` writes `## Trend`
from the deltas of the runs it reads.

### 31.7 Findings need an oracle

An observation is a defect only when it was seen on the running system **and** contradicts something
written down — a REQ, a BR, an AC, a standard, a spec. Otherwise it is a `QUESTION` follow-up (§14).
`qa:lint` errors on an `EXPLORATORY` defect whose `**REQ:**` is `—` and whose `## Expected` cites no
`REQ-` / `BR-` / `AC-` / `standard:` / `wiki:` / `spec:`.
