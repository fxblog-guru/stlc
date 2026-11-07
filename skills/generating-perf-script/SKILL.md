---
name: generating-perf-script
description: Use to generate a k6 script from one TC-PERF case: its workload, SLOs as thresholds that fail the run; Locust alternative.
version: 1.1.0
---

# Generating Performance Script (k6)

> Profile first, by section (`profile.mjs`) — `§Test types` (is performance enabled; k6 default or
> Locust alternative), `§Environments` (which environment is approved for load — NEVER point load
> at an environment the profile does not approve), `§Application under test` (API spec for
> endpoint truth), `§Quality gates` (default p95 / error-rate SLOs when a case omits one).
> QA root below is the default `<qa-root>/` (profile-overridable).

> **Project setup required:** a k6 runtime — the `k6` binary or Docker (`grafana/k6`) — and the
> `<qa-root>/package.json` script `test:perf` wired to invoke it with the env file loaded. Referenced by
> name below; `executing-tests` calls it.

## Action

Generate ONE executable k6 script from ONE performance case. The script encodes the case's
workload as a k6 `scenario` and its SLOs as k6 `thresholds`, so a breached SLO makes k6 exit
non-zero — **the run fails its quality gate automatically, no human reading required**. Invoked by
the `nonfunctional-engineer` agent via `/qa-script --type performance`.

## Input

| What | Where |
|---|---|
| The case | `<qa-root>/cases/performance/<module>/TC-PERF-<MODULE>-<NNN>-<short-desc>.md` — contract case format where `## Workload` (scenario, VUs/ramp, duration) + `## SLOs` replace `## Steps` |
| Case discovery | The plan's `## Traceability (Requirement ↔ Case)` table in `<qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md`; fallback: grep `**Feature:** <slug>` under `<qa-root>/cases/`. **NEVER glob `<slug>.md` filenames.** |
| Endpoint truth | The journey/endpoints named in the case's `## Workload`/`## Data`, confirmed against the OpenAPI spec per `§Application under test` |
| Env | `<qa-root>/.env.<env>`: `PERF_TARGET_URL` (required), `PERF_VUS`, `PERF_DURATION` (optional overrides), `AUTH_MODE` + `AUTH_*`, `TEST_USER`/`TEST_PASSWORD` (or `TEST_POOL_*` for distinct users) if the journey authenticates |

## Output

- `<qa-root>/scripts/performance/<module>/<same-TC-basename>.js` — **mirrors the case path 1:1**, same
  basename (`.md` → `.js`).
- Shared data pools under `<qa-root>/scripts/shared/data/` when the case's `## Data` references one.
- The case's traceability row flipped `Scripted` ❌ → ✅ (Step 6).

## The standard and the templates

Every performance framework this skill writes into, or a team clones, meets
[`references/perf-standard.md`](references/perf-standard.md) (perf-standard v1.0: safety, workload,
profiles, steady-state measurement, three-verdict gates, baselines, agent-ready docs). Runs write
`result.json` in [`references/perf-result.schema.json`](references/perf-result.schema.json), which
`qa:perf` reads first, so the gate and the baseline work the same for every tool. A product that
wants a full framework instead of single scripts clones the reference template for its tool —
`agentic-fx/locust-performance-testing` or `agentic-fx/gatling-performance-testing` — and follows its
`AGENTS.md`; a tool with no template yet follows the standard's *Porting a new tool* section.

## Grounding rules

