# PROJECT-PROFILE.md — agentic-fx-qa configuration

Every agent, command, and skill in this bundle reads this file first. Fill it in for your
project; keep the section headings exactly as written (skills reference them by name, e.g.
"PROJECT-PROFILE §Test types"). Values marked `(default)` are assumed when left untouched.

## Project

- **Name:** `<your product name>`
- **One-liner:** `<what the product does>`
- **QA root:** `.stlc` (default) — the folder every testing artifact lives under, written `<qa-root>/`
  in this bundle (CONTRACTS §2). A project installed before 2.1 keeps `qa` and works unchanged: set
  `qa` here (or leave this line as it is — the scripts find whichever of `.stlc/` or `qa/` exists).
  `node <qa-root>/scripts/shared/migrate-root.mjs --to .stlc|qa --write` moves it.
- **Token budget per run:** `0` (`0` = none) — `/qa-plan` stops and asks when a sized estimate is
  over it (CONTRACTS §27).
- **Autonomy:** `off` (default) · `assisted` · `full` — how an unattended run decides (CONTRACTS §24);
  `QA_AUTONOMY` overrides it per run. Hard stops hold in every mode.
- **Artifact language:** `en` (default) — the language skills write artifact PROSE in
  (case steps, analyses, reports, defect descriptions). Set to your team's language (e.g. `vi`).
  Structural tokens stay English regardless — headings, ids (REQ/TC/DEF), table columns, tags,
  status/triage tokens — because parsers and gates match them byte-exact (see CONTRACTS.md).

## Application under test

- **Web UI:** `<base URL per env — see §Environments>`
- **API:** `<API base URL>` — **OpenAPI spec:** `<path or URL, e.g. <qa-root>/docs/openapi.yaml>` (also
  set `OPENAPI_SPEC` in `<qa-root>/.env.<env>` — `scripts/shared/schemas/openapi.validator.ts` reads it)
- **Auth:** `AUTH_MODE` in `<qa-root>/.env.<env>` — the `setup` project signs every actor in once per run,
  over the API, and the browser tiers reuse the same session (no UI login in specs):
  - `session-csrf` — POST `AUTH_LOGIN_PATH` (body fields `AUTH_USER_FIELD` / `AUTH_PASSWORD_FIELD`)
    sets a session cookie; the CSRF token at `AUTH_CSRF_PATH` in the response is sent in
    `AUTH_CSRF_HEADER` on every non-GET
  - `bearer-login` (default) — POST `AUTH_LOGIN_PATH`, token at `AUTH_TOKEN_PATH`
  - `basic` · `header` (`API_TOKEN`) · `none`
  - `AUTH_ID_PATH` — where the sign-in response carries the account id (factories grant roles to it)
- **Actors:** `<named actor → global role, one per line — e.g. default = TEST_USER (member), owner = TEST_USER_OWNER (account owner), admin = TEST_USER_ADMIN (system admin)>`
  — named actors hold roles that are properties of the ACCOUNT, are shared by every worker, and are
  read-only identities (tests never change the account itself).
- **Account pool:** `<template, e.g. TEST_POOL_USER=qa.user.{n:3}@example.test, size N per env, seeded by …>`
  — plain accounts, a disjoint slice per worker (`TEST_POOL_PER_WORKER`, default 4). Roles granted
  per object (project member, viewer, approver of THIS order) are DATA a factory grants to a pool
  account, never a shared login. Size ≥ workers × per-worker × concurrent CI shards; leave empty when
  no case grants per-object roles or changes an account.
- **Integration seams:** `<services, DBs, queues the app talks to — one line each>`
  - `<service-a> → <service-b>: <protocol/contract location>`
  - `DB: <engine>` — assertions via `DB_CONNECTION` in `<qa-root>/.env.<env>` (postgres · mssql · mysql)
- **Surfaces (optional):** `<distinct user-facing surfaces, e.g. web-admin, customer-portal — one line each; leave out for single-surface apps>`
  — when declared, `resolving-test-placement` inserts the surface segment: `<qa-root>/cases/<type>/<surface>/<module>/…`
- **Element registry / test-id convention:** `<qa-root>/docs/element-registry.md` (default) —
  required by `generating-e2e-script` and `generating-a11y-script`; document your `data-testid`
  convention there and mirror it in `TEST_ID_ATTRIBUTE` (`<qa-root>/.env.<env>`).
- **Source repos (read-only grounding, optional):** `<paths — used to verify endpoints/locators, never modified>`

