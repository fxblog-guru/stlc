# Failures — orders-smoke — 2026-10-13-1000

| Case ID | Step | Error | Suspected cause | Next step |
|---|---|---|---|---|
| TC-INT-ORDERS-001 | 3 | expected tax_total to equal 4.20, got null | SETUP/ENV — the uat seed predates the tax migration | /qa-env uat |
