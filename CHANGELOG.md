# Changelog

All notable changes to the agentic-fx-qa bundle, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the version is the one in `VERSION`.
`CONTRACTS.md` is versioned with the bundle: renumbering or removing a section, or changing a key,
heading or vocabulary token in `§16`, is MAJOR; a new section or rule is MINOR; wording is PATCH.
Upgrade steps for each release are in [UPGRADE.md](UPGRADE.md).

## [Unreleased]

### Added
- **Verdict integrity (CONTRACTS §31, invariant 10).** A verdict is a claim about one system; seven
  principles keep it true, each with a check that fails. `npm run qa:target` reads what the
  environment is actually running — code, client build, config, schema and data, as the profile's new
  `### Target identity` declares — and a run against a different build than the plan's stops as
  `NOT_DEPLOYED`. Reports naming a shipped commit carry a `Target identity` gate that `qa:lint`
  recomputes from each run's `target.json`. `npm run qa:delta` compares a run with the previous one and
  with what changed in the system between them. `qa:lint` now rejects a read that turns a failure into
  a value, an empty test step, a FUNCTIONAL failure without precondition · control · repro, a `fixed`
  defect with no guard case or verified on the system it failed on, and an exploratory defect with
  no oracle. Judgment rules for every phase: `qa-phase-protocol/references/verdict-integrity.md`.

### Changed
- **The heal guard reads the case as it was before the change.** Editing a case's Steps or Expected
  together with its spec is the new finding `oracle`, allowed only with a READY case review of the
  new wording or `--human`; until then the spec is judged against the old oracle.
- **Lessons across projects (CONTRACTS §23), optional.** `npm run qa:learn -- push` shares each
  established lesson through Recall, with its confidence, tagged with the project; it goes once and
  again only when it changes, and a provisional lesson stays local. `npm run qa:learn -- recall
  --shared` adds up to three lessons Recall shares with every project, never this project's own,
  scanned like a local lesson and labelled as another project's habit. Authoring phases ask for them
  in their recall step. With no Recall, or an older one, both carry on: at most one line, nothing
  waits.
- **Deploy-change cases (CONTRACTS §30).** A plan's `## Sizing` states `deploy_impact: none | db |
  api` and, for `db`, `db_change`, `data_change` and `rollback`; for a change to existing rows,
  `backup` and `post_backup_writes`; for `api`, `api_change`. `/qa-design` then writes the deploy
  checks it requires, each named on a case's `**Deploy check:**` line: migration round trip, volume,
  integrity, N-1, rollback by redeploy or restore and post-deploy verification for a schema change;
  backup and restore, baseline before, resumable and idempotent run, verification after, rollback
  with data and N-1 on transformed data for a change to existing rows; old clients, cached bundles
  and versioning for an API change. `qa:lint` fails a plan whose planned cases miss a required
  check, a breaking API change with no version or deprecation, and a data change with no backup.
  A plan from 2026-11-03 without `deploy_impact` is a warning; older plans are unaffected.

## [2.5.0] — 2026-10-27

A project that already has tests can start from what it has. `/qa-import` takes stock of an
existing suite: cases exported from every tool, exact and near duplicates, steps no reader could
execute, and which existing script references which case. A new project still starts at
`/qa-analyze`. MINOR: new CONTRACTS §29; nothing changes for a project that does not run it.

Benchmark: not run — the import reads exports, not a feature, so the bench's per-feature tasks do not exercise it.

### Added
- `/qa-import` and the `importing-existing-suite` skill, with export recipes for Jira (Xray,
  Zephyr Scale), Azure DevOps, TestRail and spreadsheets.
- `npm run qa:import` (`scripts/shared/import-suite.mjs`): reads CSV or JSON by header name, folds
  step rows into their case, flags missing or vague Expected, finds duplicates, and links scripts to
  cases only on evidence (a bare number never links). Writes `imported/inventory.jsonl` and
  `reports/import/YYYY-MM-DD-import.md`.
- CONTRACTS §29: the inventory and report shapes, and promotion. An imported case becomes a §7 case
  only when `/qa-design` meets its module, and keeps its `@tms:` id when it came from the project's own TMS.

### Changed
- `/qa-design` passes each agent the imported cases of the modules it touches, so it promotes them
  instead of designing twins.
- Seven skill descriptions are shorter, to keep the listing inside its 8,000-character budget.
- The SessionStart update line names the installer that set the project up: `npx agentic-fx@latest
  update --bundle qa` for a project installed with the public npx package (notice `source` starting
  `npm:`), `afx update --bundle qa` otherwise. One of two fixed strings; the file's command is never used.

## [2.4.0] — 2026-10-27

A tenth test type, `data`, tests ELT/ETL pipelines: layer-hop reconciliation, transformations,
business rules, PII and incremental drills, staged into the pipeline repo like `unit`. Test types
now come from one registry. MINOR: new CONTRACTS §28; existing projects are unaffected (`data`
ships disabled).

Benchmark: not run — no real project has been taken through 2.4.0 yet.

### Added
- **`data` type** (`TC-DATA`, CONTRACTS §28): `data-test-engineer`, `designing-data-cases` with an
  ELT heuristics reference (20 defect classes, each with the oracle and the fixture row that catches
  it), `generating-data-script` (dbt singular/unit tests or PySpark), `_templates/case-data.md`,
  `scripts/data/HANDOFF.md`, and `npm run test:data` (`scripts/data/run-data.mjs`).
- **Readiness before data testing**: PROJECT-PROFILE `§Data testing` R1–R8 (contracts, grain, hop map,
  rules, window, PII inventory, fixture, CI engine). An empty row is a setup STOP, never a guess.
- **Data lint** (`lib/data-case.mjs`): `## Hop` / `## Oracle` / `## Tolerance`; a P0/P1 case needs a
  value-level oracle; a non-exact tolerance needs a reason and an owner. Each rule has a selfcheck
  mutant that must go red.
