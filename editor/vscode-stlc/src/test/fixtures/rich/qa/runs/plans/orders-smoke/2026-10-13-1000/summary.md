# Run plan orders-smoke — 2026-10-13-1000

**Run plan:** orders-smoke (`qa/run-plans/orders-smoke.md`)  **Env:** uat  **Git SHA:** 3b9d0e1  **QA_RUN_ID:** orders-smoke-2026-10-13-1000
**Started:** 2026-10-13T10:00:00Z  **Finished:** 2026-10-13T10:06:12Z  **Shards:** 1  **Browsers:** chromium
**Slugs written back:** orders

## Counts by type

| Type | Selected | Pass | Fail | Blocked | Manual |
|---|---|---|---|---|---|
| api | 2 | 2 | 0 | 0 | 0 |
| integration | 1 | 0 | 1 | 0 | 0 |

## Cases

| Case ID | Type | Feature | Status | Detail |
|---|---|---|---|---|
| TC-API-ORDERS-001 | api | orders | ✅ | — |
| TC-API-ORDERS-002 | api | orders | ✅ | — |
| TC-INT-ORDERS-001 | integration | orders | ❌ | totals row missing tax column |

quarantined (excluded from gate): none
