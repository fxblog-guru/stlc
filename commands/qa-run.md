---
description: Step 5 · execute scripts per type via the runners, record evidence, fill traceability; never auto-fixes.
argument-hint: <slug> [--type …|all] [--env <env>] [--changed <base>..<sha>] [--projects …] [--platform <id>,…] [--devices …] | --plan <name> [--env <env>] [--dry-run]
disable-model-invocation: true
---

Follow `qa-phase-protocol` (invoke the skill if it is not already in context); this file holds only what is specific to this command.

> Profile first, by section (`profile.mjs`): `§Test types`, `§Environments`, `§Project` (QA root).

Run the automation for feature `<slug>` (first token of `$ARGUMENTS`). This is step 5 of the
pipeline and executes the scripts produced by `/qa-script` via the `executing-tests` skill.

**`--platform`** sets `PW_PLATFORMS`; other runners are listed as handoff (CONTRACTS §20).

**`--plan <name>`** runs a saved run plan (`<qa-root>/run-plans/<name>.md`, CONTRACTS §19) instead of one
slug: `npm run qa:plan:run -- <name> [--env <env>] [--dry-run]`. Same preconditions for the env;
the plan decides the cases, types and browsers; evidence in `<qa-root>/runs/plans/<name>/<run-id>/`; run
columns written back to every slug touched. Procedure: `executing-tests` § Run plans. No plan yet →
`/qa-run-plan`.

## Preconditions (check before running anything)

- [ ] The plan's `## Traceability (Requirement ↔ Case)` table has `Scripted` ✅ rows for every
      requested type — if a requested type has none, STOP for that type and point to
      `/qa-script <slug> --type <type>`
- [ ] `<env>` resolves: `--env` value if given, else the default in §Environments; the env is one
      the profile lists
- [ ] `<qa-root>/.env.<env>` exists — if missing, copy `<qa-root>/.env.example` to `<qa-root>/.env.<env>`, then STOP
      and ask the user to fill in the values (`BASE_URL`, `API_BASE_URL`, `TEST_USER`,
      `TEST_PASSWORD`, plus `DB_CONNECTION` for integration, `PERF_TARGET_URL`/`PERF_VUS`/
      `PERF_DURATION` for performance, `ZAP_TARGET_URL` for security)
- [ ] The values needed by the requested types are not placeholders/empty — else STOP and ask
- [ ] `unit` needs NO `.env` and ignores `--env` (hermetic): it needs `§Unit testing` filled
      (repo path, run command, coverage command/report) and the repo path present. The env-file
      checks above do not block a unit-only run.
