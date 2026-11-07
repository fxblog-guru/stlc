# Case path → TMS container mapping (optional)

<!-- Used by /qa-publish. Only needed when PROJECT-PROFILE §Test management is azure-devops or jira.
     One row per <qa-root>/cases/ subtree; most-specific prefix wins. Mirror the table in
     .claude/skills/publishing-test-cases/scripts/lib.mjs (TYPES / TYPE_SEGMENT / MODULE_SEGMENT). -->

## Azure DevOps — Area Path

| Case path prefix | Area path |
|---|---|
| `cases/unit/<module>` | `<Project>\\<Team>\\<Module>\\Unit` |
| `cases/api/<module>` | `<Project>\\<Team>\\<Module>\\API` |
| `cases/integration/<module>` | `<Project>\\<Team>\\<Module>\\Integration` |
| `cases/e2e/<module>` | `<Project>\\<Team>\\<Module>` |
| `cases/security/<module>` | `<Project>\\<Team>\\<Module>\\Security` |
| `cases/performance/<module>` | `<Project>\\<Team>\\<Module>\\Performance` |
| `cases/accessibility/<module>` | `<Project>\\<Team>\\<Module>\\Accessibility` |
| `cases/mobile/<module>` | `<Project>\\<Team>\\<Module>\\Mobile` |

## Jira — project · issue type · component · labels

| Case path prefix | Project key | Issue type | Component | Labels |
|---|---|---|---|---|
| `cases/<type>/<module>` | `<KEY>` (or `JIRA_PROJECT_KEY`) | `Test` (or `JIRA_CASE_ISSUE_TYPE`) | `<Module>` | `qa-case`, `type:<type>`, `agentic-created` |

<!-- Jira has no area path: the container is project + issue type; routing is component + labels.
     Test-management add-ons (Xray, Zephyr) expose their own "Test" issue type — name it in
     JIRA_CASE_ISSUE_TYPE; the adapter creates that issue type and never invents fields it cannot see. -->