| # | Rule |
|---|---|
| 1 | **The scenario comes from `## Workload`** — executor shape, VUs, ramp, duration exactly as the case states. Env vars may override the *magnitude* (`PERF_VUS`, `PERF_DURATION`); the *shape* stays the case's. |
| 2 | **Every threshold comes from `## SLOs`.** A case SLO the script does not encode is a defect; a threshold the case never stated is an invention. Case missing an SLO → fall back to the `§Quality gates` defaults (p95 latency, error rate) and note the fallback in the script header + report; no default either → STOP and report the case back for enrichment. Never pick a number yourself. |
| 3 | **Endpoints and payloads only from the case or the API spec.** No guessed paths, no invented request bodies — an ungroundable step is a `// COVERAGE-GAP`, not a guess. |
| 4 | **Target is env-driven, never hardcoded.** `PERF_TARGET_URL` is the only base URL source; the script aborts with a clear error when it is unset. |
| 5 | **No load against unapproved environments.** The target must match an environment `§Environments` marks for performance testing. Anything else → refuse and report. |
| 6 | **Checks assert the case's Expected Result** (status, body claim per request); `check()` failures feed the `checks` metric and the error-rate threshold. |
| 7 | **Data pools, not literals** — users/payload variants via `SharedArray` from `<qa-root>/scripts/shared/data/`, built from the case's `## Data`. |
| 8 | **Metric hygiene**: every request carries `tags: { name: '<LogicalName>' }` so per-endpoint thresholds and reports group correctly (no `/orders/123` vs `/orders/456` cardinality explosion). When the endpoint has an `operationId` in the API spec, the name IS that `operationId`, and each budgeted one gets its own threshold — `qa:perf` matches the run to the dev contract's `x-perf` by it. |

## Workload model → k6 executor

| `## Workload` model | Executor | Shape |
|---|---|---|
| smoke | `constant-vus` | 1 VU × short duration — sanity before any load |
| load | `ramping-vus` | ramp to target VUs → hold for duration → ramp down |
| stress | `ramping-vus` | staged increments beyond expected peak until the breakpoint stage |
| spike | `ramping-vus` | near-instant surge to the spike VUs → short hold → drop to baseline |
| soak | `constant-vus` | target VUs held for the extended duration |

## SLO → threshold mapping

| `## SLOs` line (case) | k6 `thresholds` entry |
|---|---|
| p95 latency ≤ 500 ms | `http_req_duration: ['p(95)<500']` |
| p99 latency ≤ 1200 ms | `http_req_duration: ['p(99)<1200']` |
| error rate < 1% | `http_req_failed: ['rate<0.01']` |
| p95 of a named step ≤ N ms | `'http_req_duration{name:CreateOrder}': ['p(95)<N']` |
| checks pass ≥ 99% | `checks: ['rate>0.99']` |

## Procedure

### 1. Parse the case + completeness gate
Extract: Case ID, Feature slug, Plan path, Tags, Preconditions, `## Workload` (model, VUs/ramp,
duration, journey steps), `## SLOs`, `## Data`, Expected Result. Gate: no `## Workload` or no
usable SLO source (case + `§Quality gates` both empty) → STOP, report back for enrichment.

### 2. Resolve endpoints + data
Confirm each journey request against the API spec; build/extend the data pool file the case's
`## Data` calls for. Auth (when required) happens **once, in `setup()`**, per the project's
`AUTH_MODE` (PROJECT-PROFILE §Application under test) — never per-iteration login unless the
case's workload is literally the login journey. The same `.env` keys the Playwright kit reads
(`AUTH_LOGIN_PATH`, `AUTH_USER_FIELD`, `AUTH_PASSWORD_FIELD`, `AUTH_TOKEN_PATH`, `AUTH_CSRF_PATH`,
`AUTH_CSRF_HEADER`, `API_TOKEN`, `TEST_USER`/`TEST_PASSWORD`) drive it, so a perf script and the
functional suite sign in the same way. Many VUs as ONE account can trip per-account rate limits or
lock-outs: when the workload says "N distinct users", sign the pool in (`TEST_POOL_USER` template ×
`PERF_VUS`) in `setup()` and give each VU its own session (`exec.vu.idInTest`).

