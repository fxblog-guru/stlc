---
slug: <slug>
artifact: test-plan
status: draft
authored_by: planning-tests
reviewed_by: pending
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# Test Plan — <slug> — YYYY-MM-DD
**Change type:** new_project | update_existing | add_feature  **Analysis:** <qa-root>/analysis/<slug>/YYYY-MM-DD-analysis.md  **Strategy:** <qa-root>/plans/<slug>/YYYY-MM-DD-strategy.md  **Shipped SHA:** <short-sha from the dev handoff packet cited in the analysis | —>

<!-- Written by /qa-plan (planning-tests skill, Step 2). Fixed section order — downstream
     skills and quality gates parse these headings. The traceability table below is the SINGLE
     source of truth for the whole pipeline: designing-* appends rows, generating-* flips
     Scripted, executing-tests fills run results, /qa-report + gates read ONLY this table. -->

## 1. Coverage targets

<!-- One row per enabled type; targets validated against profile §Quality gates. -->

| Type | REQs in scope | Case coverage target | Sign-off gate (§Quality gates) |
|---|---|---|---|
| api | <REQ ids> | 100% of in-scope REQs have ≥1 case | 0 failing P0/P1 |
| integration | | every declared seam has ≥1 case | 0 failing P0/P1 |
| e2e | | 100% of P0/P1 journeys cased | 0 failing P0/P1 |
| security | | authz matrix 100% + Top-10-derived set | no unresolved High/Critical findings |
| performance | | every critical flow has a workload scenario | p95 & error-rate SLOs met (§5) |
| unit | <logic-bearing REQ ids> | every logic-bearing symbol behind a P0/P1 REQ has ≥1 case | 0 failing; coverage ≥ §Unit testing thresholds on impacted modules |
| accessibility | <UI REQ ids> | every in-scope screen state has an axe case; every interactive screen a keyboard case | 0 unresolved Critical/High findings (WCAG 2.2 AA) |
| mobile | <app-journey REQ ids> | every P0 journey on both platforms + the device-reality floor | 0 failing P0/P1 on gate-tier devices; 0 crashes/ANRs |

## 2. Schedule of phases

| Phase | Command | Owner | Window | Deliverable |
|---|---|---|---|---|
| Case design | /qa-design | case-designer | <dates> | <qa-root>/cases/<type>/<module>/TC-… files + traceability rows |
| Scripting | /qa-script | automation-engineer; nonfunctional-engineer (perf/security); unit-test-engineer (unit → HANDOFF.md); mobile-test-engineer (mobile → HANDOFF.md) | <dates> | <qa-root>/scripts mirrors of every case; Scripted ✅ |
| Execution | /qa-run | qa-reporter (all types) | <dates> | <qa-root>/runs/<type>/<slug>/<run-id>/ + table results |
| Exploratory | /qa-explore | test-planner (charters) + human tester | <dates> | <qa-root>/exploratory/<slug>/XS-… sheets, debriefed |
| Reporting | /qa-report | qa-reporter | <dates> | <qa-root>/reports/<slug>/YYYY-MM-DD-report.md + gate verdicts |
| TMS publish (optional) | /qa-publish | qa-reporter | after design sign-off | @tms:<id> tags on published cases |

<!-- Omit the /qa-publish row when §Test management is `none`. -->

## 3. Roles

| Role (agent) | Responsibility in this plan |
|---|---|
| qa-orchestrator | Entry point; delegates every phase; never executes skills itself |
| doc-analyst | Owns the analysis; re-runs /qa-analyze on requirement changes |
| test-planner | Owns this plan + strategy; sole editor of plan sections (not traceability results) |
| case-designer | e2e/api/integration/accessibility cases; appends traceability rows |
| automation-engineer | e2e/api/integration/accessibility scripts; heals e2e |
| nonfunctional-engineer | performance + security cases and scripts |
| unit-test-engineer | unit cases + generated tests staged in <qa-root>/scripts/unit/ + HANDOFF.md; /qa-unit-audit |
| mobile-test-engineer | mobile cases (both platforms, device reality) + WDIO specs staged in <qa-root>/scripts/mobile/ + HANDOFF.md |
| qa-reporter | Runs, reports, gate verdicts, defect lifecycle (raise · verify · close · escapes), optional TMS publishing |

