---
name: reporting-results
description: Use to write the feature report in the CONTRACTS §16 shape from traceability and run artifacts only (/qa-report).
version: 1.0.0
---

# Reporting Results

> Profile first, by section (`profile.mjs`): it defines `§Project`, `§Application under test`,
> `§Test types`, `§Environments`, `§Quality gates`, `§Domain knowledge`, and `§Test management`.
> The QA root defaults to `<qa-root>/` (profile-overridable).

## Prime directive — transcribe, never fabricate
Every number, verdict, and date in the report traces to a file: the plan's traceability table or a run
artifact under `<qa-root>/runs/`. If a value cannot be read from a file, it is reported as "not run yet" /
"not evaluable" — **never** guessed, and a not-evaluable gate never defaults to pass.

## Action
Produce `<qa-root>/reports/<slug>/YYYY-MM-DD-report.md` (and, when a template exists, an `.html` twin) for one
feature slug, summarizing designed vs scripted vs run coverage per type, quality-gate pass/fail, the
performance SLO table, security findings, and the trend since the previous report.

## Inputs — resolve before reporting (STOP conditions)
1. `<slug>` — the feature slug (argument; else most recent under `<qa-root>/plans/`; ask if ambiguous).
2. **Plan + traceability**: `<qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md` with the `## Traceability
   (Requirement ↔ Case)` table and `## Performance SLOs` / `## Quality gates` sections. Missing → STOP.
   Its header's `**Shipped SHA:**` (or `—`) becomes the report's `shipped_sha` (CONTRACTS §16).
3. **Run artifacts** referenced by the table's `Report` column — read each `summary.md`/`failures.md`,
   k6 `summary.json`, ZAP `zap-report.json`, security/accessibility `findings.md`, unit `coverage-summary.md`.
   A row with `Status` set but a missing `Report` dir is a data gap — note it, don't invent the result.
   The only non-run files this skill may consult: `<qa-root>/scripts/unit/HANDOFF.md` (unit Status per case),
   `<qa-root>/regression/quarantine.md` (unreleased rows), the case files' `**Tags:**` lines (`@manual`,
   `@quarantined:`, `@defect:`), the `@defect:` files' `**Status:**`/`**Resolution:**`, and
   `<qa-root>/exploratory/<slug>/XS-*.md` (session counts, `## Debrief` present = debriefed).
4. **Previous report** (optional): the most recent prior `<qa-root>/reports/<slug>/YYYY-MM-DD-report.md` for the trend section.

## Step 1: Read the single source of truth
Parse the traceability table into rows (`Req, Case ID, Type, Module, Priority, Scripted, Last run, Status,
Report`). This table — plus the run artifacts its `Report` cells point to — is the ONLY input. Do not
re-run tests, re-read cases for counts, or infer status from script presence.

## Step 2: Compute per-type coverage (designed → scripted → run)
For each ENABLED type in `§Test types`:
- **Designed** = rows of that type. **Scripted** = rows with `Scripted` ✅. **Run** = rows with a `Last run`.
- **Pass / Fail / Blocked** = rows by `Status` (✅ / ❌ / ⛔). `⊘ deprecated` rows are listed as
  deprecated and counted nowhere else; `re-verify:` rows are counted under the Re-verify set gate. **Manual** = rows whose case carries
  `@manual` (shown as its own column — never counted as "not automated"). **Quarantined** = rows
  whose case carries `@quarantined:` with an unreleased ledger row (shown with `until`; their ❌ is
  excluded from gate counts but never from the table).
- **Honest gaps**: a type enabled but with 0 rows → "enabled, no cases designed"; designed but 0 scripted →
  "designed, not automated"; scripted but 0 run → "automated, not run". State these plainly.
- **Platform × type matrix** (CONTRACTS §20) — under `## Coverage by type`, after the per-type table:
  `| Platform | <type> | … |`, one row per enabled §Platforms row that has cases (label + id, e.g.
  `Web (web)`), each cell `✅ n · ❌ n · ⛔ n · handoff n` from the cases' `**Platform:**` and the runs'
  `summary.md` matrices / Playwright project names (`web-*` → web, `desktop-electron` → windows|macos,
  `api` → api). A platform whose cases ran nowhere is printed `not run`, never left out.

