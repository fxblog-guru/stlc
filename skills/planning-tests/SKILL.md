---
name: planning-tests
description: Use after /qa-analyze to write the strategy and the test plan with the EMPTY traceability table, coverage and gate targets (/qa-plan).
version: 1.0.0
---

# Planning Tests — Strategy + Test Plan

> Profile first, by section (`profile.mjs`) — §Test types decides which types get planned and
> with what tooling, §Quality gates supplies the coverage/sign-off targets, §Environments the
> environment plan, §Test management whether TMS publishing appears in the schedule. QA root
> defaults to `<qa-root>/` (profile-overridable).

Produce exactly TWO dated artifacts from one analysis:

| # | Artifact | Path | Answers |
|---|---|---|---|
| 1 | **Strategy** | `<qa-root>/plans/<slug>/YYYY-MM-DD-strategy.md` | *How* each enabled type is tested — approach, tooling, scope, data, environments |
| 2 | **Test plan** | `<qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md` | *What/when/who* — coverage targets, phase schedule, gates, roles, and the traceability skeleton |

The plan owns the pipeline's single source of truth: the
`## Traceability (Requirement ↔ Case)` table. This skill creates it **empty**; it never adds
case rows — `designing-*` skills append rows, `generating-*` skills flip `Scripted`,
`executing-tests` fills run results, and `/qa-report` + quality gates read ONLY this table.
This is a testing-only workflow: plan; never implement application code.

---

## Entry criteria (verify, in order — stop and report if any fails)

1. **Analysis exists** — locate the latest `<qa-root>/analysis/<slug>/YYYY-MM-DD-analysis.md` (highest
   date wins). No analysis → stop: "Run `/qa-analyze` first (skill: `analyzing-docs`)."
2. **No blocking open questions** — in the analysis §9, every question with `Blocking? = Yes`
   must be answered or explicitly waived by the user ("proceed with the proposed default").
   Otherwise stop and list the blockers verbatim; planning built on a guessed contract, scope,
   or security rule is worse than no plan.
3. **`change_type`** — read from the analysis header (`new_project | update_existing | add_feature`);
   it selects the create-vs-update rules and the exit criteria below.
4. **Enabled types** — intersect PROJECT-PROFILE §Test types with the analysis §5 testability
   matrix. Plan only types that are BOTH enabled and applicable (⚠-partial counts as applicable
   for the stated portion). Types skipped either way are listed once in both artifacts under
   "Out of scope" with the reason.

---

## Step 0 — Create vs update

Check `<qa-root>/plans/<slug>/` for an existing strategy/plan pair:

- **No existing plan** (typical for `new_project`, first `add_feature` on a new slug) → create
  both artifacts dated today.
- **Existing plan for this slug** (`update_existing`, or `add_feature` extending a planned
  slug) → **update the existing files in place; do NOT create a second dated pair.** Case files
  point at the plan by filename (`**Plan:** <qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md`), so the
  filename must stay stable for the life of the slug. Follow the append rules in Step 3.
- `update_existing`/`add_feature` whose analysis touches a slug that has NO plan is legal —
  treat as create, but seed scope from the analysis §3 delta.

---

## Step 1 — Strategy artifact (`<qa-root>/plans/<slug>/YYYY-MM-DD-strategy.md`)

One `## <type> strategy` section per enabled type. Every section answers the same six
questions — a section missing any of them is incomplete:

1. **Approach** — what kinds of cases this type will carry for THIS initiative, driven by the
   analysis (REQ kinds, risks, endpoint inventory). Name the techniques (CRUD lifecycle,
   boundary analysis, state transitions, authz matrix, workload models…), not platitudes.