## 4. Phase entry/exit gates

| Phase | Entry gate | Exit gate |
|---|---|---|
| /qa-design | Plan approved; blocking questions = 0 | Every in-scope REQ has ≥1 traceability row per applicable type; all case files carry **Feature:**/**Plan:** headers and taxonomy-ordered tags |
| /qa-script | Cases exist; `<qa-root>/.env.<env>` prepared from <qa-root>/.env.example | Every designed case has a mirror script (path 1:1); Scripted ✅ across the table |
| /qa-run | Scripts ✅; target environment reachable | Every case has Last run + Status; failures triaged (defect vs script vs env) |
| /qa-report | Run results in the table | Report written; every §Quality gates verdict rendered pass/fail (quarantined counted separately); sign-off decision recorded |
| /qa-defect | ❌ rows with FUNCTIONAL triage · fixed defects re-run | Every FUNCTIONAL failure has one OPEN defect; fixed defects CLOSED with Resolution + Verification |

## Performance SLOs

<!-- Exact heading — designing-performance-scenarios and reporting-results resolve this section
     by name and STOP without it. "Not applicable" only if performance is disabled.
     Every target traces to the analysis, an accepted question default, or §Quality gates —
     an untraceable SLO is a planning defect. /qa-report renders each row pass/fail. -->

| Transaction | Metric | Target (SLO) | Source |
|---|---|---|---|

## Quality gates

<!-- Exact heading — reporting-results reads this section by name.
     One row per gate, sourced from PROJECT-PROFILE §Quality gates (defaults apply where silent).
     Security gate rows (e.g. "0 unresolved High/Critical") live here. -->

| Gate | Target | Source |
|---|---|---|

## Traceability (Requirement ↔ Case)

| Req | Case ID | Type | Module | Priority | Scripted | Last run | Status | Report |
|-----|---------|------|--------|----------|----------|----------|--------|--------|

> Rows are appended by `designing-*` skills (one per case, `Scripted` ❌). `generating-*`
> skills flip `Scripted` to ✅. `executing-tests` fills `Last run`, `Status`
> (✅ pass / ❌ fail / ⛔ blocked) and `Report` (path under `<qa-root>/runs/…`). `/qa-report`,
> `/qa-status`, and every quality gate read ONLY this table. Never delete or renumber rows.

<!-- Do not pre-fill rows, even "obvious" ones — an empty skeleton is the contract. -->

## AC coverage

<!-- One row per AC in the analysis AC register (carried verbatim from the dev handoff when there is
     one). Written by planning-tests with Case IDs `—` and Status `not covered`; designing-* skills
     fill Case IDs as they write cases whose `**AC:**` line names the AC. qa:lint checks every
     register AC has a row, every listed case names the AC, and Status ∈ covered | partial |
     not covered | deferred (<reason>). This table is separate from the §3 traceability table and
     never replaces it. -->

| AC | REQ | Case IDs | Status |
|---|---|---|---|

## Test environment

<!-- Per enabled type: environment (from PROJECT-PROFILE §Environments), data source
     (<qa-root>/docs/test-data.md pools/factories), tooling version, and what is NOT available there
     (e.g. no load testing on uat). /qa-env checks readiness against this section. -->

## Suspension & resumption

<!-- When execution stops and what restarts it — e.g. suspend when /qa-env says NOT READY for a type,
     a P0 smoke case fails, or > 20% of a run is ⛔ blocked; resume after a green /qa-env and a smoke
     re-run. ISO/IEC/IEEE 29119-3 "suspension criteria and resumption requirements". -->

## Risk register

<!-- Link to the analysis §6 risk table (<qa-root>/analysis/<slug>/YYYY-MM-DD-analysis.md § 6) plus any
     PROJECT risks found while planning (schedule, environment, skills) with owner and mitigation. -->

## Approvals

<!-- Who approved this plan, and when. /qa-design's entry gate is "Plan approved". -->

| Role | Name | Decision | Date |
|---|---|---|---|

## Change log

<!-- One dated line per update (planning-tests Step 3); created empty.
     Targets may tighten; gates never silently loosen. -->