## Step 3: Evaluate quality gates — vs §Quality gates
For each gate in `§Quality gates`, render one row of the byte-exact table
`| Gate | Target | Actual | Verdict | Evidence |` (CONTRACTS §16) — `Verdict ∈ pass | fail | not
evaluable`, `Evidence` = the traceability rows, ledger or run file that decided it, never empty:

| Gate | Source of actual |
|---|---|
| Functional (0 failing P0/P1) | count `Status ❌` rows with Priority P0/P1 across e2e/api/integration/accessibility/ui, EXCLUDING quarantined rows — printed as `0 failing (quarantined: n — <ids>)`; a quarantined P0/P1 never makes the gate silently green: the verdict line names it |
| Case coverage (every REQ ≥1 case per applicable type) | REQs in the plan with no row for an applicable type |
| Performance (p95/error SLOs) | k6 `summary.json` thresholds in the perf run dirs (Step 4) |
| Security (0 unresolved High/Critical) | findings at/above threshold in the security run dirs (Step 5) |
| Unit (0 failing; coverage ≥ §Unit testing thresholds on impacted modules; logic-bearing P0/P1 REQs have a TC-UNIT row; no `proposed` handoff > 2 runs) | unit rows' `Status`; `coverage-summary.md` of the latest unit run dir (Step 5b); the ⚠ notes under the traceability table; HANDOFF Status ages |
| Mobile (0 failing P0/P1 on every gate-tier device per platform; P0 journeys on both platforms; crash/ANR = 0; no `proposed` handoff > 2 runs) | mobile rows' `Status`; `device-matrix.md` of the latest mobile run dirs (Step 5d); `<qa-root>/scripts/mobile/HANDOFF.md` Status ages |
| Accessibility (0 unresolved Critical/High findings on in-scope screens; keyboard/manual cases executed) | `findings.md` of the latest accessibility run dirs (Step 5c); `@manual` accessibility rows' `Status` |
| Quarantine (no expired-unreleased rows; quarantined P0/P1 ≤ the §Quality gates budget) | `<qa-root>/regression/quarantine.md` vs today; priorities from the table |
| Exploratory (when §Quality gates sets it: ≥1 debriefed session per feature before sign-off) | `<qa-root>/exploratory/<slug>/XS-*.md` with `## Debrief` filled |
| Target identity (when `shipped_sha` ≠ `—` and the profile declares `### Target identity` — CONTRACTS §31.1) | each run's `target.json`: `pass` iff every run in `runs:` read `MATCH` against `shipped_sha`; any `NOT_DEPLOYED`, or a run that reached another commit → `fail`; a run with no `target.json`, `UNVERIFIED` or `UNPINNED` → `not evaluable`. `Actual` = `n/m runs on <sha>`; Evidence names the runs that decided it. `qa:lint` recomputes this row — never type it from memory. Without the declaration, add one `## Gaps & recommendations` line: nothing proves the runs reached the shipped commit |
| Re-verify set (only when the table has `re-verify:<baseline-slug>` rows — CONTRACTS §3/§16) | those rows only: `pass` iff every one is ✅ and its `Last run` belongs to a run at/after `shipped_sha` (the run's recorded app commit, or a run-id dated on/after the plan's `**Shipped SHA:**` entry); any ❌ → `fail`; unrun, ⛔ or older → `not evaluable`. `Actual` = `n/m green (baseline: <slugs>)`; Evidence names the rows. These rows are counted HERE, not in Functional or Case coverage, so a baseline regression is named as one |

**Appended rows (CONTRACTS §20 — rows only; the §16 headings, columns and vocabulary never change):**

