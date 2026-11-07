# <qa-root>/ — agentic-fx-qa workspace

`<qa-root>` is this folder: `.stlc/` in a new project, `qa/` in one installed before 2.1 (both are
supported; PROJECT-PROFILE `QA root` names it, `migrate-root.mjs` moves it — CONTRACTS §2).
All testing artifacts live here; app source code never does. Layout (fixed contract — the
skills resolve these paths, don't rearrange):

```
<qa-root>/
  _templates/                                     # every artifact format, one place (bundle-owned; skills copy from here)
  analysis/<slug>/YYYY-MM-DD-analysis.md          # /qa-analyze — REQ-ids, risks, type matrix
  analysis/<slug>/sources/<KEY>.md                #   read-only snapshots of tracker tickets (Jira keys)
  plans/<slug>/YYYY-MM-DD-strategy.md             # /qa-plan
  plans/<slug>/YYYY-MM-DD-test-plan.md            #   + traceability table (source of truth)
  cases/<type>/<module>/TC-<TYPE>-<MODULE>-<NNN>-*.md  # /qa-design — one file per case
  scripts/<type>/<module>/…                       # /qa-script — mirrors cases 1:1
    shared/                                       #   SHIPPED kit: config/env · auth (session, pool) · fixtures (actors, cleanup, pageAs) · meta (caseMeta) · data (uniqueName, cleanup) · http · components · pages · db · schemas · a11y
    shared/changed-modules.mjs · renumber-case.mjs #   git diff → modules/cases (impact map) · Case-ID collision repair (CONTRACTS §1)
    setup/auth.setup.ts                           #   shipped `setup` project: validates .env, signs every actor in once (.auth/<env>/)
    security/zap-baseline.sh                      #   shipped ZAP baseline runner (gated by *.conf)
    performance/run-k6.sh                         #   shipped k6 wrapper (loads .env.<env>)
    accessibility/<module>/TC-A11Y-*.spec.ts      #   Playwright + axe-core specs (manual cases have none)
    unit/<module>/TC-UNIT-*.<ext>                 #   STAGED unit tests (the file that lands in the repo)
    unit/HANDOFF.md                               #   staged → repo target path → status (dev handoff)
    unit/run-unit.sh · unit/coverage-summary.mjs  #   shipped unit runner wrapper + coverage parser
    mobile/<module>/TC-MOB-*.spec.ts              #   STAGED WDIO/Appium specs (the file that lands in the mobile framework repo)
    mobile/HANDOFF.md · mobile/run-mobile.sh      #   staged → framework repo target path → status · runner wrapper (per platform)
  runs/<type>/<slug>/<run-id>/                    # /qa-run artifacts (summary.md, failures.md, findings.md, junit.xml, traces…)
  runs/env-checks/<env>/<run-id>/readiness.md     # /qa-env preflight reports
  reports/<slug>/YYYY-MM-DD-report.md             # /qa-report
  reports/release/<id>/YYYY-MM-DD-signoff.md      # /qa-signoff — GO/NO-GO across features
  reports/metrics/YYYY-MM-DD-metrics.md           # /qa-metrics — portfolio KPIs (DDP first)
  reports/retro/YYYY-MM-DD-retro.md               # /qa-retro — leaks → actions with a mechanism
  reports/retro/improvements/                     # /qa-improve proposals (installed projects)
  defects/<slug>/DEF-<slug>-NNN-*.md              # /qa-defect — lifecycle: OPEN → CLOSED (Resolution + Verification)
  defects/ESCAPES.md                              # /qa-escape — escaped-defect ledger (escape rate)
  reviews/<slug>/YYYY-MM-DD-case-review.md        # /qa-review — READY / REVISE FIRST verdicts
  reviews/<slug>/YYYY-MM-DD-unit-review.md        # /qa-unit-audit — existing unit tests: ADEQUATE / GAPS
  regression/regression-suite.md                  # /qa-regression — @smoke/@regression manifest
  regression/quarantine.md                        # /qa-quarantine — flaky-case ledger (≤30-day grants, evidence)
  exploratory/<slug>/XS-<slug>-NNN-*.md           # /qa-explore — session sheets (charter · notes · bugs · follow-ups · debrief)
  fixtures/                                       # static seed data (managing-test-data)
  wiki/                                           # /qa-knowledge — domain-knowledge wiki
    inbox/                                        #   drop raw docs (pdf/docx/xlsx/csv/md…)
    compiled/index.md                             #   retrieval entry point (atomic pages)
    WIKI-RULES.md · CHANGELOG.md                  #   compilation rules + run history
  docs/tag-taxonomy.md                            # tag vocabulary (fixed order)
  docs/element-registry.md                        # locator source for e2e + accessibility generation
  docs/test-data.md                               # [DATA:*] token glossary (managing-test-data)
  docs/impact-map.md                              # BR ↔ module ↔ endpoint/screen ↔ TC
  docs/templates/report.html                      # optional HTML report shell
  ci/.gitlab-ci.qa.yml · ci/github-qa.yml         # CI templates, GitLab + GitHub at parity (lint → smoke → only-changed · nightly shards → merged report · shuffle · manual perf/security)
  config/tms/mapping-path.md                      # optional TMS mapping (ADO area paths · Jira components)
  package.json · playwright.config.ts · eslint.config.mjs · tsconfig.json · .env.example
```

Types: `unit` · `api` · `integration` · `e2e` · `security` · `performance` · `accessibility` · `mobile`.

First run: `cd qa && npm install && npx playwright install`, copy `.env.example` →
`.env.uat`, fill it, then start with `/qa-analyze <slug> <docs…>` (or `/qa-help`).

Runners (used by the commands — keep the names): `test:e2e`, `test:api`, `test:integration`,
`test:perf` (k6 binary required), `test:security` (docker required), `test:unit` (runs the
command declared in PROJECT-PROFILE §Unit testing inside the app repo), `test:a11y`
(Playwright + axe-core), `test:mobile` (runs the mobile framework repo's own command per platform,
PROJECT-PROFILE §Mobile testing), `test:smoke` / `test:regression` (tags, quarantined excluded),
`test:quarantined`, `report:allure` (optional), `heal:check` (tsc + eslint), `qa:lint`
(CONTRACTS checks). Browser matrix: `PW_PROJECTS=chromium,firefox,webkit,mobile-chrome,mobile-safari`.
