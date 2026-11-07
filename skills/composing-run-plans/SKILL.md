---
name: composing-run-plans
description: Use for /qa-run-plan: a prompt into a run plan (saved case selection), or the standard set (full, smoke, regression, feature-*, release-*).
version: 1.0.0
---

# Composing Run Plans

> Profile first, by section (`profile.mjs`) — `§Test types` (enabled types), `§Environments` (default
> env; which envs authorize security and performance), `§Browsers & devices`. QA root defaults to
> `<qa-root>/`. Contract: CONTRACTS §19 (the file), §3 (re-verify rows), §6 (suite tags), §12 (quarantine).

## Prime directive — a run plan selects; it never invents
A run plan is a named query over the cases that exist: `<qa-root>/run-plans/<name>.md`, front matter that
selects, a `## Resolved cases` table the resolver writes. Every id, slug, module and type in it is
read from the workspace. Nothing is guessed: a slug without a plan, a module with no cases, an id
with no case file is a question to the user, never a line in the file.

**Not the test plan.** `<qa-root>/plans/<slug>/…-test-plan.md` is the feature's planning document (scope,
gates, traceability). A run plan is what you pick and execute — across features and types — like a
TestRail or Azure DevOps test run. Say so when the user mixes the two.

**Not curation.** `/qa-regression` decides which cases carry `@smoke` / `@regression`. Run plans
select BY those tags (`select.suites`); they never add, remove or duplicate them.

## Action
- **Prompt mode** (`/qa-run-plan <name> "<prompt>"`): translate the prompt into front matter, resolve,
  show the counts, write `<qa-root>/run-plans/<name>.md`.
- **Standard mode** (`/qa-run-plan --standard [--release <id> --features a,b]`): write or refresh the
  standard set with `node scripts/shared/run-plan.mjs standard`.
- **List mode** (`/qa-run-plan --list`): `node scripts/shared/run-plan.mjs list`.

## Inputs — resolve before writing (STOP conditions)
1. `<name>` lowercase-kebab (`orders-invoices-p1`, not `Orders P1`). Suggest one; never rename silently.
2. The vocabulary that exists, read from the workspace — not from memory:
   - slugs = folders under `<qa-root>/plans/` holding a `*-test-plan.md`
   - modules = folders under `<qa-root>/cases/<type>/`
   - types = `§Test types` rows with `Enabled = yes`, minus `unit` and `mobile` (their own repos;
     `/qa-run --type unit|mobile` runs them)
3. No case files at all → STOP: "nothing to select yet — `/qa-design` first".

## Prompt mode

### Step 1: Map the prompt to keys
| Prompt says | Key |
|---|---|
| a feature / story / slug ("the orders feature") | `select.features` (brings its re-verify rows too) |
| a module ("orders and invoices", when they are module folders) | `select.modules` |
| api · integration · e2e · ui · security · authz · perf · load · a11y | `select.types` (`ui` → `e2e`, `authz` → `security`, `load` → `performance`) |
| "P0/P1", "critical", "high priority" | `select.priorities` (`critical` → P0, `high` → P0+P1) |
| smoke · regression · nightly | `select.suites` |
| an id ("TC-API-ORDERS-001") | `select.cases` — only ids that have a case file |
| "except X", "no perf", "skip a11y" | `exclude.<key>` |
| "include quarantined" | `exclude.quarantined: false` (default `true`) |
| an env ("on uat") | `env` |
| "3 shards", "4 workers" | `shards`, `workers` |
| browsers ("chrome and firefox", "mobile Safari") | `browsers` (`chromium`, `firefox`, `webkit`, `mobile-chrome`, `mobile-safari`) |

Keys inside `select` are AND-ed, values OR-ed. When the prompt mixes two independent selections
("all P0 orders cases, and every security case"), put the second in `include:` (same keys, OR-ed
with `select`). `retries` is always `0`.

A word that is both a slug and a module (`orders` is often both) → prefer `modules` when the prompt
talks about an area of the product, `features` when it talks about a change or a release; if the
prompt does not say, that is the one question below.

