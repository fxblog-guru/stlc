---
name: designing-performance-scenarios
description: Use to design load, stress, spike and soak scenarios per key transaction, with ## Workload and ## SLOs (/qa-design --type performance).
version: 1.0.0
---

# Designing Performance Scenarios

> Profile first, by section (`profile.mjs`): it defines `§Project`, `§Application under test`,
> `§Test types`, `§Environments`, `§Quality gates`, `§Domain knowledge`, and `§Test management`.
> The QA root defaults to `<qa-root>/` (profile-overridable).


> **Domain grounding**: when `<qa-root>/wiki/compiled/index.md` exists, resolve every domain term,
> business rule (BR-###), and persona through it — open the index, follow the scoping link, read
> the atomic page WHOLE, cite the page + its `sources:` entry. Wiki silence is a reported gap,
> never a guess. No compiled wiki → the plain `§Domain knowledge` folder.

## Environment guardrail — read before designing anything

Performance load is generated **only against environments whose `§Environments` "Performance testing
authorized" column is `yes`** — never production, never a shared environment the profile marks `no`.
Every scenario records its target environment in `## Data`. A transaction whose only realistic target is
an unauthorized environment is not designed — it is flagged for a human with the reason.

## Action
Design performance scenarios for one feature slug — **one file per scenario** under
`<qa-root>/cases/performance/<module>/` — and append their rows to the plan's traceability table. This skill
designs scenarios only; `generating-perf-script` turns each into a k6 script (default; Locust
alternative per `§Test types`) whose `thresholds` come straight from the scenario's `## SLOs`, so a
breach fails the run automatically (`/qa-script --type performance`, run by `test:perf`).

## Inputs — resolve before designing (STOP conditions)
1. `<slug>` — the feature slug (argument; else the most recently dated folder under `<qa-root>/plans/`; ask if ambiguous).
2. **Analysis**: latest `<qa-root>/analysis/<slug>/YYYY-MM-DD-analysis.md` — requirements (`REQ-<id>`), endpoint
   inventory, and any stated volume/traffic/SLA notes. Missing → STOP: run `/qa-analyze` first.
3. **Plan**: latest `<qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md` with its `## Traceability (Requirement ↔ Case)`
   skeleton and its `## Performance SLOs` table. Missing → STOP: run `/qa-plan` first.
4. `performance` enabled in `§Test types` and the plan. Disabled → STOP and report.
5. An authorized load environment must exist in `§Environments`. None → STOP and report; do not design against `no` environments.

---

## Step 1: Pick the transactions worth measuring

**A dev contract first.** When the project has one (`.sdlc/api/<slug>/openapi.yaml` or
`dev/api/<slug>/openapi.yaml`, also named by the handoff packet's load scenarios), run
`node <sdlc root>/scripts/api-contract-check.mjs <slug> --load-plan --json` — read-only, never edit
the contract. Each traffic class is one load scenario: `target_rps` (= `rps × peak_factor`),
`concurrency`, and its operations with their `x-perf` budgets. Design from those, not from guesses;
a class whose operations you leave out is listed as not load-tested with the reason.

Not every endpoint gets a scenario. Select transactions that are (a) high-frequency, (b) business-critical,
(c) resource-heavy (reports, search, bulk), or (d) named with an SLA in the analysis/`§Domain knowledge`.
Each selected transaction maps to one or more endpoints from the analysis inventory. List the rest as
"not load-tested — reason" in the summary; silent omission is a coverage lie.

## Step 2: Choose the workload model — selection rubric

Design the scenarios each transaction needs. Default coverage for a critical transaction = **smoke +
load**; add stress/spike/soak when the signal below is present.

| Model | When to design it | Shape |
|---|---|---|
| **smoke** | always, first — proves the script + env work under trivial load | 1–2 VUs, ~1 min; SLOs must still hold |
| **load** | expected/peak normal traffic (from volume notes or a stated SLA) | ramp to target VUs, hold (steady state), ramp down |
| **stress** | find the breaking point / headroom above peak | step VUs up past expected peak until SLOs break; record the knee |
| **spike** | traffic bursts (sales, batch jobs, cron fan-in) | sudden jump to N× target, hold briefly, drop |
| **soak** | memory leaks / resource exhaustion over time | moderate VUs held for a long duration (30 min–hours) |

Ambiguous → design smoke + load; note why stress/spike/soak were deferred.

## Step 3: Set SLOs — from the plan/gates, never invented

Each scenario's SLOs come from, in order: the dev contract's `x-perf.p95_ms` per operation (Step 1) →
the plan's `## Performance SLOs` table → the analysis SLA notes → `§Quality gates` defaults (p95 latency, error rate < 1%). If none of these states a number for a
transaction, record `SLO-GAP: <transaction> — no target defined` in `## Data` and use the `§Quality gates`
default as a placeholder marked `(default — confirm)`. Never invent a latency number out of thin air.

Cite the source in `## Grounding` (`contract: <path> § <operationId> x-perf`). A plan number looser
than the contract's budget is a conflict to report, never a choice to make.

SLOs are expressed so `generating-perf-script` can drop them into k6 `thresholds` verbatim, one
per-endpoint threshold per budgeted operation, tagged with its `operationId` as `name` (so
`qa:perf` can match the run to the contract):
- `http_req_duration: p(95) < <ms>` (and p(99) where the plan sets one)
- `http_req_duration{name:<operationId>}: p(95) < <x-perf.p95_ms>`
- `http_req_failed: rate < <fraction>` (e.g. `0.01`)
- `http_reqs` / iteration rate ≥ `<throughput target>` where throughput is the point

## Step 4: Model the data & think-time

- **Data pool:** state what varies per iteration (user accounts, ids, search terms) and where it comes
  from — a CSV/JSON pool under `<qa-root>/scripts/performance/data/` (the script loads it via `SharedArray`).
  A load test that hammers one record measures cache, not the system.
- **Think-time / pacing:** realistic gaps between steps for user-journey scenarios (constant-arrival-rate
  vs closed VU model) — note which, so the generator picks the right k6 executor.
- **Auth:** how VUs authenticate (pre-provisioned tokens vs per-VU login) — per-VU login can dominate the
  measurement; prefer a token pool and say so.

## Step 5: Placement, naming, reconcile

- Path (contract — exact): `<qa-root>/cases/performance/<module>/TC-PERF-<MODULE>-<NNN>-<short-desc>.md` —
  `<module>` lower-kebab, `<MODULE>` UPPER, `<NNN>` sequential per module folder. **Case ID =
  `TC-PERF-<MODULE>-<NNN>`.** Not derivable → `resolving-test-placement`; never guess.
- **Feature linkage = the `**Feature:** <slug>` header, never the filename.** Consumers use the plan's
  traceability table or grep `**Feature:** <slug>` — NEVER glob `<slug>.md`.
- **Check-then-upsert:** identity = transaction + workload model + normalized title (never `<NNN>`); match
  → UPDATE in place (preserve filename/`<NNN>`/`@tms:`); no match → CREATE at next `<NNN>`; orphans flagged, not deleted.
  Report **created N · updated M · unchanged K · orphaned P**.

## Step 6: Write each scenario file (never print to chat)

Performance scenarios replace `## Steps` with `## Workload` + `## SLOs`:

```markdown
# TC-PERF-<MODULE>-<NNN> — [<Module>] <Transaction> — <Actor> <action> [<condition>] → <expected>
**Feature:** <slug>  **Plan:** <qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md
**Type:** performance  **Module:** <module>  **Priority:** P0–P3
**AC:** <AC-NNN, … from the analysis AC register | —>
**Tags:** @performance @<module> @P<n> [@req:<id>] @agentic:gen

## Objective
<ONE sentence — the single intent this case proves; a second intent is a second case>

## Technique
- checklist                          <!-- the workload rubric; perf cases claim no axes -->

## Isolation
- creates: <one entity per iteration, run-unique keys>
- cleans: <purge by run id after the run>
- actor: pool `<perf pool>` (<n> accounts)
- lock: none

## Transaction
- <what the user/system does> → endpoint(s): GET /orders (from the analysis inventory)

## Workload
- Model: load                       <!-- smoke | load | stress | spike | soak -->
- Executor: ramping-vus             <!-- k6 executor hint per Step 4 -->
- Ramp: 0 → 50 VUs over 2m, hold 50 VUs for 5m, ramp 50 → 0 over 1m
- Target: PERF_TARGET_URL (from <qa-root>/.env.<env>); PERF_VUS / PERF_DURATION may override magnitude
- Data pool: <qa-root>/scripts/performance/data/<pool>.csv (accounts / ids varied per iteration)
- Auth: pre-provisioned token pool

## SLOs                              <!-- become k6 thresholds verbatim; a breach fails the run -->
- http_req_duration: p(95) < 800ms
- http_req_failed: rate < 0.01
- throughput: ≥ 30 req/s sustained

## Expected Result
- All SLO thresholds hold for the full steady-state window; no error-rate spike during ramp

## Data
<!-- Reusable data preconditions as [DATA:<entity>-<state>] tokens — resolved by managing-test-data -->
- Environment: <authorized env from §Environments — Performance testing authorized = yes>
- SLO source: <plan §Performance SLOs | analysis SLA | §Quality gates default>; SLO-GAPs: <list or "none">
```

**Title** (CONTRACTS §7 Title; lint-checked): `[<Module>]` = the module folder in Title Case · <Transaction> · the actor as a role (never "the user") + action + condition · `→` an observable outcome. No "Verify that"/"Ensure"/bare "successfully"/"works"; one outcome; ≤ 120 chars. Example: `TC-PERF-ORDERS-002 — [Orders] List orders — 50 users at peak for 10 min → p95 < 800 ms, errors < 1%`.

**Priority** (CONTRACTS §7 Priority): start from the REQ's priority (analysis §6 hint); P0 only for the main success path of a P0 REQ, an authz/security denial or data loss/money/irreversible state; main negatives and error contracts → P1; boundaries, alternative paths, rarer roles → P2; cosmetic/copy/rare edges → P3. Never above the REQ unless a denial or data-integrity case, with a one-line `Priority reason:` under the header. Header, `@P<n>` and the traceability Priority are one value.

**Grounding first** (CONTRACTS §7): before writing a case, open the sources it rests on (the wiki pages for its BRs, the impact note, the code citation) and list them under `## Grounding`; a source you did not open is not cited.

Skeleton: `<qa-root>/_templates/case-performance.md` (CONTRACTS §7). `## Objective` is one sentence; `## Technique` uses the §7
vocabulary and names the axes it buys (`npm run qa:score` counts them per REQ and fails a P0/P1 REQ
without negative — and, for api, authz and error-contract — coverage); `## Isolation` says what the case
creates, cleans and which pool actor it uses so cases run in parallel; `**AC:**` lists the AC ids it
proves (add the Case ID to the plan's `## AC coverage` row for each). Techniques:
[`test-design-techniques.md`](../qa-phase-protocol/references/test-design-techniques.md).

Priority: P0 = a transaction with a contractual SLA or release-blocking capacity risk, P1 = key
transactions, P2/P3 = secondary. Never load-test against a `no` environment (Step's guardrail).

### Tags — derived, never invented
Vocabulary at exact path `<qa-root>/docs/tag-taxonomy.md`. Fixed order:
`@performance @<module> @P0|@P1|@P2|@P3 [@req:<id>] [@tms:<id>] @agentic:gen` — `@tms:<id>` ONLY when a
real work-item id exists (post-publish, never fabricated from `<NNN>`); `@agentic:gen` always.

> **Project setup required:** `<qa-root>/docs/tag-taxonomy.md` must exist at that exact path; the `k6` binary
> (or Locust) must be installed for `/qa-run --type performance`; a data pool under
> `<qa-root>/scripts/performance/data/` is needed for any non-trivial scenario.

## Step 7: Append traceability rows to the plan

ONE row per Req ↔ Scenario in the plan's `## Traceability (Requirement ↔ Case)` table — exactly these columns:

| Req | Case ID | Type | Module | Priority | Scripted | Last run | Status | Report |
|---|---|---|---|---|---|---|---|---|
| REQ-009 | TC-PERF-ORDERS-001 | performance | orders | P1 | ❌ | — | — | — |

Designing appends with `Scripted` ❌ (`generating-perf-script` flips ✅; `executing-tests` fills the rest,
Status from whether the k6 thresholds held). Also confirm/complete the plan's `## Performance SLOs` table
for every transaction you scoped. On UPDATE, refresh rows — no duplicates.

### Escape backfill (CONTRACTS §13)
If `<qa-root>/defects/ESCAPES.md` has a row for this slug with `Backfill` = `pending` whose defect's
`### Backfill` names the subject / endpoint / screen this case covers, set that row's `Backfill` cell to
the new Case ID (comma-append when several) — the ledger is how `/qa-metrics` proves the hole closed.

## Step 8: Report ONLY this summary to chat

```
✓ Reconciled <qa-root>/cases/performance/: created {N} · updated {M} · unchanged {K} · orphaned {P}
  (smoke: {n} · load: {n} · stress: {n} · spike: {n} · soak: {n})
✓ Appended traceability rows + confirmed §Performance SLOs in <qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md
Transactions scoped: {list} | Not load-tested: {list + reason} | SLO-GAPs: {n}
Target environment: <authorized env> (Performance testing authorized = yes)
Next: /qa-script --type performance  (k6 scripts → <qa-root>/scripts/performance/<module>/, run by `test:perf`)
```

---

## Common pitfalls
1. One scenario per endpoint with no workload model — pick load/stress/spike/soak deliberately by the rubric.
2. Inventing SLO numbers — trace every threshold to the plan/analysis/gates or mark it SLO-GAP.
3. Hammering a single record — vary data via a pool, or you measure caching, not capacity.
4. Per-VU login dominating the timing — use a token pool and note it.
5. Designing against production or a `no` environment — flag instead.
6. Blind-appending on re-run, renumbering on update, or fabricating `@tms:` ids.

## Done — ALL must be true
- [ ] Transactions selected by frequency/criticality/cost/SLA; the rest listed as "not load-tested — reason".
- [ ] Each transaction has at least smoke + load; stress/spike/soak added where the rubric signals, deferrals noted.
- [ ] Every SLO traces to the dev contract's `x-perf` / the plan / analysis / `§Quality gates`; unstated ones marked SLO-GAP; none invented.
- [ ] With a dev contract: every traffic class from `--load-plan` is a scenario or listed as not load-tested, with the reason.
- [ ] Data pool, think-time/executor, and auth model stated so the generator can build a faithful k6 script.
- [ ] One file per scenario at `<qa-root>/cases/performance/<module>/TC-PERF-<MODULE>-<NNN>-<short-desc>.md` with
      `**Feature:**`/`**Plan:**` headers and `## Workload` + `## SLOs` sections.
- [ ] Target environment authorized in `§Environments`; no scenario targets a `no` env.
- [ ] Reconciled by identity; tags in fixed order; traceability rows appended (`Scripted` ❌); `## Performance SLOs` confirmed.
- [ ] Only the Step 8 summary printed to chat.
