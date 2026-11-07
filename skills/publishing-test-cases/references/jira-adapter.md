# Jira adapter — publishing cases and defects through the Atlassian MCP

The Azure DevOps scripts in `../scripts/` are the reference implementation. Jira is supported
through the **Atlassian MCP connector** (no PAT in `<qa-root>/.env.<env>`, no bespoke REST script) with
the same four-step contract: resolve the container → confirm → upsert by existing id → write the
REAL id back. Everything below is read-only until the user confirms the exact list.

## Configuration (PROJECT-PROFILE §Test management → `jira`)

| Key (in `<qa-root>/.env.<env>` or the profile) | Meaning | Default |
|---|---|---|
| `JIRA_PROJECT_KEY` | destination project | — (required) |
| `JIRA_CASE_ISSUE_TYPE` | issue type for test cases (`Test` with Xray/Zephyr; `Task` for a plain project) | `Test` |
| `JIRA_BUG_ISSUE_TYPE` | issue type for defects | `Bug` |
| `<qa-root>/config/tms/mapping-path.md` → Jira table | component + labels per `cases/<type>/<module>` | labels `qa-case`, `type:<type>`, `agentic-created` |

The MCP tools used: `getVisibleJiraProjects` (resolve the project + cloudId), `getJiraProjectIssueTypesMetadata`
/ `getJiraIssueTypeMetaWithFields` (confirm the issue type and its required fields — never invent a
field), `searchJiraIssuesUsingJql` (dedupe), `createJiraIssue`, `editJiraIssue`, `addCommentToJiraIssue`,
`getJiraIssue` (write-back verification / ticket snapshot).

## Step 1 — Resolve the container (read-only)
1. `getVisibleJiraProjects` → the project matching `JIRA_PROJECT_KEY` (STOP if not visible).
2. `getJiraProjectIssueTypesMetadata` → confirm `JIRA_CASE_ISSUE_TYPE` exists; `getJiraIssueTypeMetaWithFields`
   → list required fields. A required field the bundle cannot derive (e.g. a mandatory custom
   field) → STOP and ask the user for its value; never guess.
3. Per case: component = the module's row in the Jira table of `mapping-path.md` (missing → labels
   only, flagged), labels = `qa-case`, `type:<type>`, `agentic-created`, plus `req:REQ-###` per `@req:`.

## Step 2 — Dedupe + plan (read-only)
`searchJiraIssuesUsingJql` with `project = <KEY> AND summary ~ "\"TC-API-ORDERS-001\""` (the local id is
the summary prefix) and by the case's existing `@tms:<KEY-n>` tag. Existing → **update**, else
**create**. Print the per-component plan: create N · update M · blocked K (with reasons). Wait for
explicit approval (CONTRACTS §9.9).

## Step 3 — Upsert (only after approval)
Field map for `createJiraIssue` / `editJiraIssue`:

| Jira field | From the case |
|---|---|
| `summary` | `TC-<TYPE>-<MODULE>-<NNN> — <title>` |
| `issueTypeName` | `JIRA_CASE_ISSUE_TYPE` |
| `description` | Markdown → the connector's content format (`getContentFormatGuide`): **Feature** / **Plan** / **Priority** · **Preconditions** (list) · **Steps** (numbered `Action` → `Expected`) · **Expected Result** · type sections (`OWASP ref`, `Workload`/`SLOs`, `Subject` + `Test matrix`, `WCAG ref`/`Scope`) · **Data** · `Source: <qa-root>/cases/<path>` |
| `priority` | `P0 → Highest`, `P1 → High`, `P2 → Medium`, `P3 → Low` |
| `labels` | Step 1 labels (+ `manual` for `@manual`, `quarantined` while `@quarantined:`) |
| `components` | Step 1 component when present |
| Xray/Zephyr step fields | ONLY when `getJiraIssueTypeMetaWithFields` shows them and the user confirms the mapping; otherwise steps stay in the description |

Canary first: push ONE case, `getJiraIssue` it back, show the key; then the rest. Rate: sequential,
never parallel bulk.

## Step 4 — Write-back
For every created/updated issue: append `@tms:<KEY-n>` to the case's `**Tags:**` line (slot order;
idempotent), and add a `## TMS link` line `https://<site>/browse/<KEY-n>` under the case's header.
Only a key returned by the API is written — never derived from the NNN.

## Defects (`/qa-defect` Step 6, TMS = jira)
Same gates. `createJiraIssue` with `issueTypeName` = `JIRA_BUG_ISSUE_TYPE`, `summary` = `DEF-<slug>-NNN — <title>`,
description = Steps to reproduce / Expected / Actual / Evidence paths / Impact / `Origin`, priority
from severity (`Critical → Highest`, `High → High`, `Medium → Medium`, `Low → Low`), labels
`agentic-created`, `qa-defect`, `origin:<internal|escaped|exploratory>`, `feature:<slug>`; link to the
case's `@tms:` issue with `createIssueLink` ("Tests") when both exist. Write back `**Tags:** @tms-bug:<KEY-n>`.
Recurrence on an already-pushed defect → `addCommentToJiraIssue` (run-id · env · date) after
confirmation. Never `transitionJiraIssue`, never edit fields of an issue the bundle did not create.

## Reading tickets (analyzing-docs · analyzing-escaped-defects)
`getJiraIssue <KEY>` → save `<qa-root>/analysis/<slug>/sources/<KEY>.md` (summary, description, acceptance
criteria, status, reporter role, created/updated, linked issues, attachment names). The analysis
cites `<KEY> § <field or heading>`; the ticket itself is never edited by a read.

## Failure modes → what to say
- Connector not authorized → "Atlassian MCP needs authorization in claude.ai connector settings"; do
  not fall back to pasting credentials into chat.
- Project/issue type not visible → STOP with the exact name tried.
- Required custom field → ask for the value once; store the mapping in `mapping-path.md` for next time.