| `AUTH_MODE` | `setup()` does | each request sends |
|---|---|---|
| `session-csrf` | POST `AUTH_LOGIN_PATH` → keep the session cookie + the CSRF token at `AUTH_CSRF_PATH` | the cookie (set on the VU's jar) on every request; `AUTH_CSRF_HEADER: <token>` on every non-GET |
| `bearer-login` | POST `AUTH_LOGIN_PATH` → token at `AUTH_TOKEN_PATH` | `Authorization: Bearer <token>` |
| `basic` / `header` | nothing to call | `Authorization: Basic …` / `Bearer ${API_TOKEN}` |
| `none` | nothing | nothing |

### 3. Write the script

```js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js';

// Generated from <qa-root>/cases/performance/orders/TC-PERF-ORDERS-002-order-search-load.md
// TC-PERF-ORDERS-002 — [Orders] Search orders — 50 users at peak for 10 min → p95 < 500 ms, errors < 1%
// Workload: load · SLO source: case ## SLOs (p95<500ms, error rate<1%)
// Tags: @performance @orders @P1 @req:REQ-018 @agentic:gen
const TARGET = __ENV.PERF_TARGET_URL;
if (!TARGET) throw new Error('PERF_TARGET_URL is not set — fill <qa-root>/.env.<env> (run-k6.sh loads it)');
const API = `${TARGET}/api`;                          // the API prefix of the app (§Application under test) — still PERF_TARGET_URL-rooted
const VUS = Number(__ENV.PERF_VUS || 20);              // case default, env-overridable
const DURATION = __ENV.PERF_DURATION || '10m';         // case default, env-overridable
const CSRF_HEADER = __ENV.AUTH_CSRF_HEADER || 'X-CSRF-Token';
const dig = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

const searchTerms = new SharedArray('terms', () =>
  JSON.parse(open('../../shared/data/order-search-terms.json')));   // from the case's ## Data

export const options = {
  scenarios: {
    load: {                                            // ## Workload: load — ramp, hold, down
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: VUS },
        { duration: DURATION, target: VUS },
        { duration: '1m', target: 0 },
      ],
    },
  },
  thresholds: {                                        // ## SLOs → the automatic gate
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
  },
};

// Sign in ONCE (AUTH_MODE=session-csrf). setup() runs in its own VU: return what the VUs need.
export function setup() {
  const res = http.post(`${API}${__ENV.AUTH_LOGIN_PATH || '/auth/login'}`,
    JSON.stringify({ [__ENV.AUTH_USER_FIELD || 'username']: __ENV.TEST_USER, [__ENV.AUTH_PASSWORD_FIELD || 'password']: __ENV.TEST_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'SignIn' } });
  if (res.status !== 200) throw new Error(`sign-in failed: HTTP ${res.status} — check TEST_USER and AUTH_LOGIN_PATH`);
  const csrf = dig(res.json(), __ENV.AUTH_CSRF_PATH || 'csrf_token');
  const cookies = Object.fromEntries(Object.entries(res.cookies).map(([k, v]) => [k, v[0].value]));
  if (!csrf || !Object.keys(cookies).length) throw new Error('signed in but got no CSRF token or no session cookie — check AUTH_CSRF_PATH');
  return { csrf, cookies };
}

export default function (session) {
  const jar = http.cookieJar();
  for (const [k, v] of Object.entries(session.cookies)) jar.set(API, k, v);       // the session cookie, per VU
  const term = searchTerms[Math.floor(Math.random() * searchTerms.length)];

  const res = http.get(`${API}/orders?search=${encodeURIComponent(term)}`, { tags: { name: 'SearchOrders' } });
  check(res, {
    'status 200': (r) => r.status === 200,
    'returns results array': (r) => Array.isArray(r.json('items')),  // from Expected Result
  });

  const saved = http.post(`${API}/saved-searches`, JSON.stringify({ term }), {
    headers: { 'Content-Type': 'application/json', [CSRF_HEADER]: session.csrf },   // every non-GET carries the CSRF header
    tags: { name: 'SaveSearch' },
  });
  check(saved, { 'saved 201': (r) => r.status === 201 });
  sleep(Math.random() * 2 + 1);                        // think-time per the workload model
}

export function handleSummary(data) {
  const dir = __ENV.RUN_DIR || 'runs/performance/_adhoc';   // run-k6.sh / executing-tests pass RUN_DIR (relative to <qa-root>/)
  return {
    [`${dir}/summary.json`]: JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
```

A 403 on every write with a 200 on reads is the CSRF header missing, not an SLO breach — fix the
script, never relax `http_req_failed`. Entities the workload creates carry the run prefix
(`qa-${__ENV.QA_RUN_ID}-…`) so the sweeper can remove them; a perf run never deletes by query.

Multi-step journeys: one function per journey step calling tagged requests in order, chaining ids
via locals — the ring stays connected exactly as the workload describes it.

`run-k6.sh` exports every key of `<qa-root>/.env.<env>` (`set -a`) before `k6 run`, and k6 exposes the
process environment as `__ENV` — so `AUTH_*`, `TEST_USER*`, `TEST_POOL_*` and
`QA_RUN_ID` reach the script without extra `-e` flags (in CI they are already job variables).


### 4. Header comment block
The script opens with: source case path, workload model, SLO source (case vs `§Quality gates`
fallback), and the case's Tags line verbatim (k6 has no tag runner — the comment keeps the
taxonomy traceable: `@performance @<module> @P<n> [@req:<id>] @agentic:gen`).

