---
name: executing-tests
description: Use to run scripted cases via the runners, write run evidence, triage every failure (FUNCTIONAL/SCRIPT/SETUP-ENV/FLAKY) (/qa-run).
version: 1.2.0
---

# Executing Tests

> Profile first, by section (`profile.mjs`): it defines `§Project`, `§Application under test`,
> `§Test types`, `§Environments`, `§Quality gates`, `§Domain knowledge`, and `§Test management`.
> The QA root defaults to `<qa-root>/` (profile-overridable).

## Prime directive — NEVER auto-fix
This skill runs tests and reports what happened. It does **not** edit test scripts, test cases,
application code, or the traceability table's design columns to make a run pass. Script failures are
routed to `/qa-heal`; application defects are routed to the dev team; both are *reported*, never silently
patched. The only columns it writes are the run columns (`Last run`, `Status`, `Report`).

## Action
Execute the scripted tests for one feature slug, for the requested `--type` (default: every ENABLED type
in `§Test types`), against `--env` (default `uat`). Write run artifacts under
`<qa-root>/runs/<type>/<slug>/<run-id>/` and update the plan's `## Traceability (Requirement ↔ Case)` run
columns. Then hand off to `reporting-results` (`/qa-report`) for the consolidated report.

## Inputs — resolve before running (STOP conditions)
1. `<slug>` — the feature slug (argument; else most recent under `<qa-root>/plans/`; ask if ambiguous).
2. **Plan + traceability**: `<qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md` with the traceability table. Missing → STOP: run `/qa-plan`/`/qa-design`.
3. **Scripts exist** for the requested type(s): rows with `Scripted` ✅ in the table AND the mirrored files
   under `<qa-root>/scripts/<type>/`. None scripted → STOP: run `/qa-script --type <type>` first.
4. **Env file**: `<qa-root>/.env.<env>` exists and is filled (not placeholders). Missing → copy `<qa-root>/.env.example`
   → `<qa-root>/.env.<env>` and STOP asking the user to fill it. Never run against unfilled credentials.
   **Exception — `unit`**: hermetic, needs no `.env` and ignores `--env`; it needs `§Unit testing`
   (repo path present, run command, coverage command → report + format). Unconfigured → STOP for
   that type with `> **Project setup required:** fill PROJECT-PROFILE §Unit testing`.
5. **Type-specific authorization**: `security` and `performance` runs check `§Environments` — if the env's
   authorization column for that type is `no`, STOP and report; never generate load / scan an unauthorized env.

## Step 0: Prove which system the run will judge (CONTRACTS §31.1)
A verdict is about the system the run reached, not the one the plan assumed. Before any runner, for
each run folder about to be created (not for `unit`, which runs a local checkout — its
`repo-state.txt` is its identity):

```bash
npm run qa:target -- --env <env> --plan <slug> --out runs/<type>/<slug>/<run-id>
```

| Verdict | Do |
|---|---|
| `NOT_DEPLOYED` (exit 1) | **STOP — run nothing.** Write `summary.md` with `identity: NOT_DEPLOYED` and the mismatched component lines, mark the selected rows ⛔ with `NOT_DEPLOYED <component> <observed> ≠ <expected>`, and tell the user which deploy is missing. Re-running tests against the wrong build produces verdicts about the wrong build. |
| `UNVERIFIED` (exit 2) | Run, and put `identity: UNVERIFIED — <reason>` as the first line of `summary.md`. Nothing declared → also report a `TESTABILITY-GAP`: the system cannot say what it is (CONTRACTS §31.1). |
| `MATCH` / `UNPINNED` (exit 0) | Run. `summary.md` carries `identity: <verdict>` and each component's observed identity. |

If the build changes during a long run (a deploy lands mid-run), re-probe at the end: a different
`code` identity makes the run's results describe two systems — say so in the summary and re-run.

