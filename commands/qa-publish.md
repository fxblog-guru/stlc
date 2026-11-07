---
description: Push designed cases to the TMS (Azure DevOps or Jira) after confirmation; write @tms ids back.
argument-hint: <slug> [--env <env>]
disable-model-invocation: true
---

Follow `qa-phase-protocol` (invoke the skill if it is not already in context); this file holds only what is specific to this command.

> Profile first, by section (`profile.mjs`) — §Test management decides whether this command is
> available at all, and defines the TMS specifics; the QA root defaults to `<qa-root>/`
> (profile-overridable).

Publish the test cases for feature `<slug>` (first token of `$ARGUMENTS`) into the project's test
management system. **Optional command** — built-in targets: Azure DevOps Test Plans (reference
scripts) and Jira (Atlassian MCP, `publishing-test-cases/references/jira-adapter.md`).

## Availability gate (check FIRST)

Read §Test management. If it is `none`, absent, or names a TMS other than `azure-devops` / `jira`,
STOP and tell the user this command is not available for this project (the Adapter seam in the skill
explains how to add one) — cases remain fully usable from `<qa-root>/cases/` without a TMS.

## Preconditions (check before pushing anything)

- [ ] Cases exist for `<slug>` — locate via the plan's `## Traceability (Requirement ↔ Case)`
      table, fallback grep `**Feature:** <slug>` under `<qa-root>/cases/`; **NEVER glob `<slug>.md`
      filenames** (cases are named by TC id)
- [ ] **azure-devops:** `<qa-root>/.env.<env>` exists (`<env>` from `--env`, else the default in
      §Environments) and provides `ADO_BASE_URL` (org/project URL — never hardcoded), `TMS_ADO_PAT`
      (token), and an EXISTING `PLAN_ID` + `SUITE_ID` (the user may also paste plan/suite ids in
      chat). Optional with defaults: `ADO_PROJECT`, `ADO_AREA_ROOT`. **Never create a plan or suite.**
- [ ] **jira:** the Atlassian MCP connector is authorized, `JIRA_PROJECT_KEY` names a visible project,
      and `JIRA_CASE_ISSUE_TYPE` (default `Test`) exists there; required custom fields are asked once.

If any value is missing, STOP and list exactly which `.env` keys the user must fill in
`<qa-root>/.env.<env>` (copy from `<qa-root>/.env.example`).

## Flow — invoke the `publishing-test-cases` skill; it owns the logic

1. **Resolve containers** — the skill maps each case (from its `<type>/<module>` placement) to its
   ADO area path under `ADO_AREA_ROOT` or its Jira component/labels (`<qa-root>/config/tms/mapping-path.md`),
   flags unmapped cases, and detects cases already pushed (existing `@tms:` tag / TMS link section /
   JQL hit → update, never duplicate).
2. **Per-container confirmation** — show the user the plan grouped per area path / component: which
   cases go where, what will be created vs updated. **Get explicit approval before any push**
   (CONTRACTS §9.9). A missing ADO area path is only created after its own second, explicit approval.
   No approval → nothing is pushed for that container.
3. **Push** — ADO: each case to ITS OWN area path, added to the existing plan/suite; Jira: one canary
   issue, verified by reading it back, then the rest sequentially.
4. **Write-back** — for every case pushed, the skill writes the REAL work-item id back into the
   case `.md`: a TMS link line and `@tms:<id>` appended to the `**Tags:**` line (idempotent —
   updated, not duplicated, on re-publish). `@tms:` tags carry only ids returned by the TMS —
   NEVER fabricate one from the case's NNN sequence number.

## Done criteria

Report back: plan/suite or project used, per-container counts (created / updated / skipped), every
`@tms:<id>` written back, any unmapped or unapproved cases left unpublished, and any area paths
created. Remind the user to rotate the PAT if it was ever pasted into chat.