### Step 2: One question, only when it changes the selection
Ask **one** question with a recommended default when the prompt is ambiguous in a way that changes
which cases run (slug vs module, an env that is not listed, a type that is disabled). Example:
> "orders" is both a feature and a module. Feature = its 14 own cases + 3 re-verify rows; module =
> all 21 cases in `cases/*/orders/`. **Recommended: module** — the prompt says "orders and invoices",
> which are areas, not changes. Reply `feature` to switch.

Never ask about something that does not change the selection; pick the default and say so.

### Step 3: Authorization before writing
Security or performance selected and the plan's env is not authorized for it in `§Environments` →
do not write a plan that would be refused: offer (a) an authorized env, (b) excluding the type.
The runner refuses anyway (CONTRACTS §9.5); the skill refuses earlier.

### Step 4: Write, resolve, show
1. Write `<qa-root>/run-plans/<name>.md`:
   ```markdown
   ---
   name: orders-invoices-p1
   description: P0/P1 orders and invoices, api + e2e — the pre-release check.
   env: uat
   select:
     modules: [orders, invoices]
     types: [api, e2e]
     priorities: [P0, P1]
   exclude:
     quarantined: true
   browsers: [chromium]
   shards: 3
   retries: 0
   ---

   # Run plan — orders-invoices-p1

   <one paragraph: what it is for, when it runs, who reads the result>
   ```
2. `cd qa && node scripts/shared/run-plan.mjs resolve <name>` — writes `## Resolved cases`.
   Exit 1 = a selected case has no script and is not `@manual`: report the ids, suggest
   `/qa-script` or an `exclude.cases` entry; never delete the file to hide it.
3. `npm run qa:lint` — the run-plan checks (unknown key, name, retries, missing or deprecated ids).
4. Show the count by type, module and priority from the table, and the excluded list with reasons
   (quarantined, deprecated, disabled type, other runner). Zero cases is a finding — say which key
   emptied it.

## Standard mode
`node scripts/shared/run-plan.mjs standard [--release <id> --features a,b]` writes:

| Plan | Selects | Shards | Typical trigger |
|---|---|---|---|
| `full` | every enabled type, every non-deprecated, non-quarantined case | 4 | on demand, pre-release |
| `smoke` | `@smoke` in the functional types; browsers `chromium`; budget ≤ 10 min | 1 | every MR/PR (CI) |
| `regression` | `@regression` + every P0/P1 in the functional types | 4 | nightly (CI) |
| `feature-<slug>` | one per planned feature: its cases + its re-verify rows | 1 | `/qa-plan`, `/qa-run --plan` |
| `release-<id>` | `--features` with their re-verify rows, P0–P2; security / performance only if the default env authorizes them | 2 | before `/qa-signoff` |

Idempotent: a re-run regenerates `select`/`include`/`exclude` and the table, and **keeps** a human's
`description`, `env`, `owner`, `browsers`, `workers` and `shards`, and the body text above
`## Resolved cases`. A plan someone wrote by hand under another name is never touched. Smoke and
regression budgets come from `/qa-regression`'s manifest — if `smoke` resolves to more than the
manifest's @smoke list, the manifest and the tags disagree: report it, do not edit tags.

## Step 5: Report ONLY this summary to chat
```
✓ Wrote <qa-root>/run-plans/<name>.md — <n> cases: api <a> · e2e <e> · … | modules: <m…> | P0 <x> · P1 <y> …
  env <env> · shards <s> · browsers <b> | excluded: quarantined <q> · deprecated <d> · other runner <o>
  (standard mode: one line per plan written)
Next: /qa-run --plan <name>
```

## Done — ALL must be true
- [ ] Every id, slug, module and type in the file exists in the workspace; nothing invented.
- [ ] At most one question asked, with a recommended default; defaults taken are stated.
- [ ] `retries: 0`; security/performance only with an authorized env.
- [ ] `## Resolved cases` written by `run-plan.mjs resolve`; `qa:lint` clean for the file.
- [ ] Suite tags untouched; standard mode kept every human-edited key.
- [ ] Exactly one next command named: `/qa-run --plan <name>`.