## Step 1: Locate the cases to run — by content, never by filename
Read the plan's traceability table; the run set = rows for the requested type(s) with `Scripted` ✅,
**including `re-verify:<baseline-slug>` rows and excluding `⊘ deprecated` ones** (CONTRACTS §3) —
re-verify results are written to THIS plan's row, never to the baseline plan.
Cross-check each against its script file (path mirrors the case path 1:1). A `Scripted ✅` row whose file
is missing is a defect — report it, don't skip silently. NEVER glob `<slug>.md`.

## Step 2: Run per type — via the <qa-root>/package.json runners only
Set the environment (`QA_ENV=<env>`, loading `<qa-root>/.env.<env>`), `QA_RUN_ID=<run-id>`, AND export the run's evidence dir —
`RUN_DIR=runs/<type>/<slug>/<run-id>` (relative to `<qa-root>/`) — before invoking the runner; the
Playwright config, k6 wrapper, and ZAP wrapper all route their artifacts into `RUN_DIR`. Then run
each enabled type with its exact runner name (contract; the project supplies the implementations):

| Type | Runner | Notes |
|---|---|---|
| e2e | `npm run test:e2e` | Playwright; traces/screenshots/HTML report land in `RUN_DIR` |
| api | `npm run test:api` | Playwright API tier |
| integration | `npm run test:integration` | Playwright API + DB assertions (`DB_CONNECTION`) |
| performance | `npm run test:perf -- <script>`, then `npm run qa:perf -- <RUN_DIR> --case <Case ID> [--contract <dev openapi.yaml>]` | k6 (or Locust) via the env-loading wrapper; verdict = the thresholds held AND `perf-verdict.md` passed: every endpoint within the dev contract's `x-perf` budget, no regression against the case's baseline |
| security | `npm run test:security` | ZAP baseline (gated by the case's `.conf`) + Playwright authz specs |
| ui | `npm run test:ui` | Playwright `toHaveScreenshot` + layout checks (`shared/ui/`); projects `web-<target>` / `desktop-electron` from `PW_PLATFORMS`/`PW_PROJECTS` (§Platforms). A visual ❌ attaches `*-diff.png` — triage FUNCTIONAL (the screen changed) or SCRIPT (a missing mask); a missing baseline is ⛔ `SETUP/ENV` (baselines come from the CI job), never fixed by `--update-snapshots` here |
| accessibility | `npm run test:a11y` | Playwright + axe-core (WCAG 2.2 AA tags via `shared/a11y/axe.ts`); browser projects from `PW_PROJECTS` (§Platforms `web` targets); the specs' `axe-*.json` attachments become `findings.md` rows |
| mobile (Runner `maestro`) | `npm run test:mobile:maestro -- --platform <android\|ios> [--tags "smoke"] [--cases <ids>] [--device <id>]` | flows from `<qa-root>/scripts/mobile/` with `<qa-root>/scripts/shared/maestro/`, one invocation per platform; verdicts from `<platform>/junit.xml` (test name = Case ID — title); no report → ⛔ `SETUP/ENV`; `maestro` not on PATH or no booted device → ⛔ with the exact missing piece |
| mobile | `npm run test:mobile -- --repo <path> --cmd "<run command>" --platform <android\|ios> [--devices "<names>"] [--matrix full] [--instances <n>] [--tags "<suite tag>"] [--app <build>] [--env <name>]` | values verbatim from `§Mobile testing` — one invocation per enabled platform, sequentially (the ONLY commands this bundle may run inside the mobile framework repo — CONTRACTS §9.6 / §15); devices default to the gate tier; the wrapper copies Allure results + logs into the run dir |
| unit | `npm run test:unit -- --repo <path> --cmd "<run command>" --coverage-cmd "<cmd>" --report "<glob>" --format <cobertura\|lcov\|jacoco\|istanbul-json> [--filter "<module filter>"]` | values verbatim from `§Unit testing` (the ONLY commands this bundle may run inside an app repo — CONTRACTS §9.6); export `UNIT_MODULES=<comma modules>`, `UNIT_BRANCH_MIN`, `UNIT_LINE_MIN` so the wrapper writes `coverage-summary.md` against the thresholds |

**Mobile runnability comes from `<qa-root>/scripts/mobile/HANDOFF.md`** (CONTRACTS §15) with the same
rules as unit below; results map back to the Case ID in the spec's `describe` title. A platform whose
device/emulator or app build is missing → every mobile row for that platform `⛔ blocked — <exact
missing piece>`; the other platform still runs. Cases marked `real device required` are ⛔ on an
emulator-only profile, never ✅.

**Unit runnability comes from `<qa-root>/scripts/unit/HANDOFF.md`** (CONTRACTS §11): before running,
read each `Scripted ✅` unit case's row — `proposed` → do not run it; its Status becomes
`⛔ blocked — awaiting handoff (HANDOFF proposed since <date>)`. `applied`/`merged` → run; map
results to the Case ID by the marker in the test container name (`TC-UNIT-…`). If a row is
`applied` and its Target path exists at `HEAD` of the `§Unit testing` default branch, promote the
row to `merged` with today's date — the only HANDOFF write this skill makes. A `merged` row whose
target file is gone is a finding (report it; Status ⛔ with the reason).

Scope the run to the slug's scripts (pass the module/path filter the runner supports). Capture stdout,
exit code, and each type's native artifacts.

**Playwright tiers (e2e · api · integration · security specs · accessibility · ui)** — what the kit
needs from the run (`<qa-root>/scripts/shared/README.md`):

| Set / pass | Why |
|---|---|
| `QA_RUN_ID=<run-id>` (the same `YYYY-MM-DD-HHmm` as the run dir) | every entity a test creates is named `qa-<QA_RUN_ID>-w<worker>-…` (`uniqueName`), so runs never collide and leftovers are sweepable by prefix; CI uses the pipeline id (+ shard) |
| nothing — the `setup` project runs first by dependency | it validates `<qa-root>/.env.<env>` (missing keys, an account pool smaller than workers × `TEST_POOL_PER_WORKER`) and signs every actor in once per `AUTH_MODE`. A failure there is `SETUP/ENV` for the whole run — report the setup error verbatim, mark the run's cases ⛔, do not triage each case |
| `PW_BLOB=1` only when sharding (`--shard=i/n`) | each shard writes a blob report into its `RUN_DIR`; merge them with `npx playwright merge-reports --reporter html,junit <dir-of-blobs>` into the run dir before Step 3 (CI does the same — `<qa-root>/ci/README.md`) |
| `--only-changed=<base ref>` (optional) | a pre-merge run of just the specs changed since `<base ref>` or importing a changed file; the run set is still rows with `Scripted` ✅ — record the narrowing in `summary.md` |
| `--last-failed` (optional) | re-run only the previous run's failures (e.g. after an env fix); a new run-id and run dir, never an overwrite |
| `QA_KEEP_ON_FAIL=1` (optional, local) | keep a failed test's data for diagnosis; the run's `summary.md` says so |
| `PW_WORKERS=<n>` / `PW_PROJECTS=…` / `PW_PLATFORMS=…` | from §Platforms (CONTRACTS §20): projects `web-<target>`, `desktop-electron`, `api`; platforms on other runners (android, ios, appium-desktop, other:*) are listed in `summary.md` as handoff with their command, never dropped; the pool must hold workers × per-worker accounts |

Flakiness is never retried away: the config sets `retries: 0` and `failOnFlakyTests` in CI; the
FLAKY re-run below is this skill's own, once, recorded.

> **Project setup required:** the `<qa-root>/package.json` scripts must be implemented for the enabled types
> (Playwright installed; `k6` binary for performance; Docker for the ZAP security scan). A missing runner
> is reported as a setup gap, not a test failure.

## Step 3: Write run artifacts
Create `<qa-root>/runs/<type>/<slug>/<run-id>/` (`<run-id>` = `YYYY-MM-DD-HHmm`) and store:
- `summary.md` — `identity: <verdict>` first (Step 0), then per-case verdict list + counts (pass/fail/blocked) + env + duration.
- `target.json` — written by Step 0: which system the run judged (CONTRACTS §31.1).
- `delta.md` — `npm run qa:delta -- <RUN_DIR>` once the results exist: each case against the previous
  run (NEW-FAIL · STILL-FAILING · FLAKY · FIXED · NEW · GONE) and what changed in the system between
  them (§31.6). Read it before triage: a NEW-FAIL on an unchanged system points at the test, its data
  or the environment first; a FIXED on an unchanged system is not a fix.
- Native artifacts: Playwright traces/screenshots (on failure), k6 `summary.json`, ZAP `zap-report.html`/`.json`, authz spec output.
- `failures.md` — the failure-detail contract (Step 4) for every non-pass.
- Security runs additionally: `findings.md` — the 7-column findings table (`ID | Severity | Source |
  Evidence | Affected REQ | Case | Status`) that `generating-security-script` specifies and
  `reporting-results` Step 5 consumes.
- Accessibility runs additionally: `findings.md` — the same 7 columns, ids `A11Y-F-NNN` (sequential per
  run), one row per axe violation × case built from the specs' `axe-<label>.json` attachments
  (`Severity` = impact map critical→Critical · serious→High · moderate→Medium · minor→Low, `Source` =
  `axe <rule> (WCAG <sc>)`, `Status` = `open`). Violations below the fail impacts are rows too — reported, never hidden.
- Every Playwright run: `junit.xml` + `results.json` (durations feed the regression time budget) — for a sharded run, the merged ones; the HTML report carries each test's `case` / `req` annotations from `caseMeta()`, which map results back to Case IDs.
- Mobile runs additionally: `mobile-output.log`, `repo-state.txt`, `allure-results/`, `logs/` (copied
  by the wrapper) and `device-matrix.md` — the byte-exact `| Device | Platform | OS | Type | Cases run |
  Pass | Fail | Notes |` table (one row per device the run used, from the Allure results' device
  labels; a device with no results → `not evaluable`; crash/ANR suspicions from the framework's
  afterTest attachments go in Notes).
- Unit runs additionally: `unit-output.log`, `repo-state.txt` (repo, HEAD sha, branch, dirty count),
  `coverage/` (the raw report copied from the repo) and `coverage-summary.md` — the byte-exact
  `| Module | Files | Line % | Branch % | Target | Verdict |` table produced by
  `<qa-root>/scripts/unit/coverage-summary.mjs` against the `§Unit testing` thresholds for the slug's
  modules; no report matched → the table says `not evaluable` (never omitted, never guessed).

## Step 4: Failure-detail contract — for EVERY non-pass
**Pre-triage first** (Playwright tiers): `npm run qa:triage -- <RUN_DIR>` writes `triage.md` — each
failure's file:line and step, failures grouped by cause, a suggested token with its reason, new vs
failing-since, matching defects. Read it instead of every trace: confirm ONE representative per group
on its evidence, apply the decision to the members, split out any member whose evidence differs. A
hint is never the classification; a `FLAKY` still needs the re-run below.
**Performance**: locate before filing — which endpoint, when, which resource — with
[`references/perf-triage.md`](references/perf-triage.md); its one-sentence verdict goes in `failures.md`.

Never a bare "failed". Each entry records:
1. **Case ID + spec path** and the failing **step**.
2. **Error** — the actual assertion/exception message, quoted.
3. **Artifact paths** — trace/screenshot/k6-summary/ZAP-report locations, and the `http-log` (API
   tiers) / `network` (browser tiers) attachment when the test made the failing call. When
   `triage.md` names them, add `server ids: request <id> · trace <id>` — the request id the server
   echoed and the trace id ApiClient's `traceparent` carried — so the defect opens the server's
   own logs and trace instead of asking for a repro.
4. **Suspected cause — classified** (canonical vocabulary — `/qa-report` and `/qa-defect` match these
   tokens verbatim): `FUNCTIONAL` (product behaved wrong) · `SCRIPT` (script/locator/assertion wrong) ·
   `SETUP/ENV` (missing/stale fixture or data, service down, auth, config) · `FLAKY` (identical
   immediate re-run passed — rule below).
5. **Attribution — for `FUNCTIONAL` only** (CONTRACTS §31.4). The product is blamed last, after the
   harness is ruled out, on one line:
   `- attribution: precondition <held at the failing assertion: evidence> · control <evidence | n/a — why> · repro <evidence>`.
   *precondition*: re-read the state the case needs at the moment of the assertion — setup undone
   between arrange and assert, or a state the account could never reach, is `SETUP/ENV`. *control*:
   the same check with the state inverted must give the other answer — if both give the same result,
   the check is not measuring what it claims (`SCRIPT`). *repro*: the failure outside the harness (a
   request, a manual step, a minimal sequence). Several cases of one family failing the same way →
   diff them against the family's passing cases first; the shared fixture is the first suspect.
   A read that could not complete is `UNKNOWN`, never a product value (§31.2) — `SCRIPT` or `SETUP/ENV`.
   `qa:lint` rejects a FUNCTIONAL entry without the three keys.
6. **Next step** — `FUNCTIONAL` → `/qa-defect` (don't touch the test); `SCRIPT` → `/qa-heal` (e2e) or
   `/qa-script` regen; `SETUP/ENV` → the named setup fix (or `/qa-env`), then re-run; `FLAKY` →
   `/qa-quarantine` decision by the user (tag + bounded ledger row, CONTRACTS §12 — never silently retry to green).

After writing `failures.md`, run `npm run qa:redact -- <RUN_DIR>` (CONTRACTS §25): a quoted error can
carry a token, a key or a password in a URL, and the run's text evidence is committed.

**FLAKY determination**: a failed e2e/api/integration case is re-run ONCE, immediately, unchanged.
Pass-on-retry → class `FLAKY`; `Status` stays ❌ and both attempts' artifacts are kept in the run dir.
A `FLAKY` entry adds one detail line, `flake-kind: timing | data | environment | order | time-sensitive |
visual | external`, chosen from the evidence (the trace, the assertion, what differed between the two
attempts) — `/qa-quarantine` copies it into the ledger's Reason and `/qa-retro` groups by it. The
four `§5` tokens stay the only classes; the kind is a detail, never a fifth class.
Fail-on-retry → classify from the evidence as `FUNCTIONAL` / `SCRIPT` / `SETUP/ENV`. Performance and
security runs are never auto-re-run. Unit failures follow the same re-run-once rule, but a unit test
that passes on retry is a `NON-DETERMINISTIC` defect of the test (hidden clock/random/order) — class
`FLAKY`, next step `/qa-unit-audit` + regen, never quarantine-and-forget.

**Bug-hunting triage hints** (CONTRACTS §5 tokens unchanged):
- **Server log** — a test failed by the `serverWatch` fixture ("the server logged errors during this
  test", attachment `server-log`) → `FUNCTIONAL`: quote the matched lines as the evidence, with the
  window and source the attachment names. The response the test saw may have been 200 — that is the
  bug. Under parallel workers one server line can land in several tests' windows: re-run the case alone
  (`--workers=1`) before raising, and raise once. Only an expected line the case provokes on purpose is
  allowed (`test.use({ allowedServerErrors })`), never one that hides a FUNCTIONAL failure. A
  `QA_SERVER_LOG_CMD failed` line → `SETUP/ENV`.
- **Fuzz** (`TC-API-FUZZ-*`) — each finding (5xx, undocumented status, schema mismatch, leak) →
  `FUNCTIONAL`, one defect per distinct operation × problem, the printed request and
  `QA_FUZZ_SEED=<n>` as steps to reproduce. A finding that is a spec error (the product is right, the
  OpenAPI is wrong) is still raised — contract drift is a defect of the document.
- **Crash / ANR** (Maestro: `<platform>/results.json` `crashes`, CONTRACTS §15) → `FUNCTIONAL`, never
  the FLAKY re-run: quote the `excerpt` and cite `device.log:<line>`. Attribute it to the flow whose
  window holds it (the JUnit timings); a crash no flow window holds is still one failure row, case
  `—`, and fails the run. The summary counts it as `crashes {c}`. `deviceLog: not captured — …`
  is noted in the summary, never read as "no crash".
- **Model** (`## Model` cases) — the printed minimal sequence is the reproduction; `FUNCTIONAL` when
  an invariant or postcondition broke; "did not reproduce on replay" → the FLAKY re-run rule.
Export `QA_SERVER_LOG` / `QA_SERVER_LOG_CMD` for every run whose environment exposes a log (the
profile's `§Environments` names it); unset, the watch prints one `serverWatch: off` line and the run
summary says `server log: not watched`.

**Unit triage hint**: the Expected of a generated unit test traces to a REQ/BR and the code
disagrees → `FUNCTIONAL` (`/qa-defect`, quote both); the Expected was an assumption or the subject
drifted since the case's sha → `SCRIPT` (`/qa-script --type unit` regen after the designer
re-verifies — unit tests are never healed); restore/compile/toolchain errors → `SETUP/ENV`.

## Step 5: Blocked triage
A case that cannot run (missing dependency, unmet precondition, known open defect) is `⛔ blocked` **with a
recorded reason** — never counted as pass or fail. Re-triage blocked cases every run; a case blocked for
>2 consecutive runs is escalated in the report (per `<qa-root>/docs/tag-taxonomy.md` BLOCKED triage).

## Step 6: Update the traceability run columns (the only write-back)
For each case run, update its row in `## Traceability (Requirement ↔ Case)`:
- `Last run` = `<run-id>`
- `Status` = ✅ pass · ❌ fail · ⛔ blocked
- `Report` = path to `<qa-root>/runs/<type>/<slug>/<run-id>/`

Performance rows: `Status` = ✅ only if all thresholds held and `perf-verdict.md` says PASS (`No
baseline` or `no budget` is reported in the summary, not a pass on its own). Security rows: `Status` = ❌ if any
finding at/above the `§Quality gates` severity threshold is unresolved. Unit rows: `Status` = ✅ when
every test carrying that Case ID passed; ❌ when any failed; `⛔ blocked — awaiting handoff` when
the HANDOFF row is `proposed` (coverage thresholds are a report-level gate, not a per-row status).
Mobile rows: `Status` = ✅ only when the case passed on EVERY gate-tier device of EVERY platform its
`## Platforms` names; ❌ when it failed anywhere (the device is named in `failures.md`); ⛔ when a
platform could not run. A pass-on-retry reported by the framework (Allure retries) is a `FLAKY` triage.
Touch no other column; never rename a Case ID; never flip `Scripted`.

## Step 6b: Quarantine, manual, and verification bookkeeping (report-only)
- **Quarantined cases run.** A case tagged `@quarantined:<until>` (unreleased row in
  `<qa-root>/regression/quarantine.md`) is executed like any other and its true `Status` written; the
  run `summary.md` lists it under `quarantined (excluded from gate)` with `until`. An expired
  quarantine (`until` < today, unreleased) is reported as `EXPIRED — release or extend` (lint fails on it).
- **Manual cases are not run** (`@manual` → no script); they never appear in the run set and are
  never marked ❌ for being manual. A human's verdict for a manual case is recorded by hand:
  `Last run` = the session id (`XS-…`) or run-id, `Status`, `Report` = the session sheet path.
- **Verification candidates.** For every case in this run whose `**Tags:**` carry `@defect:DEF-…`
  and whose defect file is `**Status:** OPEN`: Status ✅ this run → list it under
  `verifiable → /qa-defect <slug> --verify`; Status ❌ → `recurrence`. This skill writes NOTHING to
  defect files — `reporting-defects` owns the lifecycle.

## Run plans (`/qa-run --plan <name>`, CONTRACTS §19)
A run plan replaces Step 1's "one slug" with a saved selection across features and types; Steps
2–6 are unchanged and `run-plan.mjs` applies them mechanically. From `<qa-root>/`:

1. `npm run qa:plan:resolve -- <name>` — refreshes `## Resolved cases`; exit 1 = a selected case has
   no script (not `@manual`) → STOP, name the ids (`/qa-script` or exclude them). Show the counts.
2. `npm run qa:plan:run -- <name> --dry-run` — prints the Playwright invocation (`--grep` of the exact
   Case IDs, `--project setup api <browsers>`), each k6 script and each ZAP `.conf`. A security or
   performance selection on an env §Environments does not authorize is **refused** (exit 2): report
   it; never drop the type to make the run go.
3. `npm run qa:plan:run -- <name> [--env <env>] [--shard i/n] [--last-failed]` — one Playwright run
   for every Playwright tier, then k6 and ZAP (only in shard 1 when sharded). Sets `QA_ENV`,
   `QA_RUN_ID`, `RUN_DIR=runs/plans/<name>/<run-id>`; writes `summary.md` (plan, env, git SHA,
   counts per type, one row per case), `junit.xml`, `results.json`, `run.json`. Exit 1 on any ❌ or ⛔.
4. Write-back is Step 6 for every slug the cases belong to (own rows, and re-verify rows when the plan
   selected that feature), `Report` = `<qa-root>/runs/plans/<name>/<run-id>/`. The script does it; check
   the plans it names.
5. Then this skill's own work, as for any run: FLAKY re-run once (Step 4), `failures.md` with the
   5-field contract per non-pass, `findings.md` for security/accessibility, quarantine and
   verification bookkeeping (Step 6b). The script never triages.

Sharded locally: run each `--shard i/n` with `PW_BLOB=1 --run-dir runs/plans/<name>/<id>/shard-<i>`,
then `node scripts/shared/run-plan.mjs merge <name> --run-dir runs/plans/<name>/<id>`. CI runs the
same plan through the "run plan" job (`<qa-root>/ci/README.md`) and does not write back — `/qa-ingest`
imports it. `/qa-report` and `/qa-signoff` read a run-plan run like any other run folder.

## Step 7: Report ONLY this summary to chat
```
✓ Ran {types} for <slug> on <env> — run-id <YYYY-MM-DD-HHmm>
  e2e: {p} pass / {f} fail / {b} blocked | api: … | integration: … | security: … · findings C/H/M/L | accessibility: {p}/{f}/{b} · findings C/H/M/L | perf: {SLOs held? y/n} | unit: {p}/{f}/{b} · branch {x}% line {y}% ({verdict | not evaluable}) · awaiting handoff {n}
  mobile: {p}/{f}/{b} per platform · devices {n} (device-matrix.md) · crashes {c} · awaiting handoff {n}
  quarantined (excluded from gate): {ids → until} | expired: {ids} | manual (not run): {n}
  verifiable defects: {DEF ids → /qa-defect <slug> --verify} | recurrences: {DEF ids}
✗ Failures (see <qa-root>/runs/<type>/<slug>/<run-id>/failures.md): {case-id → suspected cause}, …
⛔ Blocked: {case-id → reason}, … (escalated: {ids blocked >2 runs})
✓ Updated traceability run columns in <qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md
Next: /qa-report <slug>   (never auto-fixing — FUNCTIONAL → /qa-defect; SCRIPT → /qa-heal)
```

## Done — ALL must be true
- [ ] Ran only `Scripted ✅` cases for the requested enabled type(s), scoped to the slug, on a filled `<qa-root>/.env.<env>`.
- [ ] Security/performance refused any environment not authorized for that type in `§Environments`.
- [ ] Unit: only the `§Unit testing` commands were executed, inside the declared repo; `proposed` HANDOFF rows were ⛔ (not run); `coverage-summary.md` written (or `not evaluable`).
- [ ] Mobile: only the `§Mobile testing` commands were executed, inside the framework repo, once per platform; `proposed` rows ⛔; `device-matrix.md` written; real-device-required cases never ✅ on an emulator.
- [ ] Run artifacts written under `<qa-root>/runs/<type>/<slug>/<run-id>/`; every non-pass has the full failure-detail contract with a classified cause.
- [ ] Blocked cases carry a reason and are re-triaged; >2-run blocks escalated.
- [ ] Traceability `Last run`/`Status`/`Report` updated; no other column touched; nothing auto-fixed.
- [ ] Quarantined cases ran with their true Status and were listed separately; manual cases untouched; verifiable defects named (no defect file written here).
- [ ] Security/accessibility runs wrote `findings.md` with the byte-exact columns; Playwright runs left `junit.xml`/`results.json` in the run dir.
- [ ] Only the Step 7 summary printed to chat.
