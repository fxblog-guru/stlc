# Performance triage — locate before you file

A failed performance run is not a defect yet. It becomes one when you can say **which endpoint,
under what load, because of which resource**. Read in this order and write each answer into the
run's `failures.md` under the case.

## 1. Which runs failed, and how

`npm run qa:perf -- <RUN_DIR> --case <Case ID> --contract <dev contract>` writes `perf-verdict.md`:

| Line in the verdict | Meaning |
|---|---|
| a threshold breached (k6 exit 99, Locust gate exit 1) | the case's own SLO failed |
| `over` in **Budget** | the endpoint is slower than the dev contract's `x-perf.p95_ms`. The SLO in the script may have drifted from the contract; the contract wins |
| a row in **Against the baseline** | slower than the last signed-off run, even if every threshold held |
| `localized` | one or a few endpoints: look at their code path or query |
| `systemic` | most endpoints: look at shared resources (pool, CPU, the generator itself) |

`no budget` and `No baseline` are gaps to report, never passes. With neither a contract nor a
baseline the verdict is `NOT EVALUABLE`: the thresholds held, but nothing says whether that is good.

## 2. When it degraded

From the time series (k6 `--out csv`, Locust `--csv-full-history`):

| Shape | Points to |
|---|---|
| latency climbs with users | saturation: a pool, a lock, CPU |
| a step at one moment | an event: GC, a cache expiry, a restart, a cron job |
| slow drift at constant load | a leak: memory, connections, a growing table without an index |
| errors only above N users | a hard limit: pool size, file handles, a rate limiter |

## 3. Which resource saturated first

Lay the app's CPU and memory, the database's connections, locks and slow queries, and the load
generator's own CPU on the same time axis. The resource that saturates as latency departs is the
bottleneck.

**Check the generator first.** Generator CPU above ~70 % means the numbers measure the tool, not
the app: the run is `SETUP/ENV`, re-run with more workers, never a product defect.

## 4. Classify (CONTRACTS §5 tokens)

| Evidence | Class |
|---|---|
| a named endpoint, a named resource, reproducible with the same profile | `FUNCTIONAL` → `/qa-defect` with the verdict, the time window and the resource |
| the script hits a wrong path, logs in per iteration, or uses one record for every VU | `SCRIPT` → regenerate (`/qa-script --type performance`) |
| generator saturated, a shared environment, a warm-up not excluded, an unauthorised target | `SETUP/ENV` |

Performance runs are never re-run to green and never quarantined: a flaky SLO is a finding.

## 5. The one-sentence verdict

Write it in `failures.md` before filing: *"p95 of getPost went from 180 ms to 420 ms (+133 %) at
40 VUs because the comment count runs one query per post; the pool of 10 connections saturates at
25 VUs."* A defect without that sentence goes back for triage.

## Baselines

A baseline is the run of a signed-off report, promoted with `npm run qa:perf -- <RUN_DIR> --case
<Case ID> --update` into `<qa-root>/baselines/performance/<Case ID>.json` and committed. Compare
like with like: the same profile, the same environment, the same data size. A baseline from a
different machine or a different seed is not a baseline.