## Test types

| Type | Enabled | Tool (default) | Output |
|---|---|---|---|
| `unit` | yes | the repo's own framework per §Unit testing (xUnit/NUnit · Vitest/Jest · pytest · JUnit 5) | `<qa-root>/cases/unit/`, `<qa-root>/scripts/unit/` (staged) → `<qa-root>/scripts/unit/HANDOFF.md` → the repo's test dir |
| `api` | yes | Playwright API tier (alt: pytest) | `<qa-root>/cases/api/`, `<qa-root>/scripts/api/` |
| `integration` | yes | Playwright API + DB assertions | `<qa-root>/cases/integration/`, `<qa-root>/scripts/integration/` |
| `e2e` | yes | Playwright + TypeScript | `<qa-root>/cases/e2e/`, `<qa-root>/scripts/e2e/` |
| `security` | yes | ZAP baseline + Playwright authz specs | `<qa-root>/cases/security/`, `<qa-root>/scripts/security/` |
| `performance` | yes | k6 (alt: Locust) | `<qa-root>/cases/performance/`, `<qa-root>/scripts/performance/` |
| `accessibility` | yes | Playwright + axe-core (WCAG 2.2 AA) per §Accessibility; manual checks by a human | `<qa-root>/cases/accessibility/`, `<qa-root>/scripts/accessibility/` (`@manual` cases: no script) |
| `ui` | yes | Playwright `toHaveScreenshot` + layout helpers (`shared/ui/`) per §UI testing — visual & layout, not journeys | `<qa-root>/cases/ui/`, `<qa-root>/scripts/ui/` (baselines in `<qa-root>/scripts/ui/__screenshots__/`) |
| `mobile` | no | the mobile automation repo's own framework per §Mobile testing (Appium 2 + WebdriverIO — the agentic-fx `mobilewright-automation` template) | `<qa-root>/cases/mobile/`, `<qa-root>/scripts/mobile/` (staged) → `<qa-root>/scripts/mobile/HANDOFF.md` → the framework repo's test dir |
| `data` | no | the pipeline repo's own framework per §Data testing (dbt tests on DuckDB in CI · PySpark + pytest; the agentic-fx `dbt-elt` / `spack-elt` templates) | `<qa-root>/cases/data/`, `<qa-root>/scripts/data/` (staged) → `<qa-root>/scripts/data/HANDOFF.md` → the pipeline repo's test dir |

Set `Enabled` to `no` to drop a type from every `--type all` run; commands skip disabled
types silently and report the skip. `unit` additionally requires §Unit testing to be filled —
enabled-but-unconfigured stops with a `> **Project setup required:**` callout, never a guess.

**This is the portability mechanism** — the bundle fits any project by shaping this table:
a headless API service disables `e2e`, `accessibility` and `ui`; a static site disables `integration`;
an internal tool may disable `performance`/`security`; a product with no app keeps `mobile` at `no`
(the default). The pipeline, gates, and reports adapt
automatically — a disabled type is out-of-scope everywhere, never an error.

**Swapping tools:** name the alternative in the Tool column and the generating skills honor it —
`pytest` for api (generating-api-script has a pytest path), `Locust` for performance
(generating-perf-script has a Locust path). Other tools = extend the relevant generating skill
first; keep the script-mirror path contract identical. The `unit` and `mobile` tools are never chosen
here — they are whatever the application repo (§Unit testing) and the mobile automation repo
(§Mobile testing) already use.

## Environments

| Env | Purpose | Security testing authorized | Performance testing authorized |
|---|---|---|---|
| `dev` | fast feedback | yes | no (shared) |
| `uat` (default) | full runs | yes | yes |
| `prod` | — | **no** | **no** |

Credentials/URLs per env live in `<qa-root>/.env.<env>` (copy from `<qa-root>/.env.example`). Security and
performance runs MUST refuse an environment whose column says no. CI never authorizes an env:
the `<qa-root>/ci/` templates keep perf/security jobs manual.

**Target identity (recommended — CONTRACTS §31.1).** How each part of the running system says what
it is, so a run can prove it judged the build the plan names (`qa:target` before every run; a wrong
build stops the run as `NOT_DEPLOYED`). Add a sub-section headed `### Target identity` here, with one
row per component a user's result depends on — the code of each service, any separately delivered
client, the flag set, the schema, the seed data. Columns byte-exact; rows are examples of the shapes:

