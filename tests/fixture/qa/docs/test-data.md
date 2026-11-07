# Test data

## Glossary
| Token | Entity | Strategy | Lifecycle | Needed by | Notes |
|---|---|---|---|---|---|
| [DATA:customer-active] | customer | factory | per-run, deleted in teardown | TC-API-ORDERS-001, TC-INT-ORDERS-001, TC-E2E-ORDERS-001, TC-PERF-ORDERS-001 | synthetic name and email |
| [DATA:order-draft] | order | factory (shared/maestro/flows/orders/create-order.yaml) | per-flow, deleted in onFlowComplete | TC-MOB-ORDERS-002 | unique name from unique.js |

## Factories
- `customers.factory.ts#activeCustomer` — run-unique key `run-<runId>`

## Pool accounts
| Pool | Role | Size | Source |
|---|---|---|---|
| standard | order clerk | 6 | qa/.env.<env> TEST_POOL_STANDARD |
| readonly | read-only | 2 | qa/.env.<env> TEST_POOL_READONLY |
| perf-users | order clerk | 20 | qa/.env.perf TEST_POOL_PERF |

## PII rules
- Synthetic only (faker); never sample production. Reviewed 2026-09-05.

## Per-env notes
- uat: factories enabled; perf pool absent (load runs on perf-env).

## Open conflicts
- none
