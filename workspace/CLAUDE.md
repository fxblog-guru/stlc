# CLAUDE.md

<!-- Root CLAUDE.md template for a project using the agentic-fx-qa bundle in .claude/.
     Merge into your existing CLAUDE.md if you already have one. -->

## Project

`<project name>` — `<one-liner>`. All QA configuration lives in `.claude/PROJECT-PROFILE.md`;
read it before acting on anything below. This bundle does TESTING ONLY — it never modifies
application source code (source repos are read-only grounding). Sole, narrow exception: the
`unit` and `mobile` types may write generated *test files* under the test directories declared in
`.claude/PROJECT-PROFILE.md` §Unit testing / §Mobile testing, only when that section's Write mode is
`apply` (CONTRACTS §11 / §15); a mobile framework's `src/` is never edited.

## QA workspace layout

| Path | Purpose |
|---|---|
| `<qa-root>/analysis/<slug>/` | Requirement analysis (`YYYY-MM-DD-analysis.md`, REQ-ids); `sources/<KEY>.md` = read-only ticket snapshots — `/qa-analyze` |
| `<qa-root>/plans/<slug>/` | Strategy + test plan with the traceability table — `/qa-plan` |
| `<qa-root>/cases/<type>/<module>/` | Test cases `TC-<TYPE>-<MODULE>-<NNN>-*.md`, one file per case — `/qa-design` |
| `<qa-root>/scripts/<type>/<module>/` | Automation, mirrors case paths 1:1 — `/qa-script` |
| `<qa-root>/scripts/shared/` | The shipped Playwright kit — env, session auth + account pool (signed in once by the `setup` project), fixtures (actors, cleanup ledger, `pageAs`), `caseMeta`, factories + `uniqueName`, components, page objects, db, OpenAPI validator, axe. Its `README.md` holds the rules every spec follows |
| `<qa-root>/scripts/unit/HANDOFF.md` | Unit tests staged for developers: Case ID → staged file → repo target path → status — `/qa-script --type unit` |
| `<qa-root>/scripts/mobile/HANDOFF.md` | WDIO/Appium specs staged for the mobile developers (same bridge shape) — `/qa-script --type mobile` |
| `<qa-root>/runs/<type>/<slug>/<run-id>/` | Run artifacts (traces, k6 summaries, ZAP reports, findings.md, junit.xml) — `/qa-run` |
| `<qa-root>/runs/env-checks/<env>/<run-id>/` | Environment readiness reports — `/qa-env` |
| `<qa-root>/reports/<slug>/` | Consolidated reports (`YYYY-MM-DD-report.md`) — `/qa-report` |
| `<qa-root>/reports/release/<id>/` | Release sign-off (GO/NO-GO) — `/qa-signoff` |
| `<qa-root>/reports/metrics/` | Portfolio KPI snapshots — `/qa-metrics` |
| `<qa-root>/reports/retro/` | Retrospectives (leaks → actions with a mechanism) — `/qa-retro`; `improvements/` = proposed checks for the bundle — `/qa-improve` |
| `<qa-root>/defects/<slug>/` | Defect files `DEF-<slug>-NNN-*.md` with a lifecycle (OPEN → CLOSED with Resolution + Verification) — `/qa-defect`; `<qa-root>/defects/ESCAPES.md` = escaped-defect ledger — `/qa-escape` |
| `<qa-root>/reviews/<slug>/` | Case-review verdicts (READY / REVISE FIRST) — `/qa-review`; unit-test audits (ADEQUATE / GAPS) — `/qa-unit-audit` |
| `<qa-root>/regression/` | `regression-suite.md` (@smoke/@regression manifest) — `/qa-regression`; `quarantine.md` (flaky-case ledger, ≤30-day grants) — `/qa-quarantine` |
| `<qa-root>/exploratory/<slug>/` | Session-based exploratory testing sheets `XS-<slug>-NNN-*.md` (charter → notes → bugs → follow-ups → debrief) — `/qa-explore` |
| `<qa-root>/fixtures/` | Static seed data (managing-test-data) |
| `<qa-root>/wiki/` | Domain-knowledge wiki: `inbox/` (drop raw docs) → `compiled/` atomic pages + `index.md` — `/qa-knowledge`; when `compiled/index.md` exists, domain lookups resolve through it |
| `<qa-root>/docs/` | tag-taxonomy.md, element-registry.md, impact-map.md (BR ↔ module ↔ endpoint/screen ↔ TC — `/qa-impact`) |
| `<qa-root>/_templates/` | Every artifact format in one folder: analysis, plans, `case-<type>.md`, review, defect, exploratory, report, sign-off. Skills copy from here; front matter per CONTRACTS §2.1 |
| `<qa-root>/ci/` | CI templates (GitLab include · GitHub workflow): lint → smoke → nightly regression/a11y/quarantined → manual perf/security |
| `<qa-root>/config/` | TMS mapping (optional — ADO area paths / Jira components) |
| `<qa-root>/.env.<env>` | Per-environment credentials (from `.env.example`, never committed) |

