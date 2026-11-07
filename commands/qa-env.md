---
description: Preflight an environment per type before runs: env vars, reachability, DB, tooling, authorization. No secrets.
argument-hint: <env>
disable-model-invocation: true
---

Follow `qa-phase-protocol` (invoke the skill if it is not already in context); this file holds only what is specific to this command.

> Profile first, by section (`profile.mjs`) — `§Environments` (env table + authorization columns),
> `§Test types`. QA root defaults to `<qa-root>/` (profile-overridable).

Check environment `$ARGUMENTS` (default: the `§Environments` default env). Recommended before the
first `/qa-run` of a session and whenever runs fail with SETUP/ENV triage class.

## Preconditions (check before delegating)

- [ ] `$ARGUMENTS` appears in the `§Environments` table (unknown env → STOP)

A missing `<qa-root>/.env.$ARGUMENTS` is not a stop — it becomes the report's first FAIL with the fix.

## Safety rule (hard constraint)

Probes are read-only: HTTP GET/HEAD, driver-level DB connectivity, tool `--version` checks.
No writes, no scans, no logins with real credentials. Secret values never appear in the report or
chat — presence and reachability only.

## Execution

Delegate to the `qa-reporter` agent (it invokes the `checking-environment` skill). Output
`<qa-root>/runs/env-checks/$ARGUMENTS/<run-id>/readiness.md`:

- Per-check PASS/FAIL table (variables per enabled type incl. accessibility/`PW_PROJECTS`, URL
  reachability, DB probe, tooling incl. Playwright browsers per project and `@axe-core/playwright`).
- Security/performance authorization verdicts straight from `§Environments` — a `no` column makes
  the type BLOCKED regardless of variables, naming the env that IS authorized.
- A runnable verdict per enabled type and aggregated `> **Project setup required:**` fixes.

## Done criteria

Report back: READY types, NOT-READY types with their first blocking fix, BLOCKED types with the
authorized alternative, and whether `/qa-run` can proceed now.
