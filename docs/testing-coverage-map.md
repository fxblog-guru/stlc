# Testing coverage map — the whole pyramid, and who owns each layer

Written for: a QA lead deciding whether this bundle (with its sibling `agentic-fx-dev`) covers
every kind of testing a product needs, and where each kind lives.

Two bundles share the work (`CONTRACTS §9`, `DEV-CONTRACTS §9`): the dev bundle builds and proves
the code; this bundle verifies the product. A layer is **covered** when one of them owns it with a
gate that can fail. "Planned" means a pack is designed (`CONTRIBUTING.md`, `docs/roadmap.md §7`)
and not yet shipped.

Legend: ✅ shipped here · ↔ owned by the dev bundle · 🧩 pack planned · ◐ partial · ✗ out of scope

## The pyramid, bottom up

| # | Layer | What it proves | Owner | Where | Status |
|---|---|---|---|---|---|
| 1 | **Static analysis** — lint, format, types, secret scan, dependency scan | the code compiles and carries no known vulnerability or secret | dev | G8 `verify.md`; SARIF reaches the hub | ↔ |
| 2 | **Code review** against approved tasks, contract and data model | the change is what was planned | dev | G7 `dev-reviewing-implementation` | ↔ |
| 3 | **Unit** — logic-bearing symbols, whole input space on a matrix | the rule is right for every partition, boundary and state | dev writes beside the code; QA designs the matrix and audits the existing suite | G7 · type `unit` (`TC-UNIT`, `HANDOFF.md`) · `/qa-unit-audit` | ✅ ↔ |
| 4 | **Property-based** — a rule over the whole domain | no counter-example in the domain | QA (matrix `Technique: property`; API-level: model tests) | `designing-unit-cases` references · api `## Model` cases (`shared/model/model-runner.ts`, seeded, shrinking) | ◐ unit idea · ✅ API model tests |
| 5 | **Mutation** — do the tests notice a changed operator or constant | the suite is sensitive, not just green | QA | `reviewing-unit-tests` spot checks; a run is *Not yet* (`docs/skill-sources.md`) | ◐ |
| 6 | **Component** — UI components in isolation | a component renders every state | dev | G7 (Vitest + Testing Library · Playwright CT) | ↔ |
| 7 | **Integration** — DB, seams, queues | an API action leaves the right state; a rejected request leaves none | dev (integration tier) + QA | G7/G8 · type `integration` (`TC-INT`) | ✅ ↔ |
| 8 | **Contract** — provider against its published contract; old clients against the new one | the API matches the spec; drift is caught; old request shapes, response fields, enums and cached frontend bundles still work | dev validates the spec at G4; QA checks drift and backward compatibility | type `api` contract-drift case; for `deploy_impact: api` the deploy checks `api-old-client`, `api-cached-client`, `api-versioning` (`CONTRACTS §30`); Pact / Schemathesis as an alternative *Tool* | ✅ |
| 9 | **API functional** — CRUD, negatives, authz, endpoint classes | the HTTP contract behaves | QA | type `api` (`TC-API`) + schema fuzzing (`TC-API-FUZZ-*`, `shared/fuzz/openapi-fuzz.ts`) + server log watch (`serverWatch`) | ✅ |
| 10 | **End-to-end functional UI** | the P0/P1 journeys work through the browser | QA | type `e2e` (`TC-E2E`), Playwright; UI risk classes (`designing-functional-cases` Step 1b) | ✅ |
| 11 | **Mobile** — one journey per platform plus the device reality | the app survives interrupts, offline, permissions, orientation | QA | type `mobile` (`TC-MOB`): **Maestro** flows run from `<qa-root>/` on the shipped kit (`scripts/shared/maestro/`), or Appium 2 + WebdriverIO staged to the mobile repo through `HANDOFF.md` | ✅ (off by default) |
| 12 | **Cross-browser / cross-platform** | the P0 journeys pass on every gate-tier engine and platform | QA | `§Platforms` (web targets · android/ios · windows/macos · api · other) + `PW_PLATFORMS`/`PW_PROJECTS`; a `Platform: <label>` gate row per gate-tier platform (`CONTRACTS §20`) | ✅ shipped 1.1 |
| 13 | **Visual & layout UI** | nothing that works looks broken, at every viewport | QA | type `ui` (`TC-UI`): `toHaveScreenshot` per state × viewport × project with masks and Linux CI baselines, plus pixel-free layout checks (reflow, overflow, overlap, target size, tokens) | ✅ shipped 1.1 |
| 14 | **Accessibility** — WCAG 2.2 AA | every in-scope screen state is operable and perceivable | dev specifies per component at G5; QA proves it | type `accessibility` (`TC-A11Y`), axe + keyboard + `@manual` sessions | ✅ ↔ |
| 15 | **Localization / i18n** | locales, formats, RTL, truncation, untranslated keys | QA | pack `i18n` — pseudo-localization + a locale matrix over the e2e journeys | 🧩 |
| 16 | **Performance** — load, stress, spike, soak | p95 and error-rate SLOs hold under the declared workload | QA | type `performance` (`TC-PERF`), k6 thresholds = SLOs | ✅ |
| 17 | **Frontend performance budgets** | bundle size and Core Web Vitals within budget | dev states the budget at G8 (`§13.7`) | — | ◐ no QA runner; a Lighthouse CI step is a candidate inside the `performance` type |
| 18 | **Security** — DAST baseline + authz matrix | no unresolved High/Critical finding; every denied cell denies | dev threat-models at G2 and scans at G8; QA attacks the running app | type `security` (`TC-SEC`), ZAP baseline + Playwright authz, authorized envs only | ✅ ↔ |
| 19 | **Penetration test** | an adversary with time finds nothing worse | external | — | ✗ out of scope by design; findings enter through `/qa-escape` |
| 20 | **Resilience / chaos** | a slow or dead dependency degrades the product the way the design said | QA | pack `resilience` — hypothesis, steady state, fault injection (Toxiproxy shipped), abort < 30 s | 🧩 |
| 21 | **Disaster recovery** | backups restore; RTO and RPO are met | QA facilitates, ops executes | pack `dr` — a drill sheet (exploratory variant) with measured TTD/TTE/RTA against RTO/RPO | 🧩 |
| 22 | **Data migration and rollback** | `up → down → up` is clean; the migration holds on production volume (lock, duration); integrity after it; N-1 code runs on the new schema; the previous build and the restore path work. A change to existing rows adds backup and restore, a baseline before, a resumable and idempotent run, verification after, rollback with post-backup writes, and N-1 on transformed data | dev runs the G8 round-trip; QA designs the deploy checks the plan's `deploy_impact: db` requires | G8 round-trip (`DEV-CONTRACTS §7`) · `integration` cases with `**Deploy check:**`, `qa:lint` fails a plan missing one (`CONTRACTS §30`) | ✅ ↔ |
| 23 | **Data pipelines / ELT** | sources, layer hops and contracts reconcile at value level; incremental runs are idempotent | QA designs, data engineers own the repo | type `data` (`TC-DATA`): dbt / PySpark tests staged through `HANDOFF.md`, recon per hop, mutation-gated (`CONTRACTS §28`); runnable templates `afx template dbt-elt` / `spack-elt` | ✅ (off by default) |
| 24 | **Exploratory** — charters, sessions, debriefs | what nobody predicted | QA + human tester | `/qa-explore` (`XS-*` sheets; `--agent` drives a charter through Playwright with the server log as oracle) | ✅ |
| 25 | **Regression and smoke suites** | nothing that passed before fails now, in under ten minutes | QA | `/qa-regression` (`@smoke`, `@regression`), quarantine ledger | ✅ |
| 26 | **Usability / UAT / business sign-off** | the business accepts it | QA facilitates (charters, sign-off); the business decides | `/qa-explore` charters for UAT · `/qa-signoff` GO / NO-GO (advisory) | ✅ |
| 27 | **Post-deploy smoke** | the release is alive in production | dev runs it; QA designs the `post-deploy-verify` check for a DB or API change (after migrate and after rollout) | G10 smoke checks; a failure rolls back · `CONTRACTS §30` | ✅ ↔ |
| 28 | **Testing in production / synthetic monitoring** | real traffic behaves; probes keep proving it | dev proves telemetry at G11; a QA pack is a candidate | G11 `post-release.md` · verdict live runs | ◐ |
| 29 | **LLM / agent evaluation** | the model feature meets its evals | separate bundle | `agentic-fx-ai-eval` (`/eval-*`), same hub | ✗ here, ✅ in the sibling bundle |
| 30 | **Release readiness** | every gate, every feature, every defect accounted for | QA | `/qa-signoff` eleven exit criteria; read by dev G10 | ✅ |