Types: `unit` · `api` · `integration` · `e2e` · `security` · `performance` · `accessibility` ·
`mobile` (enable/disable per PROJECT-PROFILE §Test types; `unit` also needs §Unit testing,
`accessibility` §Accessibility, `mobile` §Mobile testing — off by default).

## Pipeline entry points

`/qa-analyze` → `/qa-plan` → `/qa-design` → `/qa-script` → `/qa-run` → `/qa-report`
(plus `/qa-knowledge` — build/update the domain wiki, best run before `/qa-analyze` —
`/qa-impact` — what a story touches: BRs, modules/code at a commit, cases to re-verify —
`/qa-unit-audit` — audit the repo's existing unit tests before designing new ones —
`/qa-heal`, `/qa-publish`, `/qa-status`). After runs: `/qa-defect` (raise · `--verify` · close),
`/qa-quarantine` (flaky, bounded), `/qa-escape` (production bugs → escape analysis + backfill),
`/qa-explore` (charters + debriefs). Release & portfolio: `/qa-signoff`, `/qa-regression`,
`/qa-metrics`. Recall loop: `/qa-retro` (where the process leaked, with a mechanism per action) →
`/qa-improve` (one earned check with its two fixtures). `/qa-feedback` records friction with the
bundle itself for its maintainer. `/qa-ingest` folds a CI run into the traceability table without re-running. `/qa-help` prints the map. The
`qa-orchestrator` agent routes free-form requests.

## Contracts

`.claude/CONTRACTS.md` is the single source of truth for cross-file contracts (ids, paths,
table columns, plan headings, triage vocabulary, tag writers, quarantine, defect lifecycle,
exploratory sheets). When a file and CONTRACTS.md disagree, CONTRACTS.md wins. Mechanical checks:
`cd qa && npm run qa:lint`; script rules: `npm run heal:check` (tsc + eslint).

## Test-case autonomy

Canonical rules every agent follows when touching `<qa-root>/` artifacts:

1. **Never rename a case file after it exists** — TC ids are permanent; supersede, don't rename.
2. **Never guess a path** — placement goes through `resolving-test-placement`; unknown module → ask with evidence.
3. **Locate cases by content, not filename** — via the plan's traceability table, or grep `**Feature:** <slug>` headers. Never glob `<slug>.md`.
4. **Upsert, never duplicate** — re-running a design/script phase updates existing artifacts in place.
5. **Never fabricate** — no invented REQ-ids, locators, endpoints, run numbers, or `@tms:` ids. A gap is reported as a gap. Code facts carry a `<layer>:<path>#<symbol> @ <sha>`
   citation (`grounding-in-code`); application source is never edited — generated unit tests go to
   the declared test dirs only, via `<qa-root>/scripts/unit/HANDOFF.md`, never to production paths.
6. **Runs never auto-fix** — `/qa-run` reports failures with evidence; fixes go through `/qa-heal` (scripts) or the dev team (app bugs). A flaky case is quarantined in the open (`/qa-quarantine`), never retried to green or skipped.
7. **Defects end with evidence** — CLOSED only with a Resolution; `fixed` only after a passing verification run recorded in the file (`/qa-defect --verify`).
8. **Security & performance only against authorized environments** (PROJECT-PROFILE §Environments) and only the team's own application.
9. **External trackers are written only after an explicit yes** on the exact list (ADO/Jira cases, bugs, comments); reads are free.