- **The data runner treats silence as red**: no result file, zero tests or a skipped test is
  ⛔ SETUP/ENV; a surviving mutant fails the run; verdicts come from result files, never logs.
- **Type registry** (`scripts/shared/lib/types.mjs`): stems, agents, §7 sections, quarantine rule.
  Nine scripts that each carried their own list now import it; `bundle.test.mjs` fails on any copy
  that differs and names it.
- `docs/adding-a-test-type.md`: the checklist for the next type, what proves each piece, and the
  traps met while adding this one.

### Changed
- Sizing: `standard` and `high-risk` may cover every registered type (was the literal 9).
- Ten skill and agent descriptions shortened (triggers kept) to fit the 8000-character listing.
- Coverage map row 23 (data pipelines) moves from "separate template" to type `data`.

## [2.3.0] — 2026-10-26

The bundle sizes the work before it acts, spends fewer tokens by design, and learns from repeated
mistakes. MINOR: new CONTRACTS §27 and new lint rules; see UPGRADE.md for the two that can fail on
existing files.

Benchmark: not run — no real project has been taken through 2.3.0 yet, so there is no score to compare against 2.2.1.

### Added
- **Sizing before work** (CONTRACTS §27). Every new test plan has a `## Sizing` section: a change
  class (`trivial`, `standard`, `high-risk`), a "worth testing?" decision where an explained skip is
  valid, the test types needed, every skipped type with its reason, and a token estimate. An estimate
  over the profile's `Token budget per run` stops for a human. `qa:lint` enforces all of it.
- **Token levers as mechanisms.** Design and scripting spawn only the sized types the profile
  enables, one spawn per agent; each spawn is recorded and refused past the change class budget
  without a reason. Case ids and traceability rows come from a script (`sizing.mjs next-id`,
  `trace-upsert`), and a reviewer starts from a generated brief of changed cases, uncovered
  requirements and lint findings instead of reading the whole feature.
- **Learning ladder.** `qa:learn ladder` counts failures that came back after an active lesson about
  them; at two, it proposes turning the lesson into a lint rule or hook.