| Gate | Source of actual |
|---|---|
| `Platform: <label>` — one row per `gate`-tier platform in §Platforms that has cases | P0/P1 cases whose `**Platform:**` names it: ❌ on that platform's gate targets → `fail`; all ✅ → `pass`; designed but not run there (or only `⛔ awaiting handoff` with nothing ingested) → `not evaluable`. Evidence = the run folders + project names |
| `UI (visual & layout)` — when `ui` rows exist | ui rows' `Status` on gate-tier projects; a visual ❌ cites the diff image in the run's `test-results/` (`*-diff.png`) — never resolved by regenerating baselines |

A gate whose inputs are missing → **`not evaluable`** (never `pass`). The overall verdict is `pass` only
if every applicable gate passes.

## Step 4: Performance SLO table
For each performance case with a run, read the k6 `summary.json` and render target vs actual:
`| Transaction | p95 target | p95 actual | error target | error actual | verdict |`. No perf run → a
plain "Performance: not run" note, not an empty table. Never fabricate latency numbers.

## Step 5: Security findings by severity
From the security run dirs — `findings.md` (the 7-column table written per the
`generating-security-script` contract) when present, else raw ZAP `zap-report.json` + authz spec
output — list findings: `| ID | Severity | Finding | Affected REQ | Case | Status |`, sorted
Critical→Low. No findings at/above the gate threshold → "No unresolved High/Critical findings."
Never invent or downgrade a finding.

## Step 5c: Accessibility findings by severity
From the accessibility run dirs' `findings.md` (same 7 columns, ids `A11Y-F-NNN`): list findings
Critical→Low with the WCAG SC and screen; state the conformance target from `§Accessibility`. No
accessibility run → "Accessibility: not run" (or "disabled"). Manual accessibility cases: list each
with its recorded verdict or `not executed`. Never downgrade an impact.

## Step 5d: Device matrix + mobile handoff backlog
When mobile rows exist: copy the latest mobile run's `device-matrix.md` table verbatim
(`| Device | Platform | OS | Type | Cases run | Pass | Fail | Notes |`) per platform, name crashes/ANRs
from Notes, and list `<qa-root>/scripts/mobile/HANDOFF.md` rows by Status (`proposed` with age in runs,
`FRAMEWORK-GAP` notes for the mobile developers). No mobile run → "Mobile: not run" (or
"disabled"); a platform not run → named as such, never averaged away.

## Step 5b: Unit coverage table + handoff backlog
When unit rows exist: copy the latest unit run's `coverage-summary.md` table verbatim
(`| Module | Files | Line % | Branch % | Target | Verdict |`), then list HANDOFF rows by Status
(`proposed` with age in runs, `applied`, `merged`, `rejected` with the Notes reason). No unit run →
"Unit coverage: not evaluable — run `/qa-run --type unit`"; never a number from anywhere else.

## Step 6: Failure digest
Group `Status ❌` rows by the suspected-cause class from their `failures.md` (`FUNCTIONAL` / `SCRIPT` /
`SETUP/ENV` / `FLAKY` — the canonical vocabulary written by `executing-tests`), each with case id,
one-line error, the linked defect (`@defect:` id + its file's `**Status:**`, or `—`; an OPEN defect whose
case passed in the latest run → `verifiable — /qa-defect --verify`), and the prescribed next step
(`/qa-defect` / `/qa-heal` / setup fix or `/qa-env` / `/qa-quarantine`). Quarantined ❌ rows appear in
the digest flagged `quarantined until <date>`. This tells the reader what to do, without this skill doing it.

## Step 7: Trend vs previous report
If a previous report exists, add a short delta: pass count Δ, newly-failing cases, newly-passing cases,
gates that flipped. No previous report → "First report — no trend."
Build the case-level part from the runs' `delta.md` (`qa:delta`, CONTRACTS §31.6), not from memory,
and carry its system-identity line: *what changed between the runs* — code, client, config, schema,
data — beside *what changed in the results*. A newly-failing case on an unchanged system is reported
as "suspect test/data/environment", and a newly-passing case on an unchanged system as "not a fix",
never as product movement.