2. **Tooling** — from §Test types; where the profile is silent, use the bundle defaults and say
   "(bundle default)":

   | Type | Default tooling | Script artifact (per contract) |
   |---|---|---|
   | e2e | Playwright + TypeScript | `<qa-root>/scripts/e2e/<module>/TC-E2E-….spec.ts` |
   | api | Playwright API tier (TS) | `<qa-root>/scripts/api/<module>/TC-API-….spec.ts` |
   | integration | Playwright API tier + DB assertions | `<qa-root>/scripts/integration/<module>/TC-INT-….spec.ts` |
   | performance | k6 (`.js`); Locust (`.py`) as the profile-selected alternative | `<qa-root>/scripts/performance/<module>/TC-PERF-….js` |
   | security | OWASP ZAP baseline config + authz spec files | `<qa-root>/scripts/security/…` |
   | unit | the app repo's own framework per `§Unit testing` (xUnit/NUnit · Vitest/Jest · pytest · JUnit 5) | `<qa-root>/scripts/unit/<module>/TC-UNIT-….<ext>` (staged) → `<qa-root>/scripts/unit/HANDOFF.md` → repo test dir |
   | accessibility | Playwright + axe-core (WCAG 2.2 AA via `shared/a11y/axe.ts`); manual checks by a human | `<qa-root>/scripts/accessibility/<module>/TC-A11Y-….spec.ts` (`@manual` cases: none) |
   | mobile | the mobile automation repo's own framework per `§Mobile testing` (Appium 2 + WebdriverIO — mobilewright) | `<qa-root>/scripts/mobile/<module>/TC-MOB-….spec.ts` (staged) → `<qa-root>/scripts/mobile/HANDOFF.md` → framework repo test dir |

