---
name: release-2026-10
description: Everything the October release must pass: orders and invoices across api, e2e and ui.
env: uat
owner: qa-lead
select:
  features: [orders, invoices]
  types: [api, e2e, ui, accessibility]
browsers: [chromium]
shards: 1
retries: 0
---

# Run plan — release-2026-10

## Resolved cases

| Case ID | Type | Module | Priority | Feature | Script |
|---|---|---|---|---|---|
| TC-API-ORDERS-001 | api | orders | P0 | orders | `scripts/api/orders/TC-API-ORDERS-001-x.spec.ts` |
| TC-E2E-ORDERS-001 | e2e | orders | P0 | orders | `scripts/e2e/orders/TC-E2E-ORDERS-001-x.spec.ts` |
| TC-E2E-ORDERS-002 | e2e | orders | P1 | orders | `scripts/e2e/orders/TC-E2E-ORDERS-002-x.spec.ts` |
| TC-UI-ORDERS-001 | ui | orders | P2 | orders | `scripts/ui/orders/TC-UI-ORDERS-001-x.spec.ts` |
| TC-A11Y-ORDERS-001 | accessibility | orders | P1 | orders | manual |
| TC-API-INVOICES-001 | api | invoices | P0 | invoices | `scripts/api/invoices/TC-API-INVOICES-001-x.spec.ts` |
| TC-E2E-INVOICES-001 | e2e | invoices | P1 | invoices | `scripts/e2e/invoices/TC-E2E-INVOICES-001-x.spec.ts` |
