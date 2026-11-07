# .stlc/ci — wiring the QA workspace into CI

Two ready templates with identical semantics — GitLab and GitHub are supported equally:

| File | Use |
|---|---|
| `.gitlab-ci.qa.yml` | `include: [{ local: '.stlc/ci/.gitlab-ci.qa.yml' }]` from the project's `.gitlab-ci.yml` |
| `github-qa.yml` | copy to `.github/workflows/qa.yml` |
| `write-env.mjs` | used by both: writes `.stlc/.env.$QA_ENV` from CI variables, prints key names only |

Both run in `mcr.microsoft.com/playwright:v1.64.0-noble` — the same version as `@playwright/test`
in `.stlc/package.json` (the image's browsers are built for exactly that runner; `tests/bundle.test.mjs`
fails when the two drift). Bump them together. Dependencies install with `npm ci` when
`.stlc/package-lock.json` is committed (commit it — it is the reproducible build), `npm install`
otherwise.

## What runs when

| Job (GitLab · GitHub) | Trigger | Runs | Blocks? |
|---|---|---|---|
| `qa:lint` · `lint` | every MR/PR + push | `qa:lint` (CONTRACTS checks — including expired quarantines and unverified CLOSED defects) · `typecheck` · `lint` | yes |
| `qa:smoke` · `smoke` | every MR/PR + default branch | the `smoke` **run plan** (`run-plan.mjs run smoke`) when `run-plans/smoke.md` exists, else `test:smoke` (`@smoke` minus `@quarantined`); `--fail-on-flaky-tests`, budget ≤ 10 min | yes |
| `qa:changed` · `changed` | every MR/PR | `playwright test --only-changed=$BASE` — specs changed in the MR/PR **or importing a changed file** (a page-object edit re-runs its specs); `$BASE` is the MR diff base / PR base branch, fetched with full history | yes |
| `qa:regression` · `regression` | nightly schedule (+ manual) | the `regression` run plan when `run-plans/regression.md` exists, else `test:regression`; `--shard=i/4` — 4 shards (GitLab `parallel: 4` + `$CI_NODE_INDEX/$CI_NODE_TOTAL`; GitHub matrix `shardIndex`/`shardTotal`), `PW_BLOB=1` so each shard writes a blob report | yes (nightly signal) |
| `qa:report` · `report` | after regression | `npx playwright merge-reports --reporter html,junit` → ONE `html-report/` + `junit.xml` in `runs/ci/<pipeline>-regression/`; the verdict upload runs here | yes |
| `qa:shuffle` · `nightly[shuffle]` | nightly | `test:regression --shuffle` — a test that only passes after another one is a hidden dependency | yes |
| `qa:quarantined` · `nightly[quarantined]` | nightly | `test:quarantined` — keeps evidence flowing for `/qa-quarantine --release` | never |
| `qa:accessibility` · `nightly[accessibility]` | nightly (+ GitLab MR when a11y files change; GitHub dispatch) | `test:a11y` (axe, WCAG 2.2 AA; fails on `A11Y_FAIL_ON` impacts) | yes |
| `qa:unit-coverage` · — | nightly (GitLab) | summarises the APP repo's published coverage report against §Unit testing thresholds; on GitHub run the same command in the app repo's workflow | yes |
| `qa:performance` / `qa:security` · `nonfunctional` | **manual only** (`when: manual` · `workflow_dispatch`) | k6 · ZAP baseline + authz specs | yes, when run |
| `qa:plan:generate` → `qa:plan` · `plan-prepare` → `plan` → `plan-report` | **manual / scheduled**: GitLab *Run pipeline* (or a schedule) with `RUN_PLAN=<name>` [+ `QA_ENV`]; GitHub *Run workflow* → `suite: plan`, `plan: <name>`, `env` | any run plan `.stlc/run-plans/<name>.md` (CONTRACTS §19): validated and resolved first, sharded by the plan's `shards:` (GitLab: a generated child pipeline with `parallel: <shards>`; GitHub: a matrix from `ci-info`), `PW_BLOB=1` per shard, then `run-plan.mjs merge` → one `summary.md` (counts per type, plan, SHA) + `junit.xml` in `runs/ci/<pipeline>-plan-<name>/`. Security/performance in the plan are refused unless §Environments authorizes the env. When `RUN_PLAN` is set, GitLab runs nothing else on that pipeline | yes |
| `qa:mobile` · — | nightly + manual (GitLab, `mobile-runner`) | the mobile framework repo's own suite through `test:mobile` | yes, when run |
| `qa:ui-baselines` · `ui-baselines` | **manual only** (GitLab *Run pipeline* → play; GitHub dispatch `suite: ui-baselines`) | `npm run test:ui:update` (`--update-snapshots=changed`) in the Playwright Linux image; the new `.stlc/scripts/ui/__screenshots__/linux/` PNGs are the artifact — review each one, then commit | no — it writes baselines |
| `qa:desktop` · `desktop` | **manual** (+ GitLab schedule with `QA_DESKTOP=1`) on a runner tagged `desktop-runner` (GitLab) / labeled `desktop` (GitHub, self-hosted) | the `desktop-electron` project (`PW_PLATFORMS=windows`) against `ELECTRON_APP_PATH`; without it the desktop specs skip with that reason (⛔) | yes, when run |

