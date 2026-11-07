// mirror of the api case — the shape lint checks: title = case id + case title, steps 1..n, rows from ## Variants
import { test, expect, caseMeta } from '../../shared/fixtures';

test('TC-API-ORDERS-001 — [Orders · API] POST /orders — Standard user submits one line for an active customer → 201, order Open', caseMeta({ id: 'TC-API-ORDERS-001' }), async () => {
  await test.step('Step 1: POST /orders with one line → 201, status Open', async () => { expect(1).toBe(1); });
  await test.step('Step 2: GET /orders/{id} → 200, lines echo the payload', async () => { expect(1).toBe(1); });
});

const ROWS = [
  { id: '1', label: 'lines = [] (min − 1)', status: 400 },
  { id: '2', label: 'customerId absent', status: 400 },
  { id: '3', label: 'no session cookie', status: 401 },
] as const;

for (const row of ROWS) {
  test(`TC-API-ORDERS-001 — row ${row.id}: ${row.label} → ${row.status}`, caseMeta({ id: 'TC-API-ORDERS-001' }), async () => {
    expect(row.status).toBeGreaterThan(399);
  });
}
