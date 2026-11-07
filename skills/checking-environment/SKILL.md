---
name: checking-environment
description: Use before a session's first run or on SETUP/ENV triage: .env.<env>, URLs, DB, tooling and §Environments authorization per type (/qa-env).
version: 1.0.0
---

# Checking Environment

> Profile first, by section (`profile.mjs`) — `§Environments` (the env table + authorization
> columns), `§Application under test` (URLs), `§Test types` (which checks apply). QA root
> defaults to `<qa-root>/`.

## Prime directive — name the exact missing piece, expose no secret
A failed check states precisely what to fix (`PERF_TARGET_URL missing in <qa-root>/.env.uat`), never a
vague "env problem". Secret values are NEVER echoed into the report or chat — presence and
reachability only (`DB_CONNECTION: set, masked`).

## Action
Produce `<qa-root>/runs/env-checks/<env>/<run-id>/readiness.md` (`run-id` = `YYYY-MM-DD-HHmm`) with a
per-check PASS/FAIL table and a per-type "runnable?" verdict.

## Inputs — resolve before checking (STOP conditions)
1. `<env>` — argument; default the `§Environments` default env. Env not in the table → STOP.
2. `<qa-root>/.env.<env>` — missing → the report is one FAIL: "copy <qa-root>/.env.example and fill it"; still
   write the report.

## Step 1: Variable completeness — per enabled type
| Type | Required in `<qa-root>/.env.<env>` |
|---|---|
| e2e / api / integration | base URLs + credentials named by `<qa-root>/.env.example` |
| integration | `DB_CONNECTION` |
| performance | `PERF_TARGET_URL` |
| security | `ZAP_TARGET_URL` |
| accessibility | `BASE_URL` + credentials (as e2e); optional `A11Y_FAIL_ON` (default critical,serious), `PW_PROJECTS` names known projects |
| mobile (Runner `maestro`) | `MOBILE_ANDROID_APP_ID` / `MOBILE_IOS_APP_ID` per enabled platform; `TEST_USER`/`TEST_PASSWORD` (+ `_<ROLE>` per actor the flows sign in as); `API_BASE_URL` + `MOBILE_API_TOKEN` when a flow seeds data — presence only, never values |
| mobile | none in `<qa-root>/.env.<env>` (optional `MOBILE_*` overrides). Instead check `§Mobile testing` completeness: framework repo path exists and is a git checkout with `package.json` + the declared test dirs, platforms listed, run commands declared, device matrix has ≥1 gate-tier device per platform, Write mode ∈ propose/apply; the framework's own `.env` exists (presence only) |
| unit | none — hermetic. Instead check `§Unit testing` completeness per layer: repo path exists and is a git checkout, declared test dir(s) exist, run command + coverage command/report/format declared, test-file convention stated, Write mode ∈ propose/apply |

Check set/empty only. Disabled types → their variables are `skipped (type disabled)`.

## Step 2: Reachability — cheap, read-only probes
- **Web UI / API base URLs**: HTTP GET/HEAD (short timeout); any HTTP response = reachable —
  4xx/5xx is noted, not auto-failed (auth walls answer 401). No response/DNS/timeout → FAIL.
- **DB** (integration enabled): probe via the project's own tooling in this order — a
  `<qa-root>/package.json` script named `env:check` if one exists, else a minimal read-only connectivity
  probe with the driver already in `<qa-root>/node_modules`. No driver available → `not probed
  (no tooling)` — an honest gap, NOT a pass.
- Never send writes, logins with real credentials, or scans — this is a reachability check, not a test.

## Step 2b: Identity — can this environment say what it is? (CONTRACTS §31.1)
Reachable is not enough: a run must be able to prove *which* system it reached. Run
`npm run qa:target -- --env <env> --out runs/env-checks/<env>/<run-id>` (no `--plan`: this records,
it does not pin) and add one row per component — `Identity: <component> [<kind>]` → PASS (read),
FAIL (`UNREAD` — quote the reason). Then judge the declaration itself, the way a principal tester
would for *this* system's shape, not a checklist:
- **Nothing declared** → one FAIL row, `Identity: none declared`, fix: add `### Target identity` under
  §Environments. If the system exposes no identity at all (no version endpoint, header, build-info
  file, image digest), the fix is a `TESTABILITY-GAP` for the developers, quoted in the report.