```
| Env | Component | Kind | Probe | Read | Expect |
|---|---|---|---|---|---|
| * | api | code | GET ${API_URL}/version | json:commit | shipped-sha |
| * | web | client | GET ${BASE_URL}/ | regex:name="build" content="([^"]+)" | shipped-sha |
| * | flags | config | GET ${API_URL}/flags | sha256 | recorded |
| uat | schema | schema | CMD npm run --silent db:version | raw | recorded |
```

Kind ∈ `code · client · config · schema · data`; Probe ∈ `GET <url> · HEADER <url> <name> ·
CMD <command> · FILE <path>`; Read ∈ `json:<path> · regex:<pattern> · raw · sha256`; Expect ∈
`shipped-sha · recorded`. A system that exposes no identity at all is a `TESTABILITY-GAP` for the
developers: a version endpoint, a response header or a build-info file is enough.

## Platforms

WHERE the product runs — orthogonal to §Test types (WHAT a case proves). Every case names its
platform(s) in `**Platform:**`, an `@platform:<id>` tag and its title (`[Orders · Web]`); runs, run plans
and reports show results per platform (CONTRACTS §20). Keep the columns byte-exact.

| Platform | Kind | Runner | Targets | Tier | Enabled |
|---|---|---|---|---|---|
| `web` | web | playwright | chromium (gate), firefox (nightly), webkit (nightly), mobile-chrome (nightly), mobile-safari (weekly) | gate | yes |
| `api` | service | playwright-request | api | gate | yes |
| `android` | mobile | appium-wdio | devices from §Mobile testing | gate | no |
| `ios` | mobile | appium-wdio | devices from §Mobile testing | gate | no |
| `windows` | desktop | playwright-electron | electron | nightly | no |
| `macos` | desktop | playwright-electron | electron | weekly | no |

- **Kind** ∈ `web | mobile | desktop | service | other`. **Runner** ∈ `playwright` (browser projects
  `web-<target>`) · `playwright-request` (project `api`) · `playwright-electron` (Electron builds,
  project `desktop-electron`, executable from `ELECTRON_APP_PATH`) · `maestro` (mobile flows run from
  `<qa-root>/scripts/mobile/` with the kit in `<qa-root>/scripts/shared/maestro/` — no second repo, CONTRACTS §15
  Maestro; set the app ids in `.env.<env>`) · `appium-wdio` (the mobile handoff, CONTRACTS §15) · `appium-desktop` (native Windows/macOS apps through Appium's Windows / Mac2 driver —
  specs staged under `<qa-root>/scripts/<type>/` with a `HANDOFF.md`, run by the desktop automation repo) ·
  `handoff`.
- **Other platforms** (a kiosk, a TV app, a POS terminal): add `other:<id>` with Kind `other` and
  Runner `handoff` — cases are designed here, scripts staged with a `HANDOFF.md`, results come back
  through `/qa-ingest`. Example: `| other:kiosk | other | handoff | the kiosk lab | weekly | yes |`.
- **Tier** as in §Browsers & devices below; a target may carry its own tier in parentheses. The
  Platform gates (§Quality gates) count the `gate`-tier targets.
- **Selecting at run time:** `PW_PLATFORMS=web,api,windows` and `PW_PROJECTS=chromium,firefox` (or
  `web-chromium,desktop-electron`) in `<qa-root>/.env.<env>`, `--platforms` / `--projects` on `/qa-run`,
  `platforms:` in a run plan. Android, iOS and `other:*` never run in the Playwright workspace.

## Browsers & devices (optional — now the `web` row of §Platforms)

Kept for compatibility: a profile without `## Platforms` is still read the 1.0 way — these rows become
the `web` platform's targets — with a lint warning, for one minor version (CONTRACTS §20). New
profiles keep the table below as the tier guidance and list the targets in §Platforms. Playwright
projects for the browser tiers (`e2e`, `accessibility`, `ui`) are named `web-<project>`; the HTTP
tiers run once, browserless, in the `api` project.

| Project | Engine / device | Tier | Default | Used for |
|---|---|---|---|---|
| `chromium` | Desktop Chrome | gate | yes | every run |
| `firefox` | Desktop Firefox | nightly | no | nightly regression |
| `webkit` | Desktop Safari | nightly | no | nightly regression |
| `mobile-chrome` | Pixel 7 | nightly | no | responsive journeys, reflow cases |
| `mobile-safari` | iPhone 14 | weekly | no | responsive journeys |

