---
env: uat
date: 2026-09-10
run_id: 2026-09-10-0900
verdicts: { api: READY, e2e: READY, performance: BLOCKED }
inputs:
  - path: qa/.env.uat.example
    sha256: 6c8065e838abdf13cd48d5b05c185a3bb8db744ae025652a32c80505a3b2567c
---

# Env check — uat — 2026-09-10-0900

| # | Check | Type(s) | Result | Fix |
|---|---|---|---|---|
| 1 | BASE_URL reachable | api, e2e | PASS | — |
| 2 | load testing authorized on uat | performance | BLOCKED | §Environments says no — run on perf-env |

Runnable verdict per enabled type: `api: READY` · `e2e: READY` · `performance: BLOCKED — not authorized on uat`
