# API / integration spec templates

The compiled, running versions of these shapes are in the bundle repo at
`tests/golden/qa/scripts/{api,integration,security}/projects/` — they run green at 6 workers,
shuffled, and as 3 shards. These templates use a hypothetical `orders` module; the golden module is
`projects`. Every spec imports the ONE `test` from `shared/fixtures` and gets services, factories
and actors as fixtures.

## Module files the first case bootstraps

```ts
// shared/endpoints/orders.endpoints.ts — the ONLY place the module's URL paths are written
export const ORDERS = { list: '/orders', byId: (id: string) => `/orders/${id}` } as const;

// shared/services/orders.service.ts — one method per operation; never asserts, never cleans up
export class OrdersService {
  constructor(private readonly api: ApiClient) {}
  create(body: unknown) { return this.api.post<Order & Problem>(ORDERS.list, { data: body }); }
  get(id: string) { return this.api.get<Order & Problem>(ORDERS.byId(id)); }
  list(params: { reference?: string } = {}) { return this.api.get<{ items: Order[] }>(ORDERS.list, { params }); }
  remove(id: string) { return this.api.delete(ORDERS.byId(id)); }
}

// shared/data/orders.factory.ts — valid payloads + created entities that clean themselves up
export class OrdersFactory {
  constructor(private readonly svc: OrdersService, private readonly cleanup: Cleanup) {}
  build(overrides: Partial<OrderInput> = {}): OrderInput {
    return { reference: uniqueName('order'), quantity: 1, ...overrides };   // never Date.now()
  }
  async create(overrides: Partial<OrderInput> = {}): Promise<Order> {
    const res = await this.svc.create(this.build(overrides));
    if (res.status !== 201) throw new Error(`setup: create order → HTTP ${res.status} ${res.text}`);
    this.cleanup.add(`order ${res.body.reference}`, () => this.svc.remove(res.body.id));
    return res.body;
  }
}

// shared/fixtures/orders.fixture.ts — then add `ordersFixtures` to mergeTests in fixtures/index.ts
export const ordersFixtures = ui.extend<{
  orders: OrdersService;
  ordersAs: (s: Session | string | ApiClient) => Promise<OrdersService>;
  ordersFactory: OrdersFactory;
}>({
  orders: async ({ api }, use) => use(new OrdersService(api)),
  ordersAs: async ({ as }, use) => use(async (s) => new OrdersService(s instanceof ApiClient ? s : await as(s))),
  ordersFactory: async ({ as, cleanup }, use) => use(new OrdersFactory(new OrdersService(await as('owner')), cleanup)),
});
```

## single — one intent, steps as `test.step`

```ts
import { test, expect, expectSchema, caseMeta } from '../../shared/fixtures';

test('TC-API-ORDERS-004 — a created order reads back and deletes', caseMeta({
  id: 'TC-API-ORDERS-004', type: 'api', module: 'orders', priority: 'P1', req: ['checkout/REQ-014'],
}), async ({ ordersAs, ordersFactory, cleanup }) => {
  const owner = await ordersAs('owner');
  const input = ordersFactory.build({ quantity: 3 });                     // from the case's ## Data

  const created = await test.step('Step 1: create → 201 + the documented body', async () => {
    const res = await owner.create(input);
    await expectSchema(res, 'createOrder', 201);
    expect(res.body).toMatchObject({ reference: input.reference, quantity: 3, status: 'Open' });
    cleanup.add(`order ${res.body.reference}`, () => owner.remove(res.body.id));   // registered at creation
    return res.body;
  });

  await test.step('Step 2: read-back → persisted values match', async () => {
    const res = await owner.get(created.id);                              // independent GET — verify deep
    await expectSchema(res, 'getOrder', 200);
    expect(res.body).toEqual(created);
  });

  await test.step('Step 3: delete → 204, then 404', async () => {
    expect((await owner.remove(created.id)).status).toBe(204);
    expect((await owner.get(created.id)).status).toBe(404);
  });
});
```

The 401 axis is NOT a step of this case — it is a row of the security matrix (or its own case):
`(await ordersAs(anonymous)).get(id)` → 401.

## table-driven rows — one intent, N parallel tests