- **Tier** comes from your analytics, not from habit: `gate` for engines above ~10 % of traffic
  (every run; the browser-matrix gate below counts them), `nightly` for 3–10 %, `weekly` for 1–3 %.
  Chrome, Edge, Opera and Brave share one engine; the real divergences surface in WebKit and Gecko,
  and a bundled WebKit is not Safari (codecs, fonts, cookie partitioning differ) — a real-Safari
  spot check belongs in `/qa-explore`. Cases assert user outcomes, never rendering internals.
- A case that needs a specific project states it in `## Data`; the config throws on an unknown name.
- **Known divergences:** `<qa-root>/docs/browser-issues.md` (optional) — one row per engine-specific
  behaviour with its workaround or ticket, so it is never re-debugged.

## Unit testing (required when `unit` is enabled)

The `unit` type is the one place this bundle reaches into an application repository, under the
narrow exception in CONTRACTS §9.6 / §11: it may **run** the commands declared here and, only in
Write mode `apply`, **write test files** under the declared test directories. Production source
is never edited; a subject that needs a refactor to become testable is a `TESTABILITY-GAP` for the
developers. Cases, staged scripts, the handoff table, run evidence, and coverage summaries all stay
in `<qa-root>/`.

| Layer | Repo path | Language / framework | Test dir(s) (the only writable paths) | Run command | Coverage command → report |
|---|---|---|---|---|---|
| `backend` | `<path>` | `csharp / xunit` | `tests/**` | `dotnet test --no-restore` | `dotnet test --collect:"XPlat Code Coverage"` → `**/coverage.cobertura.xml` (`cobertura`) |
| `frontend` | `<path>` | `typescript / vitest` | `src/**/*.test.ts` | `npx vitest run` | `npx vitest run --coverage` → `coverage/lcov.info` (`lcov`) |

- **Test-file convention (per layer):** `backend` — `tests/<same relative folder>/<Subject>Tests.cs`;
  `frontend` — `<subject>.test.ts` beside the subject. `generating-unit-script` derives the
  `Target path` in `<qa-root>/scripts/unit/HANDOFF.md` from this line — an undeclared convention is a STOP.
- **Filter syntax** (scopes a run to a module; omit if unsupported): `backend` —
  `--filter FullyQualifiedName~<Module>`; `frontend` — `<path-or-glob>`.
- **Write mode:** `propose` (default) — generated tests are staged under `<qa-root>/scripts/unit/` and
  listed in `HANDOFF.md` for a developer to apply; `apply` — additionally written to the Target path
  (never anywhere else). Switch to `apply` only once the team has agreed to it in writing.
- **Coverage thresholds (unit gate):** branch ≥ `80`% · line ≥ `90`% on the modules the feature
  touches (impact map); `n/a` in either cell removes the coverage half of the gate (it then reports
  `not evaluable`, never `pass`).
- **Doubles policy:** test doubles only at ports — `<the codebase's own abstractions, e.g. IClock,
  IRepository<T>, IHttpClientFactory, IMessageBus, IOptions<T>>` — never the subject, value objects,
  or the language runtime. Prefer hand-written fakes for ports with state; mocks for verifying an
  interaction that IS the contract (e.g. "publishes exactly one event").
- **Hermetic rule:** unit tests never touch network, database, filesystem, environment variables,
  wall clock, or randomness. A behaviour that needs any of them is an `integration` case — route it.
- **Coverage report format:** `cobertura` | `lcov` | `jacoco` | `istanbul-json` — parsed by
  `<qa-root>/scripts/unit/coverage-summary.mjs` into `coverage-summary.md` (CONTRACTS §11) during `/qa-run`.
- **Default branch:** `main` — `/qa-run --type unit` promotes HANDOFF rows `applied` → `merged` when
  the target file exists at `HEAD` of this branch.

## Data testing (required when `data` is enabled)

The `data` type tests data pipelines (ELT/ETL: ingestion, warehouse transformations, layer hops,
orchestration). Like `unit`, its tests live in the pipeline repo, under the narrow exception in
CONTRACTS §9.6 / §28: the bundle may **run** the commands declared here and, only in Write mode
`apply`, **write test files** under the declared test directories. Models, jobs and DAGs are never
edited; a hop that cannot be checked without a pipeline change (no manifest of landed files, no
`_loaded_at` column) is a `TESTABILITY-GAP` for the data engineers.

**Readiness: data testing does not start until every row below is filled.** A missing row is a
`> **Project setup required:**` STOP, never a guess. The agent asks; it does not invent a grain, a
tolerance or a business rule.