## The shape, not only the list

`PROJECT-PROFILE §Quality gates` states the target mix, and `/qa-metrics` reports the deviation
without a verdict: **unit ≥ 50 % · api + integration ≥ 30 % · e2e ≤ 15 %** of designed cases, the
rest non-functional. The reason is in the README: roughly four in five product defects are born in
in-process logic or at the HTTP contract, and the e2e tier sees them only through the payloads a
browser happens to send. A pyramid that is e2e-heavy is slower, flakier and finds fewer bugs — the
mix is a gate input, and `/qa-retro` reads escapes by *type missed* to say which layer is leaking.

## What "comprehensive" will mean when the packs ship

Rows 15, 20 and 21 are the three layers neither bundle covers today (visual shipped as the `ui`
type and the browser matrix became the §Platforms gate rows in 1.1). Order by value for effort
(`docs/roadmap.md §7`): **i18n → resilience → DR**. Every pack lands with the same shape — a profile row (disabled by default),
`§7` case sections, a designing and a generating skill, a runner, a lint check, a report step and
a fixture — so a disabled pack is out of scope everywhere and never an error.

A pack that needs a tool other than Playwright, k6 or ZAP adds a **runner** to the same registry
Maestro uses (`scripts/shared/lib/runners.mjs`, CONTRIBUTING "Adding a runner"). That is one entry
and a wrapper that writes `results.json`. Run plans, verdicts and reports then cover it unchanged.

## Where the dev bundle and this one meet

| Direction | Artifact | Read by |
|---|---|---|
| dev → QA | `dev/release/<slug>/qa-handoff.md` (REQ ids verbatim, automation-tier criteria = scope, shipped SHA) | `/qa-analyze` |
| QA → dev | `<qa-root>/reports/<slug>/YYYY-MM-DD-report.md` — one verdict per gate (`CONTRACTS §16`) | G10 precondition |
| QA → dev | `<qa-root>/reports/release/<id>/YYYY-MM-DD-signoff.md` — `GO` / `NO-GO` / `CONDITIONAL GO` | G10 precondition |
| QA → dev | `<qa-root>/defects/<slug>/DEF-*.md`, `Origin: ESCAPED` | G11 improvement loop |
| dev → QA (planned, read-only) | `dev/deployment/<slug>/runs/*/deploy-run.md` rollbacks | `/qa-metrics` change-failure linkage |

Nothing else crosses in either direction.
