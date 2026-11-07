---
description: Create a run plan (saved case selection) from a prompt, or write the standard set; list plans.
argument-hint: <name> "<prompt>" | --standard [--release <id> --features a,b] | --list
disable-model-invocation: true
---

Follow `qa-phase-protocol` (invoke the skill if it is not already in context); this file holds only what is specific to this command.

> Profile first, by section (`profile.mjs`) — `§Test types`, `§Environments` (which envs authorize
> security and performance), `§Browsers & devices`. QA root defaults to `<qa-root>/`.

Build the plans once, then just trigger them. A **run plan** (`<qa-root>/run-plans/<name>.md`, CONTRACTS
§19) is a named, saved selection of cases across features and types — what TestRail or Azure DevOps
call a test run. It is NOT the feature's test plan (`<qa-root>/plans/<slug>/…-test-plan.md`), which is the
planning document; a run plan is what `/qa-run --plan <name>`, `npm run qa:plan:run -- <name>` and
the CI "run plan" job execute.

## Forms

| Form | Does |
|---|---|
| `/qa-run-plan <name> "<prompt>"` | e.g. `orders-invoices-p1 "P0/P1 orders and invoices, api + e2e, no perf, uat, 3 shards"` → front matter, resolve, write |
| `/qa-run-plan --standard` | writes or refreshes `full`, `smoke`, `regression`, one `feature-<slug>` per planned feature |
| `/qa-run-plan --standard --release <id> --features a,b` | adds `release-<id>`: those features + their re-verify rows, P0–P2 |
| `/qa-run-plan --list` | every run plan with its case count per type and whether its table is current |

## Preconditions (check before delegating)

- [ ] At least one case file exists under `<qa-root>/cases/` — otherwise there is nothing to select
- [ ] For a prompt: `<name>` is lowercase-kebab; the prompt names something that exists (a slug
      with a plan, a module folder, an enabled type, a real Case ID)

## Execution

Delegate to the `test-planner` agent (it invokes the `composing-run-plans` skill). Rules the skill
enforces: ids, slugs and modules are read from the workspace, never invented; one question at most,
with a recommended default, and only when the answer changes which cases run; `retries: 0`;
security/performance only on an env §Environments authorizes; `@smoke`/`@regression` are selected,
never written (that is `/qa-regression`); `## Resolved cases` comes from
`node scripts/shared/run-plan.mjs resolve <name>`, then `npm run qa:lint`.

## Done criteria

Report back: the file(s) written, case counts by type/module/priority, what was excluded and why,
the env and shards, and ONE next command: `/qa-run --plan <name>`.