Every Playwright job in CI also gets `--fail-on-flaky-tests` (and `failOnFlakyTests` in
`playwright.config.ts` when `CI` is set): retries are 0 by design, so a flaky signal is a FLAKY
triage for `/qa-quarantine`, never a silent pass.

Performance and security are manual on purpose: PROJECT-PROFILE §Environments decides which
environments may be loaded or scanned, and a pipeline trigger is not an authorization. The person
who clicks the job (or dispatches the workflow with `suite` + `env`) is confirming the env. On
GitHub, bind the `environment:` to a protected environment to require a named reviewer too.

## Run plans in CI

The same `.stlc/run-plans/<name>.md` runs locally (`/qa-run --plan <name>`, `npm run qa:plan:run -- <name>`)
and in CI — one definition, no drift. Typical schedules:

| Schedule | GitLab (*CI/CD → Schedules*) | GitHub |
|---|---|---|
| per MR/PR | `qa:smoke` runs the `smoke` plan automatically | `smoke` job runs the `smoke` plan automatically |
| nightly | `qa:regression` (sharded ×4) runs the `regression` plan | the `schedule:` cron runs `regression` |
| weekly full | a schedule with variable `RUN_PLAN=full` | add a second `cron` and a dispatch step, or dispatch `suite: plan, plan: full` |
| release | *Run pipeline* with `RUN_PLAN=release-<id>`, `QA_ENV=<env>` | *Run workflow* → `suite: plan`, `plan: release-<id>`, `env: <env>` |

CI runs never write the traceability table (the table lives in git, the run in an artifact): pull the
merged `junit.xml` into a plan with `/qa-ingest <slug> --from <junit.xml | artifact url>`.

## Run identity

Every Playwright job sets `QA_RUN_ID` = pipeline/run id + job (+ shard): `$CI_PIPELINE_ID-reg3`,
`${{ github.run_id }}-1-reg3`. Every entity a test creates is named `qa-<QA_RUN_ID>-w<worker>-…`
(`scripts/shared/data/unique.ts`), so shards and concurrent pipelines against one environment never
collide, and leftovers from a cancelled job are findable by prefix. `RUN_DIR` is
`runs/ci/<pipeline>-<job>` (shards: `runs/ci/<pipeline>-regression/shard-<i>`).

## Secrets and variables

All runner inputs come from CI variables and are written to `.stlc/.env.$QA_ENV` at job start by
`node ci/write-env.mjs` — the file is never committed (`.stlc/.gitignore`) and the log shows key
names and a count, never a value. Key names are exactly those in `.stlc/.env.example`:

| Group | Keys | Kind |
|---|---|---|
| App | `BASE_URL`, `API_BASE_URL`, `OPENAPI_SPEC`, `TEST_ID_ATTRIBUTE`, `DB_CONNECTION` | variable (`DB_CONNECTION`: secret) |
| Auth | `AUTH_MODE`, `AUTH_LOGIN_PATH`, `AUTH_USER_FIELD`, `AUTH_PASSWORD_FIELD`, `AUTH_TOKEN_PATH`, `AUTH_CSRF_PATH`, `AUTH_CSRF_HEADER`, `AUTH_ID_PATH`, `API_TOKEN` | variable (`API_TOKEN`: secret) |
| Named actors | `TEST_USER`, `TEST_PASSWORD`, `TEST_USER_<NAME>`, `TEST_PASSWORD_<NAME>` | secret |
| Account pool | `TEST_POOL_USER`, `TEST_POOL_PASSWORD`, `TEST_POOL_SIZE`, `TEST_POOL_PER_WORKER` | variable (`TEST_POOL_PASSWORD`: secret) |
| Runner | `PW_PROJECTS`, `PW_WORKERS`, `PW_CHANNEL`, `PW_VIDEO`, `A11Y_FAIL_ON`, `QA_KEEP_ON_FAIL` | variable |
| Non-functional | `PERF_TARGET_URL`, `PERF_VUS`, `PERF_DURATION`, `ZAP_TARGET_URL` (+ `PERF_SCRIPT`) | variable |
| Report hub | `VERDICT_URL`, `VERDICT_PROJECT`, `VERDICT_API_KEY` | variable (`VERDICT_API_KEY`: secret) |

- **GitLab**: Settings → CI/CD → Variables, masked + protected; they reach the job's environment
  and `write-env.mjs` reads them from there.
- **GitHub**: secrets in *Secrets*, the rest in *Variables* (repository or environment level). The
  workflow hands both to `write-env.mjs` as `toJSON(vars)` / `toJSON(secrets)` in env — never
  echoed, and the runner masks every secret value in logs anyway.