## Step 7b: Deviations and residual risk (ISO/IEC/IEEE 29119-3 asks for both; the sign-off reuses them)
- **Deviations from plan** — types planned (plan `## 1. Coverage targets`) but never run; cases
  designed but never scripted (non-manual); any SLO or threshold that differs from the plan or the
  profile, with who said so and where (a profile line or an answered clarification). "None" is a
  valid answer; a guess is not.
- **Residual risk** — what remains unproven, in business terms (the sentence the sign-off's
  executive summary can quote): not-run P0/P1 journeys, open Critical/High defects, quarantined
  P0/P1 cases, `not evaluable` gates.

## Step 8: Write the report — the CONTRACTS §16 shape, byte-exact where it says so
Copy `<qa-root>/_templates/report.md`. Front matter: `slug`, `date`, `shipped_sha`
(plan header, else `—`), `runs: [<every run-id read>]`, `overall` **derived** from the Step 3
Verdict column (`fail` if any row fails, else `not evaluable` if any row is, else `pass`) — never
typed from judgement. Headings in order, each present even when its type is disabled or not run
(one line says so): **Executive summary** → **Coverage by type** (Step 2) → **Quality gates**
(Step 3) → **Performance SLOs** (Step 4) → **Security findings** (Step 5) → **Unit coverage &
handoff** (Step 5b) → **Accessibility findings** (Step 5c) → **Device matrix & mobile handoff**
(Step 5d) → **Quarantined & manual** → **Exploratory sessions** → **Failure digest** (Step 6) →
**Deviations from plan** (Step 7b) → **Residual risk** (Step 7b) → **Trend** (Step 7) → **Gaps &
recommendations**. Where a run folder carries `.verdict-run.json`, cite its `url` beside the run-id
so a reader can open the hub run. Overwrite same-day; never delete prior dates. Run
`npm run qa:lint` before reporting done — the dev bundle parses this file at its deploy gate.

**Optional HTML twin:** if `<qa-root>/docs/templates/report.html` exists, fill its `{{PLACEHOLDER}}`s and expand
its `<!-- REPEAT -->` rows, then write `<qa-root>/reports/<slug>/YYYY-MM-DD-report.html`. Fill only — never
restyle the template. No template → skip the HTML silently.

## Step 9: Report ONLY this summary to chat
```
✓ Wrote <qa-root>/reports/<slug>/YYYY-MM-DD-report.md{, .html}
Overall gate: {PASS | FAIL | NOT EVALUABLE}
By type — unit {p}/{f}/{b} (branch {x}% | n/e; handoff proposed {n}) · e2e {p}/{f}/{b} · api … · integration … · security {findings C/H} · accessibility {p}/{f} · findings C/H · perf {SLOs held? y/n/na}
Quarantined: {n} ({P0/P1 ids}) · manual: {n} · sessions: {n} ({m} debriefed) · verifiable defects: {DEF ids}
Gates: {gate: verdict}, … | Gaps: {honest list} | Trend: {Δ or "first report"}
```

## Done — ALL must be true
- [ ] Every figure traces to the traceability table or a `<qa-root>/runs/` artifact; nothing fabricated.
- [ ] Per-type coverage shows designed→scripted→run with honest gaps for enabled-but-empty types.
- [ ] Each `§Quality gates` gate has target/actual/verdict; missing inputs → `not evaluable`, never `pass`.
- [ ] Performance SLO table, security + accessibility findings and unit coverage come from the run artifacts; absent → plain "not run"/"not evaluable" note.
- [ ] Quarantined rows excluded from gate counts but listed with `until`; manual cases counted as manual; defect Status read from the defect files; sessions counted.
- [ ] Failure digest groups by suspected cause with the prescribed next step (no fixes applied here).
- [ ] Trend vs previous report when one exists.
- [ ] Report written to `<qa-root>/reports/<slug>/YYYY-MM-DD-report.md` in the §16 shape (front matter, headings, gate columns; `overall` derived) and `qa:lint` is clean (+ HTML only if the template exists); only the Step 9 summary printed.
