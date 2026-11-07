---
name: orders-smoke
description: Fast check of the orders API tier on every merge request.
env: uat
owner: qa-lead
select:
  features: [orders]
  types: [api, integration]
browsers: [chromium]
shards: 1
retries: 0
---

# Run plan — orders-smoke

## Resolved cases

| Case ID | Type | Module | Priority | Feature | Script |
|---|---|---|---|---|---|
| TC-API-ORDERS-001 | api | orders | P0 | orders | `scripts/api/orders/TC-API-ORDERS-001-x.spec.ts` |
| TC-API-ORDERS-002 | api | orders | P1 | orders | `scripts/api/orders/TC-API-ORDERS-002-x.spec.ts` |
| TC-INT-ORDERS-001 | integration | orders | P1 | orders | `scripts/integration/orders/TC-INT-ORDERS-001-x.spec.ts` |