**Size the pool for the shards.** Each job signs in `workers × TEST_POOL_PER_WORKER` pool accounts
(the setup project fails fast when `TEST_POOL_SIZE` is smaller). Shards run concurrently against
one environment, so either seed `shards × workers × per-worker` accounts, or give each shard its own
range. The setup project signs every actor in once per job, over the API.

## Evidence

Every job uploads `.stlc/runs/**`; `junit.xml` feeds the MR test widget (GitLab
`artifacts:reports:junit`) / the PR checks (GitHub `mikepenz/action-junit-report`); `results.json`,
traces and screenshots stay in the artifact for `/qa-heal`. Regression shards upload their blob
reports; the merge job's single `html-report/` + `junit.xml` is the nightly's report. Text evidence
that `/qa-report` cites (`summary.md`, `failures.md`, `findings.md`, `coverage-summary.md`) is
committed by `/qa-run`, not by CI — CI runs prove the suite is green; the QA pipeline's runs remain
the traceability source.

## Platform and browser matrix

Two variables, both mirroring PROJECT-PROFILE §Platforms (CONTRACTS §20):

| Variable | Values | Default | Effect |
|---|---|---|---|
| `PW_PLATFORMS` | `web`, `api`, `windows`, `macos` (Electron) | `web,api` | which platforms the Playwright jobs run; a spec runs where its `@platform:` tag says |
| `PW_PROJECTS` | web targets `chromium,firefox,webkit,mobile-chrome,mobile-safari` (or `web-<target>`), `desktop-electron` | `chromium` | the web targets → projects `web-<target>`; nightly regression is the place to widen it |

Platforms that cannot run on a hosted Linux runner get their own job, manual or on a labeled runner:

| Platform | Job | Runner needs |
|---|---|---|
| `windows` / `macos` — Electron (`playwright-electron`) | `qa:desktop` · `desktop` | a Windows/macOS machine tagged `desktop-runner` / labeled `desktop`, the build at `ELECTRON_APP_PATH` |
| `windows` / `macos` — native (`appium-desktop`) | none here: the desktop automation repo's pipeline runs the staged specs (`HANDOFF.md`); `/qa-ingest` brings the junit back | Appium + the Windows / Mac2 driver |
| `android` / `ios` (`appium-wdio`) | `qa:mobile` (GitLab) | emulators or a device farm (`mobile-runner`) — CONTRACTS §15 |
| `other:<id>` (`handoff`) | none here: the platform team's own runner; `/qa-ingest` | — |

**Visual baselines (`ui` type).** Screenshots differ per OS (fonts, anti-aliasing), so the committed
baselines are the ones the Playwright Linux image renders: `.stlc/scripts/ui/__screenshots__/linux/<project>/…`
(`snapshotPathTemplate` puts the OS first). Generate or update them only with the manual
`ui-baselines` job, review every image, commit. A local Windows run writes `win32/` beside them and
never overwrites the CI set; keep `win32/`/`darwin/` out of the commit (or commit them deliberately
for local feedback). A missing `linux` baseline fails the CI job — that is the signal to run `ui-baselines`.

## Optional: the app under test as a service

When the pipeline should test a build of the app rather than a deployed environment, start it next
to the tests and **wait for its health check before the first test** — a suite that starts against
a booting app fails in the setup project with sign-in errors that point at the wrong thing.

GitLab — a service container (the job reaches it by its alias):

```yaml
qa:smoke:
  services:
    - name: $CI_REGISTRY_IMAGE/app:$CI_COMMIT_SHA
      alias: app
    - name: postgres:16
      alias: db
  variables:
    BASE_URL: http://app:8080
    API_BASE_URL: http://app:8080/api
    POSTGRES_PASSWORD: $DB_PASSWORD
  script:
    - for i in $(seq 1 60); do curl -fsS http://app:8080/health >/dev/null && break; sleep 2; done
    - curl -fsS http://app:8080/health        # still down after 2 min → fail here, with the reason
    - npm run test:smoke -- --fail-on-flaky-tests
```

GitHub — `services:` with a Docker health check (the job does not start until it is healthy):

```yaml
  smoke:
    services:
      app:
        image: ghcr.io/<org>/<app>:${{ github.sha }}
        options: >-
          --health-cmd "curl -fsS http://localhost:8080/health || exit 1"
          --health-interval 5s --health-timeout 3s --health-retries 24
    env:
      BASE_URL: http://app:8080
      API_BASE_URL: http://app:8080/api
```

Or Docker Compose from a shell runner: `docker compose -f .stlc/ci/compose.yml up -d --wait` (`--wait`
blocks until every service with a `healthcheck:` reports healthy), then run the tests, then
`docker compose down -v` in `after_script` / an `if: always()` step. Seed the named actors and the
account pool in the app's seed step — the setup project signs them in, it never creates them.