- [ ] `mobile` needs `§Mobile testing` filled and the framework repo present; the app build
      (`ANDROID_APP`/`IOS_APP` or the framework's environment config) and a device/emulator for the
      requested platform must exist — missing → ⛔ blocked for that platform with the exact missing
      piece, never a silent skip. Devices come from `--devices`/`--matrix` or the gate tier.

## Execution

**Run set** = the slug's own rows + its `re-verify:<baseline-slug>` rows (CONTRACTS §3), minus
`⊘ deprecated`. Re-verify rows run like any other and their run columns are written in THIS plan;
the baseline plan is not touched. `--changed <base>..<sha>` narrows the Playwright types to
`node scripts/shared/changed-modules.mjs --base <base> --head <sha>` → `--grep "<@module|…>"`, and
always keeps every re-verify row and every row never run; a spec-only change can use Playwright's
`--only-changed=<base>`. Print UNMAPPED paths.

`--type` defaults to `all` = every enabled type with ✅ Scripted rows. Run types **sequentially**
(never in parallel — concurrent load and security scans saturate a shared test environment).
Invoke the `executing-tests` skill per type from the `<qa-root>/` directory using EXACTLY these runner
names:

| Type | Runner |
|---|---|
| e2e | `npm run test:e2e` |
| api | `npm run test:api` |
| integration | `npm run test:integration` |
| performance | `npm run test:perf` |
| security | `npm run test:security` |
| unit | `npm run test:unit -- --repo <§Unit testing repo path> --cmd "<run command>" [--coverage-cmd "<cmd>" --report "<glob>" --format <fmt>] [--filter "<module filter>"]` — the ONLY commands the bundle may run inside an app repo (CONTRACTS §9.6) |
| accessibility | `npm run test:a11y` (Playwright + axe-core; `PW_PROJECTS` from `--projects`) |
| ui | `npm run test:ui` (baselines: the CI `ui-baselines` job) |
| mobile | per §Platforms Runner, once per platform: `maestro` → `npm run test:mobile:maestro -- --platform <android\|ios>` (from `<qa-root>/`); `appium-wdio` → `npm run test:mobile -- --repo <framework repo> --cmd "<run command>" --platform <android\|ios> […]`, the ONLY commands the bundle runs in that repo (CONTRACTS §9.6) |
| data | `npm run test:data -- --repo <path> --cmd "<run>" --mutate "<mutation>" --results <file>` per layer (§28) |

> **Project setup required:** `<qa-root>/package.json` ships these script names and their toolchains
> (Playwright browsers, k6, ZAP). A runner missing → STOP for that type and name the script.

**Run artifacts:** every execution writes to `<qa-root>/runs/<type>/<slug>/<run-id>/`
(`run-id = YYYY-MM-DD-HHmm`, start time): runner output, result JSON, traces, scan output — the
directory the traceability `Report` column and `/qa-report` point at. Unit runs add `unit-output.log`, `coverage/` (the raw report) and
`coverage-summary.md` (per-module line/branch % vs §Unit testing thresholds, CONTRACTS §11).

**Quarantine, manual, verification:** quarantined cases (`@quarantined:` + unreleased ledger row)
RUN and keep their true Status; the summary lists them under `quarantined (excluded from gate)` and
flags expired ones. `@manual` cases are never in the run set. Every OPEN defect whose case passed
this run is listed as `verifiable → /qa-defect <slug> --verify` — this command never writes a
defect file. Security and accessibility runs write `findings.md` (7 byte-exact columns).

**Mobile handoff status drives runnability** the same way (CONTRACTS §15): a case whose
`<qa-root>/scripts/mobile/HANDOFF.md` row is `proposed` is `⛔ blocked — awaiting handoff`; `applied`/`merged`
rows run. Mobile runs additionally write `device-matrix.md` (per-device verdicts) into the run folder.

**Unit handoff status drives runnability:** a case whose `<qa-root>/scripts/unit/HANDOFF.md` row is
`proposed` (staged, not yet in the repo) is `⛔ blocked — awaiting handoff`, never ❌; `applied`/
`merged` rows run and map results back by the Case ID marker in the test name. A target file found
on the default branch at HEAD promotes `applied` → `merged` (the run's only HANDOFF write).

## Traceability write-back (every run, pass or fail)

For each case executed: **Last run** = run-id · **Status** = `✅` / `❌` / `⛔ <reason>` (could not
execute at all — env down, missing data, dependency failed; never a bare ⛔) · **Report** = the run
directory. Nothing else (`executing-tests` Step 6).

## Failure detail (report everything — do NOT auto-fix)

Never modify test scripts, cases, or application code in response to a failure — surface the full
picture and stop. Every failure must be reported with ALL of:

1. **What failed** — Case ID + script `file:line` of the failing assertion/threshold
2. **Error** — the error message / failed SLO / finding, verbatim and untruncated
3. **Screenshot / trace path** — the artifact inside `<qa-root>/runs/<type>/<slug>/<run-id>/`, if any
4. **Suspected cause** — one of the canonical classes `FUNCTIONAL` · `SCRIPT` · `SETUP/ENV` ·
   `FLAKY`, with the evidence (these exact tokens — `/qa-report`, `/qa-defect` and `/qa-quarantine` match them)
5. **Next step** — one concrete action: raise the app defect, `/qa-heal <script>` for e2e
   locator drift, fix the named `.env` value, or supply the missing data; for unit: `/qa-defect`
   when the Expected traces to a REQ/BR and the code disagrees (FUNCTIONAL), `/qa-script --type
   unit` regen when the test itself is wrong (SCRIPT — unit tests are never healed), the named
   toolchain fix for compile/restore failures (SETUP/ENV)

## Done criteria

Report back per type: pass/fail/blocked counts, the run-id and run directory, every failure in
the 5-field format above, every ⛔ with its reason, quarantined cases (with `until`), verifiable
defects, and the traceability rows updated. Next step: `/qa-report <slug>` (then `/qa-defect <slug>`
for FUNCTIONAL failures and verifications, `/qa-quarantine` for a FLAKY case over budget).