- **Declared, but a kind that can change silently is missing** — the components a user's result
  depends on: a separately deployed web bundle or mobile build (`client`), a flag service or tenant
  configuration (`config`), migrations (`schema`), a seeded dataset the cases rely on (`data`), each
  service a cross-service case touches (`code`). Name the missing one as a WARN row with the probe to
  add; do not invent a probe the system cannot answer.
Identity never decides `READY`/`NOT READY` here — that is the run's Step 0, against the plan's commit.

## Step 3: Authorization guard — §Environments columns
For security and performance: read the env's authorization columns. `no` → that type is
`BLOCKED (not authorized on <env>)` regardless of variables — and the report says which env IS
authorized. This mirrors the hard guard inside the run/script skills. Unit has no environment
authorization axis (it never touches an environment) — report `n/a`. Mobile targets the app build's
backend env (`MOBILE_TEST_ENV` / the framework's `TEST_ENV`) — report which env the build points at.

## Step 4: Tooling presence — per enabled type
`node`+Playwright install (e2e/api/integration/accessibility — browsers for every project named in `PW_PROJECTS`; `@axe-core/playwright` present in `<qa-root>/node_modules` for accessibility), `k6` binary (performance), Docker (security ZAP), for mobile on Maestro: `maestro --version` + `adb devices` / `xcrun simctl list devices booted` showing a booted device (more than one booted and no `--device` → NOT READY: name the ids and ask which), and the app id installed (`adb shell pm list packages <id>` / `xcrun simctl get_app_container booted <id>`), `adb logcat -d -t 1` readable on Android (else the run's crash evidence is `not captured` — a WARN, not a FAIL), and for `/qa-explore --agent` on mobile whether the mobile-mcp server is connected (optional — the agent falls back to `maestro hierarchy` + `adb`); for mobile on Appium: `appium --version` + the framework's `npm run appium:doctor` (drivers uiautomator2/xcuitest), `adb devices` / `xcrun simctl list` showing the gate-tier device names (or the farm credentials present in the framework's `.env`) and the app build resolvable (`ANDROID_APP`/`IOS_APP` or the framework's environment config) — `--version`/list probes only,
`allure` (optional, note only), and for unit the app repo's own toolchain named by the `§Unit testing`
framework (`dotnet --version` · `node --version` + the test runner in `node_modules/.bin` · `python -m
pytest --version` · `mvn`/`gradle --version`) — `--version` probes only, run outside the repo's build.
Missing tool → FAIL for that type with the install hint from the README prerequisites table.

## Step 5: Write the readiness report
`<qa-root>/runs/env-checks/<env>/<run-id>/readiness.md`. Front matter first (`CONTRACTS §18`): `env`,
`date`, `run_id`, `verdicts` (one key per ENABLED type → `READY | NOT READY | BLOCKED`), and
`inputs:` — `path` + `sha256` for each file whose contents decided those verdicts, normally
`<qa-root>/.env.<env>` and `.claude/PROJECT-PROFILE.md`, hashed with
`node <qa-root>/scripts/shared/build-state.mjs --hash <path>`. Hashes only, never values: the point is to
notice the environment file changed, not to record what is in it. Then the body:
`| # | Check | Type(s) | Result | Fix |` (Result: PASS / FAIL / skipped / not probed / BLOCKED),
then a **Runnable verdict per enabled type** (`e2e: READY`, `performance: BLOCKED — not authorized
on dev`), then `> **Project setup required:**` lines aggregating every FAIL's exact fix.

## Step 6: Report ONLY this summary to chat
```
✓ Env check <env> → <qa-root>/runs/env-checks/<env>/<run-id>/readiness.md
READY: {types} | NOT READY: {type → first blocking fix} | BLOCKED: {type → authorization}
{n} checks: {p} pass, {f} fail, {s} skipped
```

## Done — ALL must be true
- [ ] Every enabled type has a runnable verdict; every FAIL names its exact fix.
- [ ] Front-matter `verdicts` match the body's per-type lines; `inputs:` hashes the env file and the profile.
- [ ] No secret value appears anywhere — presence/reachability only.
- [ ] Probes were read-only; no writes, scans, or real-credential logins performed.
- [ ] Security/perf authorization verdicts match `§Environments` exactly.
- [ ] Un-probeable checks reported as `not probed`, never defaulted to pass.
- [ ] Every declared identity component has a row; no declaration, or a silently-changing kind left undeclared, is named with its fix (Step 2b).
