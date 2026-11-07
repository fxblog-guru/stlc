# Element registry

**Test-id convention:** `data-testid="<page>-<element>-<role>"`

## Orders list (`/orders`)

| Element | Locator | Notes |
|---|---|---|
| Orders table | `getByRole('table', { name: 'Orders' })` | |
| New order button | `getByTestId('orders-new-btn')` | |

## New order form (`/orders/new`)

| Element | Locator | Notes |
|---|---|---|
| Customer picker | `getByLabel('Customer')` | |
| Save button | `getByTestId('order-save-btn')` | |

## Order detail (`/orders/:id`)

| Element | Locator | Notes |
|---|---|---|
| Status badge | `getByTestId('order-status-badge')` | |