3. **Scope — in** — the modules and REQ ids this type covers (cite ids: "orders: REQ-001,
   REQ-005; invoices: REQ-002–REQ-003").
4. **Scope — out** — what this type deliberately does NOT cover and which other type (or
   nothing) covers it instead. Example: "e2e excludes overdue-job timing — covered by
   integration (REQ-002)".
5. **Data strategy** — seed data, builders/factories, isolation rules (parallel-safe unique
   keys, e.g. order numbers suffixed per run), cleanup policy (created invoices voided in
   teardown), PII policy (synthetic identities only).
6. **Environment needs** — which §Environments environment, plus the exact `<qa-root>/.env.example`
   variables consumed. Use ONLY these names: `BASE_URL`, `API_BASE_URL`, `TEST_USER`,
   `TEST_PASSWORD`, `DB_CONNECTION` (integration), `PERF_TARGET_URL`, `PERF_VUS`,
   `PERF_DURATION`, `ZAP_TARGET_URL`, `A11Y_FAIL_ON` (accessibility), `PW_PROJECTS` (browser matrix),
   `OPENAPI_SPEC`, `AUTH_MODE` (+ TMS: `ADO_BASE_URL`, `TMS_ADO_PAT`, `ADO_PROJECT`, `ADO_AREA_ROOT`,
   `PLAN_ID`, `SUITE_ID`, or `JIRA_PROJECT_KEY`). The unit section names NO env variables (hermetic) —
   it names the `§Unit testing` layer rows it relies on (repo path, framework, Write mode).

Plus a `## Risks & mitigations` section carrying the analysis §6 High/Medium risks forward with
a per-risk mitigation owned by a type ("R-001 idempotent-job risk → integration re-run case,
P0").

**Per-type strategy guidance:**

- **api** — cover the endpoint inventory: positive contract per endpoint, auth states
  (valid/expired/invalid/missing/wrong-scope), boundary/enum probes on constrained fields,
  duplicate/conflict and idempotency scenarios, CRUD lifecycle chains
  (create order → read → update → cancel → verify 404/terminal state).
- **integration** — the seams from the testability matrix entry points: jobs, queues, webhooks,
  DB state assertions via `DB_CONNECTION` (e.g. overdue job marks exactly the invoices past
  threshold, and is idempotent on re-run).
- **e2e** — persona-named user journeys over `BASE_URL` (finance user opens invoice list →
  filters overdue → voids one → sees audit note); keep the count lean, push breadth down to api.
- **performance** — workload models per critical flow with weights mirroring expected traffic
  (e.g. 70% list invoices / 20% view / 10% create), and per model the shape: smoke (minimal VUs,
  validates script + env), load (expected peak vs SLOs), stress / spike / soak only where the
  analysis flags the risk. Parameters come from `PERF_VUS` / `PERF_DURATION`; SLOs go in the
  plan's gate table (Step 2.6).
- **security** — OWASP-Top-10-derived case selection scoped to the analysis findings; an
  authz matrix (roles × protected resources/actions, e.g. `finance` vs `sales` × void-invoice);
  input-validation probes on user-supplied fields; ZAP baseline scan against `ZAP_TARGET_URL`.
  **Scope guardrail (must appear verbatim in the strategy):** security tests target ONLY the
  team's own application in authorized test environments (§Application under test); standard
  practice only — no exploit development, no testing of third-party systems.
- **unit** — the logic-bearing symbols behind the P0/P1 REQs and cited BRs (calculators, validators,
  state machines, mappers, policies), selected by risk (density × consequence), each grounded to
  `<layer>:<path>#<symbol> @ <sha>`; techniques: equivalence partitions, boundary triples, decision
  tables, state-transition matrices, exception contracts, properties, mutation guards; doubles at
  ports only; Write mode and coverage thresholds from `§Unit testing`; on brownfield modules,
  schedule `/qa-unit-audit` BEFORE design so cases target real gaps. What unit deliberately does
  NOT cover (HTTP contract, DB state, UI) is named with its owning type.
- **accessibility** — the in-scope screens × states (from the e2e journeys and the element registry)
  against `§Accessibility` (default WCAG 2.2 AA): one automated axe case per screen state, keyboard/
  focus/validation/reflow cases per interactive screen, `@manual` cases for what a machine cannot hear
  or see (executed in exploratory sessions — plan a `/qa-explore` charter for them). Viewports/browsers
  from `§Browsers & devices`. Third-party widgets the team does not own are excluded with the reason.
- **mobile** — the app journeys and the device reality (interrupts, background/foreground, offline and
  flaky network, permissions, orientation, deep links, WebView, biometrics, kill/relaunch) on the
  `§Mobile testing` platforms and device tiers; one journey stated for both platforms, platform deltas
  inside the case; app build from the app repo's pipeline (`ANDROID_APP`/`IOS_APP`); specs staged and
  handed to the mobile developers through `HANDOFF.md` (Write mode from the profile); what mobile does
  NOT cover (API contract, DB state, web screens) is named with its owning type.
- **exploratory (no traceability rows)** — name the charters the strategy expects before sign-off
  (`/qa-explore`): High risks without a scripted proof, BRs with no TC, escape areas, manual a11y
  cases; one 90-min session each; debriefs feed `/qa-defect --from-exploratory` and `/qa-design`.

Strategy skeleton:

```markdown
# Test Strategy — <slug> — YYYY-MM-DD
**Change type:** … **Analysis:** <qa-root>/analysis/<slug>/YYYY-MM-DD-analysis.md
**Enabled types planned:** … **Excluded types:** <type — reason>

## <type> strategy        <!-- repeat per enabled type: Approach / Tooling / Scope in /
                               Scope out / Data strategy / Environment needs -->
## Risks & mitigations
## Change log             <!-- one line per update; created empty -->
```

A ready-to-fill skeleton ships at `<qa-root>/_templates/strategy.md`. The structure
above remains the contract — if the template and this skill ever disagree, this skill wins.

---

## Step 2 — Test plan artifact (`<qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md`)

### 2.0 Sizing — before anything else is written (CONTRACTS §27)

Size the change first; the rest of the plan covers only what the sizing keeps. `## Sizing` goes
directly above `## 1. Coverage targets`:

```markdown
## Sizing

- change_class: trivial | standard | high-risk
- worth_testing: yes — <why> | no — <why>
- types: <the types this change needs> | —
- skipped: <type> — <why>; … | —
- estimate_tokens: <n>
- spawns: <n>
- deploy_impact: none | db | api | db, api
```

`trivial` = one type, no review before scripting; `high-risk` = money, auth, data loss or a
contract — it tests `security` or skips it with a reason. `worth_testing: no` is a valid outcome:
write the reason and design nothing. Every enabled type left out goes in `skipped` with its
reason. `node <qa-root>/scripts/shared/sizing.mjs estimate <slug> --class <c> --types <a,b> --reqs <n>`
prints `estimate_tokens` and `spawns`; it exits 3 when the estimate is over the profile's
`Token budget per run` — then STOP and ask the user, and record `over_budget: approved — <name> <date>`.

**Deploy impact (CONTRACTS §30).** Add `- deploy_impact: none | db | api | db, api` to the same
section. Take it from the dev handoff's `## Interfaces changed` and `## Risk areas` (endpoints
changed, MIG ids), the analysis endpoint inventory and the impact note. `db` also needs
`db_change`, `data_change` and `rollback`; a data change (backfill, transform, split-merge,
type-change, delete, import) also needs `backup` and `post_backup_writes`; `api` also needs
`api_change`. The keys, and the deploy-check cases each one makes `/qa-design` write, are in
[`deploy-change-cases.md`](../qa-phase-protocol/references/deploy-change-cases.md). A value the
handoff does not settle is a `Q-NNN`, never a guess. With an impact, put `integration` (and `api`
for a contract) in `types`.


### 2.1 Coverage targets per type

One row per enabled type, targets validated against §Quality gates (profile silent → contract
defaults):

```markdown
| Type | REQs in scope | Case coverage target | Sign-off gate (§Quality gates) |
|---|---|---|---|
| api | REQ-001, REQ-003, REQ-005 | 100% of in-scope REQs have ≥1 case | 0 failing P0/P1 |
| e2e | REQ-001–REQ-003 | 100% of P0/P1 journeys cased | 0 failing P0/P1 |
| performance | REQ-006 | every critical flow has a workload scenario | p95 & error-rate SLOs met (2.6) |
| security | REQ-003 | authz matrix 100% + Top-10-derived set | no unresolved High/Critical findings |
| unit | REQ-001, REQ-002 (logic-bearing) | every logic-bearing symbol behind a P0/P1 REQ has ≥1 case | 0 failing; branch ≥ 80% / line ≥ 90% on impacted modules (§Unit testing) |
| accessibility | REQ-001, REQ-003 (UI screens) | every in-scope screen state has an axe case; every interactive screen a keyboard case | 0 unresolved Critical/High findings (WCAG 2.2 AA) |
| mobile | REQ-001 (app journey) | every P0 journey on both platforms + the device-reality floor | 0 failing P0/P1 on gate-tier devices; 0 crashes/ANRs |
```

### 2.2 Schedule of phases

Map the remaining pipeline onto dated (or sprint-relative) rows:

```markdown
| Phase | Command | Owner | Window | Deliverable |
|---|---|---|---|---|
| Case design | /qa-design | case-designer | <dates> | <qa-root>/cases/<type>/<module>/TC-… files + traceability rows |
| Scripting | /qa-script | automation-engineer; nonfunctional-engineer (perf/security); unit-test-engineer (unit → HANDOFF.md); mobile-test-engineer (mobile → HANDOFF.md) | <dates> | <qa-root>/scripts mirrors of every case; Scripted ✅ |
| Execution | /qa-run | qa-reporter (all types) | <dates> | <qa-root>/runs/<type>/<slug>/<run-id>/ + table results |
| Exploratory | /qa-explore | test-planner (charters) + human tester | <dates> | <qa-root>/exploratory/<slug>/XS-… sheets, debriefed |
| Reporting | /qa-report | qa-reporter | <dates> | <qa-root>/reports/<slug>/YYYY-MM-DD-report.md + gate verdicts |
| TMS publish (optional) | /qa-publish | qa-reporter | after design sign-off | @tms:<id> tags on published cases |
```

Omit the `/qa-publish` row when §Test management is `none`.

### 2.3 Traceability skeleton — copy EXACTLY, leave EMPTY

```markdown
## Traceability (Requirement ↔ Case)

| Req | Case ID | Type | Module | Priority | Scripted | Last run | Status | Report |
|-----|---------|------|--------|----------|----------|----------|--------|--------|
```

Directly beneath it, include this ownership note so later skills follow the contract:

> Rows are appended by `designing-*` skills (one per case, `Scripted` ❌). `generating-*`
> skills flip `Scripted` to ✅. `executing-tests` fills `Last run`, `Status`
> (✅ pass / ❌ fail / ⛔ blocked) and `Report` (path under `<qa-root>/runs/…`). `/qa-report`,
> `/qa-status`, and every quality gate read ONLY this table. Never delete or renumber rows.

Do not pre-fill rows, even "obvious" ones — an empty skeleton is the contract. The one exception
is the re-verify import of Step 3.8 (baseline cases of OTHER slugs, never this slug's own REQs).

### 2.4 Roles

```markdown
| Role (agent) | Responsibility in this plan |
|---|---|
| qa-orchestrator | Entry point; delegates every phase; never executes skills itself |
| doc-analyst | Owns the analysis; re-runs /qa-analyze on requirement changes |
| test-planner | Owns this plan + strategy; sole editor of plan sections (not traceability results) |
| case-designer | Designs e2e/api/integration/accessibility cases; appends traceability rows |
| automation-engineer | e2e/api/integration/accessibility scripts; heals e2e |
| nonfunctional-engineer | performance + security scripts + execution |
| unit-test-engineer | unit cases + generated tests staged in <qa-root>/scripts/unit/ + HANDOFF.md; /qa-unit-audit |
| mobile-test-engineer | mobile cases (both platforms, device reality) + WDIO specs staged in <qa-root>/scripts/mobile/ + HANDOFF.md |
| qa-reporter | Runs, reports, gate verdicts, defects (raise · verify · close · escapes), optional TMS publishing |
```

### 2.5 Entry/exit gates per pipeline phase

```markdown
| Phase | Entry gate | Exit gate |
|---|---|---|
| /qa-design | Plan approved; blocking questions = 0 | Every in-scope REQ has ≥1 traceability row per applicable type; all case files carry **Feature:**/**Plan:** headers and taxonomy-ordered tags |
| /qa-script | Cases exist; `<qa-root>/.env.<env>` prepared from <qa-root>/.env.example | Every designed case has a mirror script (path 1:1); Scripted ✅ across the table |
| /qa-run | Scripts ✅; target environment reachable | Every case has Last run + Status; failures triaged (defect vs script vs env) |
| /qa-report | Run results in the table | Report written; every §Quality gates verdict rendered pass/fail; sign-off decision recorded |
```

### 2.6 Per-type SLO / gate table (performance + security — mandatory when enabled)

```markdown
| Type | Scenario / surface | Metric | Target (SLO/gate) | Source |
|---|---|---|---|---|
| performance | GET /invoices?status=overdue (load) | p95 latency | < 2000 ms | Q-004 accepted default |
| performance | GET /invoices?status=overdue (load) | error rate | < 1% | §Quality gates |
| performance | POST /orders (load) | p95 latency | < 500 ms | analysis REQ-006 |
| security | authz matrix (roles × invoice actions) | unauthorized access | 0 successes (403 enforced) | REQ-003 |
| security | ZAP baseline vs ZAP_TARGET_URL | High/Critical alerts | 0 unresolved | §Quality gates |
```

Every number traces to the analysis, an accepted question default, or §Quality gates — an
untraceable SLO is a planning defect. `/qa-report` renders each row pass/fail.

Plan skeleton (fixed section order):

```markdown
# Test Plan — <slug> — YYYY-MM-DD
**Change type:** … **Analysis:** <qa-root>/analysis/<slug>/… **Strategy:** <qa-root>/plans/<slug>/YYYY-MM-DD-strategy.md **Shipped SHA:** <sha | —>
<!-- Shipped SHA = the commit the dev handoff packet names, as the analysis cites it; `—` when
     there is no packet. reporting-results copies it into the report front matter (CONTRACTS §16)
     so the report names the commit it judged and the `Re-verify set` gate can check runs at or
     after it. The dev bundle's G10 compares the report's `date` with the shipped SHA's G8 run. -->

## 1. Coverage targets
## 2. Schedule of phases
## 3. Roles
## 4. Phase entry/exit gates
## Performance SLOs                           <!-- exact heading — designing-performance-scenarios and reporting-results STOP without it; "Not applicable" only if performance disabled -->
## Quality gates                              <!-- exact heading — reporting-results reads it; targets from §Quality gates -->
## Traceability (Requirement ↔ Case)          <!-- exact heading; empty skeleton + ownership note -->
## AC coverage                                <!-- one row per analysis AC: | AC | REQ | Case IDs | Status | — §4 -->
## Test environment                           <!-- per type: env, data source, tooling; what is not available there -->
## Suspension & resumption                    <!-- when execution stops, what restarts it -->
## Risk register                              <!-- link to analysis §6 + project risks with owner/mitigation -->
## Approvals                                  <!-- | Role | Name | Decision | Date | — filled when the user approves -->
## Change log
```

### 2.7 AC coverage, environment, suspension, risks, approvals (CONTRACTS §4)

- **`## AC coverage`** — copy every AC of the analysis `### AC register (AC ↔ REQ)` as a row
  `| AC-NNN | REQ-NNN | — | not covered |`. Designers fill `Case IDs` and set `covered`/`partial`; an AC
  QA will not test this release is `deferred (<reason>)`, never deleted. This table sits beside the
  §3 traceability table — it never adds columns to it.
- **`## Test environment`** — per enabled type, the §Environments target, the data source
  (`<qa-root>/docs/test-data.md` pools/factories), and what that environment cannot do.
- **`## Suspension & resumption`** — default: suspend a type when `/qa-env` says NOT READY, a P0
  smoke case fails, or > 20% of a run is ⛔; resume after a green `/qa-env` and a smoke re-run.
- **`## Risk register`** — link the analysis §6 table; add project risks (schedule, environment,
  skills) with owner and mitigation.
- **`## Approvals`** — `| Role | Name | Decision | Date |`; write the user's approval as a row
  when they give it. `qa:lint` requires these sections filled (and the §1–§4 / Quality gates tables
  non-empty) as soon as the traceability table has a row.

A ready-to-fill skeleton ships at `<qa-root>/_templates/test-plan.md`. The structure
above remains the contract — if the template and this skill ever disagree, this skill wins.

---

## Step 3 — Update rules (`update_existing` / `add_feature` on an existing plan)

Append, never rewrite history:

1. **Never renumber or reuse REQ or TC ids.** New scope continues existing sequences.
2. **Edit the existing files in place** — same filenames, so `**Plan:**` links in existing case
   files stay valid. Add a dated entry to each file's `## Change log` describing what changed
   and which analysis drove it.
3. **Traceability rows are permanent.** Removed REQs keep their rows; their cases are retired by
   the designer with `@deprecated:<slug>` + Status `⊘ deprecated` (CONTRACTS §3) — never ⛔, which
   means "could not run" and is re-triaged every run. Record `deprecated per <analysis file>` in the
   Change log. New REQs get rows only when `/qa-design` appends them — not now.
4. **Scope sections grow by appending** new REQ ids/modules under the affected type; changed
   REQs get their scope lines edited with a `(rev: <date>)` marker.
5. **Targets may tighten, gates never silently loosen.** Loosening any §Quality gates-derived
   value requires an explicit user decision recorded in the Change log.
6. Re-verify coverage targets against the analysis delta: every New/Changed REQ lands in some
   enabled type's scope-in list or is explicitly placed out of scope with a reason.
7. **Regression floor from the impact map.** For each impacted module, the TC ids in
   `<qa-root>/docs/impact-map.md` rows (and `## 3. Existing cases to re-verify` of the latest impact note,
   when `/qa-impact` ran) appear in that module's regression emphasis in `## 1. Coverage targets`;
   a listed TC that no longer exists is reported, never dropped silently.
8. **Re-verify rows (new slug on existing modules — CONTRACTS §3).** For every case in the impact
   note's `## 3. Existing cases to re-verify` whose `**Feature:**` is ANOTHER slug and which is not
   `@deprecated:`, append `| re-verify:<owning-slug> | <Case ID> | <type> | <module> | <priority> |
   <Scripted as in the owner's row> | — | — | — |` (dedupe by Case ID; never this slug's own cases).
   They make `/qa-run` execute the baseline under this slug and `/qa-report` gate on it (`Re-verify
   set`). A brownfield slug with no impact note → STOP: `/qa-impact <slug>` first.

---

## Step 4 — Supporting-files check (report, don't silently fix)

- `<qa-root>/docs/tag-taxonomy.md` — must exist (ships with the bundle workspace). If missing, create
  it with exactly the ordered scheme
  `@<type> @<module> @P0|@P1|@P2|@P3 [@smoke] [@regression] [@manual] [@req:<id>] [@tms:<id>] [@defect:<id>] [@quarantined:<until>] @agentic:gen`
  (`@tms:` only after a real work item exists via `/qa-publish` — never fabricated).
- `<qa-root>/.env.example` — confirm it carries every variable named in the strategies' environment
  needs; list any gaps for the workspace owner.

> **Project setup required:** the runner scripts referenced by the schedule — `test:e2e`,
> `test:api`, `test:integration`, `test:perf`, `test:security`, `test:unit`, `test:a11y`, `test:mobile`,
> `report:allure`, `heal:check` in `<qa-root>/package.json` (shipped; the project installs the toolchains) —
> must work before `/qa-run`. When `mobile` is planned, `§Mobile testing` must be filled (framework
> repo, platforms, device matrix, test dirs, convention) — flagged here, not discovered at design time. The plan
> references them by these exact names; flag any the project has not wired up. When `unit` is
> planned, `§Unit testing` must be filled (repo path, framework, test dirs, run command) — an
> empty section is flagged here, not discovered at design time.

> **Project setup required:** copy `<qa-root>/.env.example` to `.env.<env>` per target environment in
> §Environments and fill real values (credentials from the team's secret store — never
> committed) before `/qa-script` and `/qa-run`.

---

## Exit criteria (measurable — verify before handoff)

**All change types:**
- [ ] Both artifacts exist at `<qa-root>/plans/<slug>/YYYY-MM-DD-strategy.md` and `…-test-plan.md` (or were updated in place per Step 0).
- [ ] Every enabled+applicable type has a strategy section answering all six questions, and a coverage-target row.
- [ ] Every in-scope REQ from the analysis appears in exactly ≥1 type's scope-in list or is out-of-scope with a written reason. Zero unplaced REQs.
- [ ] `## Traceability (Requirement ↔ Case)` exists with the exact 9-column header and ZERO data rows (create) / with all pre-existing rows intact (update).
- [ ] `## Performance SLOs` (when performance is enabled) and `## Quality gates` sections present with the exact headings; every target traceable to analysis / accepted default / §Quality gates.
- [ ] `## AC coverage` has one row per analysis AC (or says "No acceptance criteria supplied"); `## Test environment`, `## Suspension & resumption`, `## Risk register`, `## Approvals` present in the §4 order.
- [ ] All 4 pipeline phases have entry AND exit gates; every gate is checkable from the traceability table, the run tree, or §Quality gates — no "testing completed" vagueness.

**Per change type, additionally:**
- **`new_project`** — every enabled §Test types entry is planned or excluded-with-reason; environment plan names a concrete §Environments target per type; schedule covers design → report.
- **`update_existing`** — 100% of Changed/Removed REQs from the analysis delta re-placed in scope (or deprecated per Step 3.3); regression emphasis visible in coverage targets for impacted modules; Change log entries written; zero renumbered ids.
- **`add_feature`** — all new REQs placed; one re-verify row per impact-note §3 case owned by another slug (Step 3.8); integration REQs/risks between new and existing modules land in the integration (or api) scope; existing scope untouched except by appends; zero renumbered ids.

## Done checklist

- [ ] Entry criteria were verified BEFORE writing (analysis found, blocking questions = 0).
- [ ] Supporting-files check reported (taxonomy, env vars, runner scripts).
- [ ] Chat summary given: types planned, per-type case-coverage targets, phase windows, any `> Project setup required` gaps.
- [ ] Plan approval requested from the user — `/qa-design` must not start on an unapproved plan; the approval is recorded as a `## Approvals` row.
- [ ] Handoff offered: "Strategy and plan ready under `<qa-root>/plans/<slug>/`. Run `/qa-design` (all enabled types, or `--type unit|api|integration|e2e|security|performance|accessibility|mobile`) to design cases — on brownfield modules run `/qa-unit-audit <slug>` first."

Do NOT design cases, append traceability rows, or write scripts here — that is `/qa-design`
and `/qa-script` territory.