```ts
type Row = { id: string; technique: 'EP' | 'BVA' | 'error-guess'; label: string; body: (ref: string) => unknown; status: number; field?: string; code?: string };
const ROWS: readonly Row[] = [                                            // every value verbatim from the case
  { id: 'a', technique: 'BVA', label: 'quantity 0 (min − 1)', body: (r) => ({ reference: r, quantity: 0 }), status: 422, field: 'quantity', code: 'min' },
  { id: 'b', technique: 'BVA', label: 'quantity 1 (min)',     body: (r) => ({ reference: r, quantity: 1 }), status: 201 },
  { id: 'c', technique: 'EP',  label: 'reference missing',    body: () => ({ quantity: 1 }),               status: 422, field: 'reference', code: 'required' },
  { id: 'd', technique: 'error-guess', label: 'body is an array', body: () => [],                           status: 400 },
];

for (const row of ROWS) {
  test(`TC-API-ORDERS-005 — row ${row.id}: ${row.label} → ${row.status}`, caseMeta({
    id: 'TC-API-ORDERS-005', type: 'api', module: 'orders', priority: 'P1', req: ['checkout/REQ-014'],
  }), async ({ ordersAs, ordersFactory, cleanup }) => {
    const owner = await ordersAs('owner');
    const res = await owner.create(row.body(ordersFactory.build().reference));
    if (res.status === 201) cleanup.add('order', () => owner.remove(res.body.id)); // eslint-disable-line playwright/no-conditional-in-test -- cleanup only, never an assertion
    await expectSchema(res, 'createOrder', row.status);                   // a 500 is a FUNCTIONAL finding, never a tolerated row
    expect(res.body.errors ?? []).toEqual(row.field ? [expect.objectContaining({ field: row.field, code: row.code })] : []);
  });
}
```

## integration seam — one actor writes, another reads, the DB agrees

```ts
test('TC-INT-ORDERS-007 — an order placed by a member is what billing sees', caseMeta({
  id: 'TC-INT-ORDERS-007', type: 'integration', module: 'orders', priority: 'P1', req: ['checkout/REQ-020'],
}), async ({ pool, ordersFactory, ordersAs, db }) => {
  const [account] = pool;                                                 // this worker's own account
  const order = await ordersFactory.create();

  await test.step('Step 1: the order row is persisted with status Open', async () => {
    test.skip(!db.configured, 'DB_CONNECTION is not set for this environment');
    const row = await db.queryOne('SELECT status FROM orders WHERE id = @id', { id: order.id });
    expect(row?.status).toBe('Open');
  });
  // …
});
```

## double-submit / idempotency

```ts
test('TC-API-ORDERS-006 — two identical POSTs in parallel persist one order', caseMeta({ /* … */ }), async ({ ordersAs, ordersFactory, cleanup }) => {
  const owner = await ordersAs('owner');
  const body = ordersFactory.build();
  const [a, b] = await Promise.all([owner.create(body), owner.create(body)]);
  for (const r of [a, b].filter((x) => x.status === 201)) cleanup.add('order', () => owner.remove(r.body.id));
  expect([a.status, b.status].sort()).toEqual([201, 409]);               // the case's contract
  const list = await owner.list({ reference: body.reference });
  expect(list.body.items).toHaveLength(1);                                // read-back count, not the responses
});
```

## async 202 + polling

```ts
const job = await pollUntil(() => exports.status(submitted.body.jobId),
  { every: TIMEOUTS.POLL_INTERVAL, timeout: TIMEOUTS.POLL_MAX, until: (r) => ['completed', 'failed'].includes(r.body.state) });
expect(job.body.state).toBe('completed');
await expectSchema(job, 'getExportJob', 200);
```

## Anti-patterns these replace

| Old | Now |
|---|---|
| `test.describe.serial` + `let id` shared across tests | one `test()` with `test.step`s; `const created = await test.step(…, async () => … return res.body)` |
| `test.afterAll(({ orderService }) => …)` | `cleanup.add()` at creation — `afterAll` cannot use test-scoped fixtures, and serial teardown leaks on failure |
| `const stamp = Date.now()` | `uniqueName('order')` / `factory.build()` |
| `apiClient`, `anonymousClient`, `asRole('x')` | `api` (TEST_USER), `as('owner')` / `as(pool[0])`, `anonymous`, `<module>As(…)` |
| `{ tag: ['@api', …, '@req:REQ-014'] }` | `caseMeta({ …, req: ['<slug>/REQ-014'] })` |
| `try { … } finally { delete… }` | the ledger runs after the test whatever happened, newest first |
