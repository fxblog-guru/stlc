# Export recipes: getting cases out of each tool

`qa:import` reads CSV or JSON and finds columns by header name (`ALIASES` in
`scripts/shared/import-suite.mjs`). A row with no id and no title is read as one more step of the
case above, which is how most tools export one row per step. Menus move between versions, so if a
step below does not match the tool on screen, the goal is the same: **id, title, folder or
component, priority, and one row per step with its action and expected result**.

| Tool | Where | Columns it writes that `qa:import` reads |
|---|---|---|
| Jira + Xray | Test Repository → select folder → Export to CSV (or Xray "Export Test" for steps) | `Issue Key`, `Summary`, `Component`, `Priority`, `Action`, `Expected Result` |
| Jira + Zephyr Scale | Tests → select → Export → CSV | `Key`, `Name`, `Folder`, `Priority`, `Step`, `Expected Result` |
| Azure DevOps Test Plans | Test plan → suite → Export test cases to CSV | `ID`, `Title`, `Area Path`, `Priority`, `Test Step`, `Step Action`, `Step Expected` |
| TestRail | Test Suites & Cases → Export → CSV, layout "one row per step" | `ID` (C-prefixed), `Title`, `Section Hierarchy`, `Priority`, `Steps (Step)`, `Steps (Expected Result)` |
| Spreadsheet | Save each sheet as CSV (UTF-8) | rename headers to `ID`, `Title`, `Module`, `Priority`, `Step`, `Expected` |

Two rules for every export:
- **Keep the tool's own id column.** It is what links a script to a case (`PROJ-123`, `C2041`,
  `TestCase: 48211`), and what `@tms:` carries when a case is promoted.
- **Export with UTF-8.** Vietnamese, Japanese and other non-ASCII step text survive only that way.
