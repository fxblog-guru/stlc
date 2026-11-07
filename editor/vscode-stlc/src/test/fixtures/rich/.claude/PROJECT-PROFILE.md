# Project profile

- **Name:** `Sample Orders App`

## Test types

| Type | Enabled | Tool (default) | Output |
|---|---|---|---|
| `unit` | yes | vitest | qa/cases/unit/ |
| `api` | yes | Playwright API | qa/cases/api/ |
| `integration` | yes | Playwright API + DB | qa/cases/integration/ |
| `e2e` | yes | Playwright | qa/cases/e2e/ |
| `security` | yes | ZAP | qa/cases/security/ |
| `performance` | no | k6 | qa/cases/performance/ |
| `accessibility` | yes | axe | qa/cases/accessibility/ |
| `mobile` | yes | Appium | qa/cases/mobile/ |