### 5. Validate — offline + smoke
```bash
k6 inspect <qa-root>/scripts/performance/<module>/<TC>.js    # parse/compile check, no traffic
```
Optionally (approved env only) a 1-VU smoke: `k6 run -e PERF_VUS=1 -e PERF_DURATION=30s …` —
full-load runs belong to `executing-tests` (`/qa-run` → `npm run test:perf`), which supplies
`RUN_DIR=<qa-root>/runs/performance/<slug>/<run-id>/`.

### 6. Traceability write-back + report
Open the plan from the case's `**Plan:**` line, flip this Case ID's `Scripted` ❌ → ✅ in
`## Traceability (Requirement ↔ Case)`; `Last run`/`Status`/`Report` stay with `executing-tests`.
Report: script path, executor + stages, thresholds table (SLO ↔ threshold, with source), data
pools created, any gaps/fallbacks.

## Locust ALTERNATIVE — when `§Test types` names Locust for the performance tier

Same case, same grounding rules, same traceability flip; emission changes:

- Path mirrors the case 1:1 with `.py`: `<qa-root>/scripts/performance/<module>/<same-TC-basename>.py`.
- Structure: an `HttpUser` (journeys as `SequentialTaskSet`, independent requests as flat
  `@task`s) with `wait_time = between(1, 3)` as think-time; every request passes
  `name='<LogicalName>'` for metric grouping (grounding rule 8).
- Env-driven: `host = os.environ['PERF_TARGET_URL']` (abort if unset); users/duration passed at
  run time from `PERF_VUS`/`PERF_DURATION` — the runner invokes
  `locust -f <script> --headless -u $PERF_VUS -r <ramp> -t $PERF_DURATION --host $PERF_TARGET_URL`.
- **SLO gate**: Locust has no declarative thresholds — encode the case's `## SLOs` in a
  `@events.quitting` listener that reads `environment.stats.total` (p95 via
  `get_response_time_percentile(0.95)`, `fail_ratio`) and sets `environment.process_exit_code = 1`
  on any breach, so the run still fails its gate automatically.
- Summary export: `--json`/CSV output redirected into `RUN_DIR` by the runner.
- Validate offline with `python -m py_compile <script>`.
  > **Project setup required:** point `test:perf` at the Locust invocation and a Python venv with
  > `locust` installed.

## Done — ALL must be true

- [ ] Case located via traceability table / `**Feature:**` grep — never a filename glob
- [ ] Script mirrors the case path 1:1 under `<qa-root>/scripts/performance/<module>/`
- [ ] Scenario shape = the case's `## Workload` exactly (executor per the mapping table); magnitude env-overridable via `PERF_VUS`/`PERF_DURATION`
- [ ] Every `## SLOs` line encoded as a threshold (or the documented `§Quality gates` fallback) — zero invented numbers; a breach fails the run automatically
- [ ] `PERF_TARGET_URL` is the only target source; script aborts when unset; target env approved per `§Environments`
- [ ] Endpoints/payloads grounded in the case or API spec; data via `SharedArray` pools; every request tagged with a logical `name`
- [ ] Checks assert the case's Expected Result; think-time matches the workload model
- [ ] Auth once in `setup()` per `AUTH_MODE` (session-csrf: cookie on the VU jar + `AUTH_CSRF_HEADER` on every non-GET); no per-iteration login unless the workload is the login journey
- [ ] `handleSummary` exports to `RUN_DIR` (default `runs/performance/_adhoc`, relative to <qa-root>/)
- [ ] `k6 inspect` clean (or `py_compile` for Locust); no load fired outside `executing-tests` beyond an approved 1-VU smoke
- [ ] Traceability `Scripted` flipped to ✅; report delivered (path, scenario, SLO↔threshold table, gaps)
