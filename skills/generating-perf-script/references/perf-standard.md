# Performance testing standard — perf-standard v1.0

The bar every performance framework in agentic-fx meets, whatever the tool: Locust, Gatling, k6 or
the next one. A template that meets every **MUST** scores 10/10 and is safe to clone into a new
product. The canonical copy lives in stlc (`skills/generating-perf-script/references/`); each
template carries a copy with the same version line and a `docs/standard-scorecard.md` that gives one
row per criterion with the file that proves it.

Every criterion is checkable: the **Proof** column says what a reviewer opens or runs. "Documented"
is never proof of a behaviour; a test or a run is.

## A. Safety — load is a weapon

| ID | Level | Criterion | Proof |
|---|---|---|---|
| PS-A1 | MUST | The target host is checked against an allowlist in the environment config before the first request; any other host is refused with a clear error | a self-test that a foreign host is refused |
| PS-A2 | MUST | Each environment states which profiles it allows (`smoke` only on shared/dev, heavy profiles only where load is authorised); production is never a default | env config + a self-test of a refused profile |
| PS-A3 | MUST | No default credentials or tokens for a real system in code or config; secrets come from environment variables or CI masked variables | grep of the repo; the local mock is the only exception |
| PS-A4 | MUST | The default target is a bundled local mock, never a third-party public service | the quick start runs against `localhost` |
| PS-A5 | MUST | The load generator's own CPU is recorded; above 80 % the run is `NOT EVALUABLE`, because it measures the tool | `generator.cpu_max_pct` in the result + a gate self-test |

## B. Workload model — what real users do