| # | Input | Value |
|---|---|---|
| R1 | Source contracts (columns, types, required, keys, enums, normalization) | `<path, e.g. conf/sources/*.yml or models/staging/**/_sources.yml>` |
| R2 | Grain of every model ("one row per …") | `<path or "in model yml descriptions">` |
| R3 | Hop map (every layer hop + relationship: exact / dedup / filtered / aggregated) | `<path, e.g. recon/hops.yml>` |
| R4 | Business rules as testable statements, with tolerance and owner | `<wiki BR pages or a doc path>` |
| R5 | Late-arrival window and freshness SLA | `<days> · warn <n>h / error <n>h` |
| R6 | PII inventory (protected columns and their masked shape) | `<path or list>` |
| R7 | Deterministic fixture with the edge cases (dupes, nulls, case, boundaries, zero amounts, month end) | `<path>` |
| R8 | CI engine that runs without production credentials | `<duckdb | local spark | …>` |

| Layer | Repo path | Engine / framework | Test dir(s) (the only writable paths) | Run command | Mutation command |
|---|---|---|---|---|---|
| `transform` | `<path>` | `dbt / duckdb (ci), athena (prod)` | `dbt-transform/tests/**`, `dbt-transform/models/**/_*.yml` | `python ci/run_ci.py` | `python ci/mutate.py` |
| `ingest` | `<path>` | `pyspark / pytest` | `tests/**` | `python -m pytest` | `python tests/mutate.py` |

- **Test-file convention (per layer):** `transform` — singular tests
  `tests/<recon|business_rules|pii>/tc_data_<nnn>_<slug>.sql`, unit tests in the model's `_*.yml`;
  `ingest` — `tests/test_<topic>.py` with the Case ID in the test docstring.
- **Result files:** `transform` — `target/run_results.json`; `ingest` — JUnit XML
  (`pytest --junitxml`). `executing-tests` reads verdicts from these, never from logs.
- **Write mode:** `propose` (default) or `apply`, as in §Unit testing.
- **Environments:** CI runs on the engine in R8 with the fixture in R7; the warehouse targets
  (`sit`, `uat`, `prod`) run only where their credentials are present, and a data run never writes
  to a production schema.

## Accessibility (required when `accessibility` is enabled)

- **Conformance target:** `WCAG 2.2 AA` (default) — the axe tags `shared/a11y/axe.ts` runs and the
  `## WCAG ref` header every accessibility case carries.
- **In-scope screens:** `every screen an e2e case of the feature visits` (default) — or list routes.
- **Failing impacts:** `critical, serious` (default; `A11Y_FAIL_ON` in `<qa-root>/.env.<env>`) — the spec
  fails on these; `moderate`/`minor` become findings (Medium/Low) and never block alone.
- **Viewports:** `1280×800` (default) + `320 CSS px` reflow on data screens (SC 1.4.10).
- **Manual checks required per interactive screen:** keyboard-only pass · screen-reader spot check
  (NVDA or VoiceOver) · focus visible across themes — designed as `@manual` cases and executed in
  `/qa-explore` sessions; their verdicts are recorded by a human.
- **Excluded regions:** `<third-party widgets the team does not own — selector + reason>`; every
  exclusion is repeated in the case's `## Scope`.

## UI testing (required when `ui` is enabled)

Visual and layout testing — what the screen LOOKS like and whether it holds its shape — distinct from
`e2e` (does the journey work) and `accessibility` (can everyone use it). Read by `designing-ui-cases`
and `generating-ui-script`.

- **Screens in scope:** `every screen an e2e case of the feature visits` (default) — or list routes.
- **Viewports (web):** `320, 768, 1280` CSS px wide (default); desktop platforms use the window size
  the app opens with; mobile viewports come from §Mobile testing's devices.
- **Visual threshold:** `UI_MAX_DIFF_PIXEL_RATIO=0.01` (default) in `<qa-root>/.env.<env>` — the share of
  pixels allowed to differ before a screenshot comparison fails.
- **Baselines:** generated in the CI image (Linux) and committed under
  `<qa-root>/scripts/ui/__screenshots__/linux/<project>/…`; a local run on another OS writes its own folder
  (`win32/`, `darwin/`) and never overwrites the CI set. Update with `--update-snapshots=changed` in
  the CI image, reviewed like code.
- **Stable fonts:** `<the font files the app ships, or "system — CI image only">` — baselines are
  only comparable when fonts are identical.
- **Design tokens (optional):** `<path to the token file, e.g. design/tokens.json>` — when declared,
  named components are checked against it (color, font, spacing); when absent those checks skip with
  that reason.