- **Benchmark fields.** Scores carry task, bundle, version, condition (`lessons` / `no-lessons`),
  repeat errors, and measured tokens and duration per phase against the sized estimate (never
  guessed). `compare` fails when repeat errors rise. `qa:bench export` writes one record per
  feature in the format ai-eval's `compare_bench` reads.
- **Release check.** The latest release must commit its benchmark score or state why it was not run.
- **Earlier in this cycle:** performance runs that read the service contract and compare with the
  last good run; a bash guard against destructive commands; secret redaction in run evidence; lesson
  recall in every authoring phase with an injection scan; trace ids on failures; autonomy modes for
  unattended runs; fast triage, heal guard and flaky-test hunting; agent-driven mobile testing and
  `/qa-setup`; deeper security heuristics.

### Changed
- **A case with no `## Grounding` is a lint error** (it was a warning through 2.2).
- **Clarification sheets are checked.** Each question carries exactly one `[BLOCKING]` or
  `[NON-BLOCKING]` marker and a status; a test plan made while a blocking question is open is an error.
- **A case review signed by the agent that designed the cases is an error.**
- **Lighter context per spawn:** no skill preloads, the project profile is read by section, and
  lesson recall prints an index before any lesson body.

## [2.2.1] — 2026-10-16

Re-release of 2.2.0 including `/qa-coverage`, which the `v2.2.0` tag missed. Install 2.2.1, not 2.2.0.

### Fixed
- `/qa-coverage` and the PR scanner work under either QA root.

## [2.2.0] — 2026-10-16

The QA workspace folder is configurable; new projects get `.stlc/`, existing `qa/` projects keep working.

### Added
- One root resolver for every script and hook (`--root`, `QA_ROOT`, the profile, then whichever of
  `.stlc/` or `qa/` exists).
- `migrate-root.mjs --to .stlc|qa` moves a workspace and rewires its config (dry run unless `--write`).

### Changed
- The profile's QA root defaults to `.stlc`; hooks, CI templates and the VS Code board look in both.
- Recorded paths accept either prefix, so moving a workspace does not make reviews stale.
- Migration note: the installer must copy the workspace to the configured root (`.stlc/` for new
  projects) and keep `qa/` for existing ones; see UPGRADE.md 2.2.0.

## [2.1.0] — 2026-10-16

Not tagged; it ships inside 2.2.0.

### Added
- `/qa-coverage`: how much of the application the suite covers, per dimension.
- Maestro as a mobile runner.
- `/qa-review-pr`: review a teammate's testing pull request before it merges.

### Changed
- Every authored artifact opens with the same front matter (CONTRACTS §2.1).
- Cases record the sources they were designed from in `## Grounding`.
- Runners are a single registry; every artifact template lives in `_templates/`.

## [2.0.0] — 2026-10-15

A redesigned workspace kit, bug-hunting techniques, run plans and platforms. MAJOR for the workspace kit.

### Breaking
- The Playwright shared layer, `.env` auth keys and the `setup` project changed; specs and `.env`
  files written for 1.x must be updated.
- Case titles, requirement tags (`@req:<slug>/REQ-NNN`) and five new plan headings are now lint errors.
- Playwright is pinned to an exact version; the VS Code board moved to `editor/vscode-stlc`.
- Every step, with before/after snippets and a rollback: UPGRADE.md, "2.0.0".

### Added
- Bug hunting: UI risk classes, schema-driven API fuzzing, model-based testing and a server-side watch.
- Run plans (CONTRACTS §19) and platforms (CONTRACTS §20), with a new `ui` type for visual and layout tests.
- Case quality checks a machine can run, AC traceability, and per-requirement coverage scoring.
- A derived `state.json`, a read-only VS Code board, and review verdicts that go stale when cases change.
- `/qa-ingest` for results from CI, and support for adding a feature to modules that already have tests.

## [1.0.0] — 2026-10-04

First versioned release.

### Added
- The analyze → plan → design → script → run → report pipeline across nine test types.
- The report and sign-off contract the development bundle reads (CONTRACTS §16).
- Retrospectives, check improvements and defect-detection metrics.
- Governance files for a public repository.
