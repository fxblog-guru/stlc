# Element registry

<!-- Read by generating-e2e-script BEFORE any locator is written. Locator hierarchy:
     registry entry → data-testid → role/label. Never brittle CSS/XPath, never live-DOM
     guessing. Fill one table per page/screen as your app grows. -->

**Test-id convention:** `data-testid="<page>-<element>-<role>"` `<adjust to your app's convention>`

## <Page name> (`<route>`)

| Element | Locator | Notes |
|---|---|---|
| <e.g. Create order button> | `getByTestId('orders-create-btn')` | |
| <e.g. Order list table> | `getByRole('table', { name: 'Orders' })` | |
