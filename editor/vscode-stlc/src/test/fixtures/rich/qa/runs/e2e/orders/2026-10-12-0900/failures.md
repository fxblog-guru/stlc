# Failures — e2e — orders — 2026-10-12-0900

## TC-E2E-ORDERS-001 — scripts/e2e/orders/TC-E2E-ORDERS-001-x.spec.ts
- **Step:** 4
- **Error:** `expect(locator).toBeVisible()` — the new order row never appeared
- **Artifacts:** test-results/orders-create/trace.zip
- **Suspected cause:** FUNCTIONAL — the list query omits orders created in the last second
- **Next step:** /qa-defect orders
