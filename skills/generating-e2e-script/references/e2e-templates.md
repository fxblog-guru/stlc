# E2E spec templates

The running versions are in the bundle repo at `tests/golden/qa/scripts/e2e/projects/` (and the
page object / fixture under `tests/golden/qa/scripts/shared/`). `node tests/golden/run.mjs` runs
them at 6 workers, shuffled, and as 3 shards against a session+CSRF demo app.

## Page object + domain fixture (what the first e2e case of a module bootstraps)

```ts
// shared/pages/orders/orders.page.ts — locators + actions; composes components; never asserts outcomes
export class OrdersPage extends BasePage {
  readonly path = '/orders';
  readonly urlPattern = /\/orders(\?|$)/;
  readonly table = new DataTable(this.page, 'Orders');            // by accessible name
  readonly newOrderDialog = new Dialog(this.page, 'New order');

  protected anchor(): Locator { return this.byRole('heading', 'Orders'); }
  get newOrderButton(): Locator { return this.byRole('button', 'New order'); }

  async createOrder(o: { customer: string; reference: string }): Promise<void> {
    await this.newOrderButton.click();
    await this.newOrderDialog.fill({ Customer: o.customer, Reference: o.reference });
    await this.newOrderDialog.press('Create');
  }
}

// shared/fixtures/orders.fixture.ts — add to mergeTests in fixtures/index.ts
export const ordersFixtures = ui.extend<{
  ordersPage: OrdersPage;
  ordersPageAs: (s: Session | string) => Promise<OrdersPage>;
  /* + orders, ordersAs, ordersFactory — see generating-api-script */
}>({
  ordersPage: async ({ page }, use) => use(new OrdersPage(page)),
  ordersPageAs: async ({ pageAs }, use) => use(async (s) => new OrdersPage(await pageAs(s))),
});
```

Golden: `shared/pages/projects/projects.page.ts`, `shared/fixtures/projects.fixture.ts`,
`workspace/qa/scripts/shared/components/{dialog,data-table}.component.ts`.

## Negative UI case — what the user sees when input is refused

```ts
test('TC-E2E-PROJECTS-002 — an empty name is refused in the dialog', caseMeta({
  id: 'TC-E2E-PROJECTS-002', type: 'e2e', module: 'projects', priority: 'P1', req: ['demo/REQ-001'],
}), async ({ projectsPage }) => {
  await projectsPage.goto();
  await projectsPage.createProject('');

  await expect(projectsPage.newProjectDialog.error).toHaveText('Name is required (1 to 80 characters).');
  await expect(projectsPage.newProjectDialog.field('Name')).toHaveAttribute('aria-invalid', 'true');
  await expect(projectsPage.newProjectDialog.field('Name')).toBeFocused();
});
```

## Structure — aria snapshot, not pixels

```ts
}), async ({ projectsPage, projectsFactory, page }) => {
  await projectsFactory.create();                 // a row exists, with a unique name
  await projectsPage.goto();
  await expect(page.getByRole('main')).toMatchAriaSnapshot(`
    - heading "Projects" [level=1]
    - button "New project"
    - paragraph: /\\d+ projects?/
    - table "Projects":
      - rowgroup:
        - row "Name Your role Members":
          - columnheader "Name"
          - columnheader "Your role"
          - columnheader "Members"
  `);
});
```

Generated values (names, counts, dates) are matched with a regex, never a literal. Golden:
`e2e/projects/TC-E2E-PROJECTS-004-list-structure.spec.ts`.

## Time — the Clock API

```ts
}), async ({ page, sessionsPage }) => {
  await page.clock.install({ time: new Date('2026-03-01T09:00:00Z') });   // before the app loads
  await sessionsPage.goto();
  await test.step('Step 2: after 30 idle minutes the session-expiry warning shows', async () => {
    await page.clock.fastForward('30:00');
    await expect(sessionsPage.expiryWarning).toBeVisible();
  });
});
```

`setFixedTime` for "today is …" rendering; `fastForward`/`runFor` for timers. Never
`waitForTimeout`, never a mocked global `Date` in the app bundle.

## Anti-patterns these replace

| Old | Now |
|---|---|
| `test.describe(…, { tag: ['@e2e', …, '@req:REQ-012'] }, () => { … })` | `test('<ID> — …', caseMeta({ …, req: ['<slug>/REQ-012'] }), …)` |
| `const orders = new OrdersPage(page)` | `async ({ ordersPage }) => …` — injected by the module fixture |
| `customerClient.create(request, { name: \`QA ${Date.now()}\` })` | `customersFactory.create()` — unique name + cleanup registered |
| `const created = []` + `test.afterEach(…)` | the `cleanup` ledger; `cleanup.add` for what the UI creates |
| a UI login step | `test.use({ storageState: storageStateFile('owner') })` or `<module>PageAs(actor)` |
| `page.locator('.modal .btn-primary')` | `ordersPage.newOrderDialog.press('Create')` |
| `toHaveScreenshot()` for "the table has these columns" | `toMatchAriaSnapshot` |