- **Themes:** dark mode `no` · RTL `no` (default) — `yes` adds the theme/direction as a screen state.

## Mobile testing (required when `mobile` is enabled on `appium-wdio`)

> **On Maestro instead?** Set the `android` / `ios` Runner in §Platforms to `maestro` and skip the
> section below. Flows live in `<qa-root>/scripts/mobile/`, the kit in `<qa-root>/scripts/shared/maestro/`, and
> `.env.<env>` carries `MOBILE_ANDROID_APP_ID` / `MOBILE_IOS_APP_ID`. Pick Maestro when the team
> wants readable YAML flows owned by QA. Pick `appium-wdio` when a mobile framework repo with screen
> objects already exists.

The `mobile` type is the second place this bundle reaches outside `<qa-root>/`, under the same narrow
exception as the unit tier (CONTRACTS §9.6 / §15): it may **run** the commands declared here and,
only in Write mode `apply`, **write spec files** under the declared test directories of the mobile
automation repo. The framework's `src/` layers (screen objects, flows, utils, config) are never
edited — a missing screen object is a `FRAMEWORK-GAP` for the mobile developers. Cases, staged
specs, the handoff table and run evidence stay in `<qa-root>/`.

- **Framework repo:** `<path to the mobile automation repo — e.g. ../mobilewright-automation>`
  (template: agentic-fx `mobilewright-automation` — Appium 2 + WebdriverIO + TypeScript + Allure)
- **Platforms:** `android`, `ios` (drop one if the product ships a single platform)
- **Test dir(s) (the only writable paths):** `tests/smoke/**`, `tests/regression/**`, `tests/e2e/**`
- **Test-file convention:** `tests/<suite>/<module>.<kind>.spec.ts` — `<suite>` from the case's
  suite tag (`@smoke` → `smoke`, `@regression` → `regression`, `@e2e` → `e2e`), `<kind>` ∈
  `smoke | negative | behaviors | e2e`. `generating-mobile-script` derives the `Target path` in
  `<qa-root>/scripts/mobile/HANDOFF.md` from this line — an undeclared convention is a STOP.
- **Path aliases (imports in a staged spec):** `@screens/*` `@flows/*` `@core/*` `@utils/*`
  `@gestures/*` `@data/*` → the framework's `src/*` (keep the framework's `.js` import suffix)
- **Run commands:** `android` — `npm run test:android`; `ios` — `npm run test:ios`
  (suite selection by tag: `TEST_TAGS=@smoke`; devices: `DEVICES=<names>`, `MATRIX=full`;
  parallelism: `MAX_INSTANCES=<n>`) — the ONLY commands this bundle runs inside that repo
- **App build:** `ANDROID_APP` / `IOS_APP` (local path or farm id) — supplied by the app repo's
  pipeline; QA never builds the app
