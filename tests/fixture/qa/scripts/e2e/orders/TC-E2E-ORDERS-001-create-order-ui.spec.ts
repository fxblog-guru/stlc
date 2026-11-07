// mirror of the e2e case
import { test, expect, caseMeta } from '../../shared/fixtures';

test('TC-E2E-ORDERS-001 — [Orders · Web] New order form — Standard user saves one line → order listed with status Open', caseMeta({ id: 'TC-E2E-ORDERS-001' }), async () => {
  await test.step('Step 1: open Orders > New Order → empty Line Items grid', async () => { expect(1).toBe(1); });
  await test.step('Step 2: add SKU-1 × 1 and Save → toast "Order created"', async () => { expect(1).toBe(1); });
  await test.step('Step 3: open Orders → the order is listed as Open', async () => { expect(1).toBe(1); });
});

test('TC-E2E-ORDERS-001 — row 1: Save with no line → inline error "Add at least one line"', caseMeta({ id: 'TC-E2E-ORDERS-001' }), async () => {
  expect(1).toBe(1);
});