| ID | Level | Criterion | Proof |
|---|---|---|---|
| PS-B1 | MUST | A written workload model: personas, journeys, traffic mix, and the arithmetic from production numbers (Little's law) to users or arrival rate | `docs/workload-model.md` |
| PS-B2 | MUST | Journeys are chained business flows with correlation (ids, tokens extracted and reused), not single endpoints hammered in isolation | a journey file |
| PS-B3 | MUST | The traffic mix in code matches the model (weights), and the model is changed first | weights in code = table in the model |
| PS-B4 | MUST | Think time or pacing between steps, configured per environment | config + journey |
| PS-B5 | MUST | The injection model is chosen on purpose: open (arrival rate) for internet traffic and capacity, closed (users) for fixed pools; the model says which and why. A tool without native open injection says so, states its approximation (pacing) and its risk (coordinated omission), and names a tool that has it | model doc; a profile of each kind where the tool supports both |
| PS-B6 | MUST | Test data is parameterised and isolated: pools for shared data, unique generated values for writes, run-id-prefixed so it can be cleaned up | data module |
| PS-B7 | MUST | Authentication behaves like production (per-user tokens, re-login on expiry) and its cost is measured as its own endpoint | auth module |
| PS-B8 | MUST | Every check asserts the business outcome, not only the status: a 200 with a failed payload is an error | a client/chain with a business check |

## C. Profiles — one question each

| ID | Level | Criterion | Proof |
|---|---|---|---|
| PS-C1 | MUST | Profiles exist for smoke, baseline, load, stress, spike, soak, capacity and recovery; each states the question it answers | profile list in the README |
| PS-C2 | MUST | Profile shapes (users or rates, ramps, holds) live in config or parameters, never as literals spread through code; an environment can scale them down (a laptop run against the mock) without editing the profile | profile files / knobs + the env's scale |
| PS-C3 | MUST | Smoke proves wiring only: zero errors, no latency or throughput gate | the smoke gate + a self-test |
| PS-C4 | MUST | Stress and capacity report the knee (the level where the SLA breaks) and keep only a collapse guard as gate | profile + gate config |
| PS-C5 | MUST | Recovery judges only the window after the overload | gate on the recovery window |

## D. Measurement — numbers that mean something

| ID | Level | Criterion | Proof |
|---|---|---|---|
| PS-D1 | MUST | SLA numbers are taken over the steady-state window only; ramp-up and ramp-down are excluded, and the result says which window was measured | `run.window` in the result + a self-test |
| PS-D2 | MUST | p50, p90, p95, p99 and max per endpoint and in total; never the average alone | the result |
| PS-D3 | MUST | The error rate counts HTTP errors and business failures | the result + PS-B8 |
| PS-D4 | MUST | Requests are named by a logical name (the API's `operationId` when one exists), never by a raw URL with ids in it | request names |
| PS-D5 | MUST | Throughput (requests per second) is recorded, and in an open model the achieved rate is compared with the target | the result |
| PS-D6 | SHOULD | Apdex with a stated threshold | the result |

## E. Gates — a verdict a pipeline can trust

| ID | Level | Criterion | Proof |
|---|---|---|---|
| PS-E1 | MUST | One SLA file per framework: global percentiles, error rate, minimum throughput, per-endpoint limits, per-profile overrides | the SLA file |
| PS-E2 | MUST | The gate exits non-zero on any breach, so the pipeline fails | a self-test |
| PS-E3 | MUST | Three verdicts: PASS, FAIL, NOT EVALUABLE. A missing result, an endpoint named in the SLA but absent from the run, or a saturated generator is NOT EVALUABLE or FAIL — never PASS | self-tests for each |
| PS-E4 | MUST | Per-profile overrides replace a limit or switch it off explicitly; nothing is silently inherited | SLA file + a self-test |

## F. Baseline and regression — "is this build worse?"

| ID | Level | Criterion | Proof |
|---|---|---|---|
| PS-F1 | MUST | Baselines are committed per environment and profile, promoted only from a signed-off run | `baselines/` + the promote command |
| PS-F2 | MUST | Each run is compared in total and per endpoint: p95 up more than 10 %, error rate up more than 0.5 pp, throughput down more than 10 % is a regression. Noise is not a regression: an endpoint with too few requests in either run (default 100) is listed as not compared, and a p95 rise must also exceed an absolute floor (default 5 ms) | compare script + self-tests |
| PS-F3 | MUST | A baseline from another environment or profile is refused, not compared | a self-test |
| PS-F4 | MUST | No baseline is NOT EVALUABLE, never a silent pass; a first-run bootstrap flag exists and says so loudly | a self-test |

## G. Evidence — results anyone (or an agent) can read

| ID | Level | Criterion | Proof |
|---|---|---|---|
| PS-G1 | MUST | Every run writes `result.json` in the shared `perf-result/v1` schema (`perf-result.schema.json`), whatever the tool | a run + a schema self-test |
| PS-G2 | MUST | The result records the run's identity: tool and version, environment, profile, target, git SHA, start and end, measured window, generator | `run` and `generator` blocks |
| PS-G3 | MUST | Raw tool output (CSV, stats, HTML report) is kept beside `result.json` in `results/<run-id>/` | a run folder |
| PS-G4 | MUST | Failed requests are logged with time, endpoint, error and a correlation id | an errors file |

## H. Analysis — locate before you file

| ID | Level | Criterion | Proof |
|---|---|---|---|
| PS-H1 | MUST | A written triage order: which endpoints, when (shape over time), which resource saturated first, generator checked first | `docs/analysis.md` |
| PS-H2 | MUST | A symptom → likely-bottleneck table and a one-sentence RCA template | same doc |
| PS-H3 | SHOULD | A monitoring stack (metrics of the generator and the target on one time axis) that starts with one command, images pinned | compose file |

## I. Engineering — the framework is software too

| ID | Level | Criterion | Proof |
|---|---|---|---|
| PS-I1 | MUST | Tool, language and image versions are pinned (no `latest`, no open ranges that can jump a major) | dependency files |
| PS-I2 | MUST | One command per profile, and a bundled mock so the whole flow runs on a laptop in minutes | Makefile / scripts + mock |
| PS-I3 | MUST | The framework tests itself: gate, compare, allowlist, window and result schema have unit tests, and the tests are shown to fail when the logic is broken (mutation-checked) | `tests/` |
| PS-I4 | MUST | CI: lint + self-tests + compile on every merge request; smoke against the mock on every merge request; heavy profiles only scheduled or manual, against an authorised environment | CI file |
| PS-I5 | MUST | Runs on Windows, macOS and Linux; console output survives a non-UTF-8 terminal | a run on Windows |

## J. Agent-ready — clone, adapt, run, measure

| ID | Level | Criterion | Proof |
|---|---|---|---|
| PS-J1 | MUST | `AGENTS.md` gives the full flow in order: set up, run the mock smoke, adapt (model → data → clients → journeys → SLA → environments), smoke against the real target, baseline, promote, load, gate, compare, triage, report — with the exact command for each step and when to stop and ask | `AGENTS.md` |
| PS-J2 | MUST | Every place a new product must change is listed, and nothing else needs touching | the adapt table in `AGENTS.md` |
| PS-J3 | MUST | When the product has a dev contract, request names are its `operationId`s and SLA limits come from its `x-perf` budgets | `AGENTS.md` + SLA file |
| PS-J4 | MUST | `docs/standard-scorecard.md`: one row per criterion of this standard, its status and its proof; a criterion without proof is not met | the scorecard |

## Score

`score = 10 × met MUST / all MUST`, rounded down to one decimal. SHOULD items are listed, never
counted. A template below 10 is not a template yet: it may be used, but its scorecard's open rows
travel with it into the new product.

## Porting a new tool (k6, JMeter, …)

A new template is done when it scores 10. In practice that means, for that tool:

1. a mock target (reuse an existing one) and the allowlist check before the first request;
2. the profile set (C) as config, with a steady-state marker the exporter can read (D1);
3. an exporter from the tool's native output to `perf-result/v1` (G1) — the gate, compare and
   stlc's `qa:perf` then work unchanged;
4. a gate and compare with the three verdicts (E, F), or reuse of another template's scripts on
   `result.json`;
5. `AGENTS.md`, the scorecard and the self-tests (I3, J).