- **Device matrix (`<name>` values come from the framework's `config/devices/*.devices.json`):**

| Device name | Platform | OS version | Type | Tier |
|---|---|---|---|---|
| `pixel-8-emu-api34` | android | 14.0 | emulator | gate |
| `iphone-15-sim-17` | ios | 17.5 | simulator | gate |
| `galaxy-s23-real` | android | 14.0 | real | nightly |
| `iphone-se-sim-16` | ios | 16.4 | simulator | nightly (small screen) |

- **Device farm (optional):** `<BrowserStack | Sauce | internal grid>` — credentials in the
  framework repo's own `.env`, never in `<qa-root>/`
- **Write mode:** `propose` (default) — specs are staged under `<qa-root>/scripts/mobile/` and listed in
  `HANDOFF.md` for a mobile developer to apply; `apply` — additionally written to the Target path
  (never anywhere else, never into `src/`)
- **Evidence:** Allure results at `<framework repo>/reports/allure-results`, logs at `<repo>/logs` —
  copied into `<qa-root>/runs/mobile/<slug>/<run-id>/` by the runner wrapper
- **Retry policy (the framework's, not ours):** `SPEC_RETRIES=1` deferred; a pass-on-retry is a FLAKY
  triage here too → `/qa-quarantine` (the framework's own `@quarantine` title tag mirrors our
  `@quarantined:<until>` case tag; both are set by that command)

## Quality gates

Read by `/qa-run`, `/qa-report`, `/qa-status`, `/qa-signoff`, `/qa-metrics`. Defaults below;
tighten per project. `not evaluable` is never `pass`.

| Gate | Target (default) |
|---|---|
| Functional (e2e/api/integration/accessibility) | 0 failing P0/P1 cases (quarantined rows excluded from the count but PRINTED); ≥90% of designed P0/P1 cases scripted (manual excluded) |
| Browser matrix (e2e/accessibility/ui) | every P0 e2e case passes on every `gate`-tier target of the `web` platform (§Platforms; §Browsers & devices in a 1.0 profile); reported per project like the mobile device matrix; a project not run is `not evaluable`, never averaged away |
| Platform: <label> (one row per `gate`-tier platform in §Platforms) | 0 failing P0/P1 cases on that platform's gate targets; a platform with designed cases and no run is `not evaluable`; staged/handoff platforms count their ingested results |
| UI (visual & layout) | 0 failing P0/P1 `ui` cases on every gate-tier project; every baseline change reviewed (the diff image attached to the run) — never accepted by re-running `--update-snapshots` blind |
| Case coverage | every REQ-id in the plan has ≥1 case per applicable type |
| Performance | p95 latency ≤ `<ms>`; error rate < 1%; thresholds encoded in the k6 script |
| Security | 0 unresolved High/Critical findings (ZAP + authz specs) |
| Accessibility | 0 unresolved Critical/High findings on in-scope screens at the §Accessibility target; every `@manual` accessibility case executed before sign-off |
| Mobile | 0 failing P0/P1 cases on every gate-tier device of each enabled platform; every P0 journey covered on both platforms (or a written single-platform reason); crash/ANR = 0; no HANDOFF row `proposed` for > 2 runs (escalate) |
| Unit | 0 failing tests in the declared suite; branch/line coverage on impacted modules ≥ §Unit testing thresholds; every logic-bearing P0/P1 REQ has ≥1 `TC-UNIT` case; no HANDOFF row `proposed` for > 2 runs (escalate) |
| Flake budget → quarantine | a test failing then passing unchanged twice in 5 runs → `/qa-quarantine` (≤30 days, ticket, evidence); no expired-unreleased quarantine; quarantined P0/P1 cases ≤ `2` per feature (each is a sign-off condition). A unit test that flakes even once is a NON-DETERMINISTIC finding, not a budget item |
| Defect lifecycle | Critical/High defects verified (`/qa-defect --verify`) within `2` runs of the fix; no OPEN Critical defect older than `14` days without a stated Resolution decision |
| Escapes | every `<qa-root>/defects/ESCAPES.md` row has a backfill case within `1` sprint; escape rate trended in `/qa-metrics` |
| Exploratory | ≥ `1` debriefed session (`/qa-explore`) per feature before sign-off (covers `@manual` cases and top risks) |
| Test-pyramid mix (read by `/qa-metrics`, informational) | unit ≥ 50% · api + integration ≥ 30% · e2e ≤ 15% of designed cases |

## Domain knowledge (optional)

Two corpus forms — skills degrade gracefully when neither exists:

- **Compiled wiki (preferred):** `<qa-root>/wiki/` — built and maintained by `/qa-knowledge`
  (skill `building-domain-wiki`) from raw docs dropped in `<qa-root>/wiki/inbox/`. When
  `<qa-root>/wiki/compiled/index.md` exists, every skill resolves domain lookups (glossary terms,
  personas, business rules `BR-###`) through that index — open it, follow the link that
  scopes the question, read the atomic page whole, and cite the page + its `sources:` entry.
  Never read `<qa-root>/wiki/.tmp/` or `<qa-root>/wiki/archive/` as truth (fallback evidence only), and
  never guess from the wiki's silence — a missing answer is a gap/question.
- **Plain folder (fallback):** `docs/domain/` (default) — loose glossary/personas/business-rule
  markdown read directly when no compiled wiki exists.

The wiki wins when both exist.

## Code knowledge (optional)

One `rag-kit` index per application repo — the **Code KB** that the `grounding-in-code` skill
resolves endpoint paths, payload shapes, validation rules, screen locators, and "what changed"
questions against. Skills degrade gracefully: no table → read-only grep of `§Source repos`;
no repos either → reported gaps. Ingest and eval are owned by each repo's CI, never by QA agents.

| Layer | Repo path (read-only) | rag.toml | MCP server | Enabled |
|---|---|---|---|---|
| `backend` | `<path>` | `<path>/rag.toml` | `<project>-backend` | no |
| `frontend` | `<path>` | `<path>/rag.toml` | `<project>-frontend` | no |
| `scripts` | `<qa-root>/` (this workspace) | `<qa-root>/rag.toml` | `<project>-scripts` | no |

- **Setup** (per repo): `python3 -m rag init --force` → edit `[source]` → `python3 -m rag ingest`
  → `python3 -m rag eval --min-recall 0.8` in CI on the default branch; register for Claude Code with
  `claude mcp add --scope project <project>-<layer> -- python3 -m rag serve` run inside the repo.
  Full walkthrough: agentic-fx `rag-reference-guide/deploying-rag.md`.
- **Impact map:** `<qa-root>/docs/impact-map.md` (default) — `BR-###` ↔ module ↔ endpoint/screen ↔ `TC-###`
  rows maintained by `maintaining-impact-map`; read by `/qa-impact`, `/qa-plan`, and the design skills.
- **Citation shape for code facts:** `<layer>:<path>#<symbol> @ <short-sha>` (CONTRACTS §10).

## Test management (optional)

### Report hub — verdict

Where runs accumulate so history, flakiness scoring and server-side gates exist. Used by
`/qa-upload`; everything else works without it.

- **Report hub:** `verdict` (default) | `none`
- **Verdict project:** `<project key — lowercase-kebab, created in the verdict UI>`
- **Server + key:** `VERDICT_URL`, `VERDICT_API_KEY` in `<qa-root>/.env.<env>`
- **Upload cadence:** every run (default) | nightly only | release only

A missing `VERDICT_URL` never fails a run: `/qa-upload` prints the command and reports the skip.
Uploading is reporting, and a green run does not become red because a hub was unreachable.

### TMS

Required for `/qa-publish`; used by `/qa-defect` (Bug push), `/qa-analyze` and `/qa-escape`
(read-only ticket snapshots). Writes to the tracker always wait for the user's explicit yes
(CONTRACTS §9.9).

- **TMS:** `none` (default) | `azure-devops` (built-in scripts) | `jira` (built-in via the Atlassian
  MCP connector — `publishing-test-cases/references/jira-adapter.md`) — other systems: see the
  Adapter seam in `publishing-test-cases`; the id-writeback contract is TMS-agnostic
- **Azure DevOps config:** `ADO_BASE_URL`, `TMS_ADO_PAT` (+ optional `ADO_PROJECT`, `ADO_AREA_ROOT`,
  `PLAN_ID`, `SUITE_ID`) in `<qa-root>/.env.<env>`; area mapping at `<qa-root>/config/tms/mapping-path.md`.
- **Jira config:** `JIRA_PROJECT_KEY`, `JIRA_CASE_ISSUE_TYPE` (`Test` default — Xray/Zephyr's type
  or a plain `Task`), `JIRA_BUG_ISSUE_TYPE` (`Bug` default); component/label routing in the Jira
  table of `<qa-root>/config/tms/mapping-path.md`. No token in `.env` — the MCP connector authenticates.

## Estimation baselines (optional)

Read by `/qa-estimate`. Throughput rates for converting case counts to hours — tune to YOUR
team's actuals; the defaults below apply when this section is left untouched, and every estimate
marks default-derived figures `(default — tune in PROJECT-PROFILE)`.

| Activity | Rate (default) |
|---|---|
| Case design | 4 cases/h |
| Script — e2e | 1.5 cases/h |
| Script — api / integration | 3 cases/h |
| Script — performance / security | 2 h/scenario |
| Case design — unit (matrix-driven) | 6 cases/h |
| Script — unit (table-driven tests) | 4 cases/h |
| Unit-test audit (`/qa-unit-audit`) | 25 existing tests/h |
| Case design — accessibility | 5 cases/h |
| Script — accessibility (axe + keyboard) | 3 cases/h |
| Case design — ui (screen × state × viewport) | 4 cases/h |
| Script — ui (screenshots + layout checks, page objects exist) | 2 cases/h |
| Case design — mobile (per platform pair) | 3 cases/h |
| Script — mobile (WDIO spec, screen objects exist) | 1.5 cases/h |
| Script — mobile (new screen object needed → FRAMEWORK-GAP) | +1 h/screen (mobile dev, not QA) |
| Exploratory charter (session + debrief) | 2 h/charter |
| Escape intake (`/qa-escape`) | 1 h/escape |
| Run + triage | 15% of design+script hours |
| Defect writing | 0.5 h/defect (forecast ≈ 10% of case count on a new feature) |
| Risk buffer | high +30% · medium +15% · low +5% (from the analysis risk scores) |
