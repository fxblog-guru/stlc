---
name: publishing-test-cases
description: Use to publish cases to Azure DevOps or Jira after per-container confirmation, upserting by id, writing the @tms id back (/qa-publish).
version: 1.0.0
---

# Publishing test cases to a TMS Test Plan (Azure DevOps reference)

> Profile first, by section (`profile.mjs`) — `§Test management` names the TMS and the env vars; the
> QA root is `<qa-root>/` (used throughout below). **This command is OPTIONAL:** if `§Test management` is
> `none` (the default), STOP and report — there is nothing to publish to.
> Azure DevOps is the **reference implementation** (scripts below). **Jira** is supported through the
> Atlassian MCP connector — same flow, no scripts: follow `references/jira-adapter.md` when
> `§Test management → TMS` is `jira`. Any other TMS: the Adapter seam at the end.

Uploads the generated test cases from `<qa-root>/cases/**/TC-*.md` into an **existing** Azure DevOps Test Plan
suite as Test Case work items.

**The core problem this skill solves:** a batch of cases does **not** all belong to one area path —
`cases/api/orders/…` → `…\API Test Cases\Orders`, `cases/e2e/orders/…` → `…\E2E Test Cases\Orders`, and
so on (the exact tree is your project's `mapping-path.md`). Pushing them all to one default area would
scatter them wrongly. So we **resolve each case's area path first, confirm the plan with the user, create
any missing path, and only then push each case to its own path.**

> **Project setup required:**
> 1. Author `<qa-root>/config/tms/mapping-path.md` — the case-location → TMS-area-path table for YOUR area tree —
>    and mirror its rules in this skill's `scripts/lib.mjs` (`TYPES`, `SURFACES`, `MODULE_SEGMENT`,
>    `TYPE_SEGMENT`, `deriveAreaPath` — each is marked `PROJECT SETUP`).
> 2. Set the connection in `<qa-root>/.env.<env>` (from `<qa-root>/.env.example`):
>    `ADO_BASE_URL=https://<org>.visualstudio.com/<project>` (or the `dev.azure.com` form),
>    `TMS_ADO_PAT=<PAT>`, optionally `ADO_AREA_ROOT` (area-path root every published case lives under,
>    e.g. `MyProject\QA Team`; default = the project name), `ADO_PROJECT` (default = last segment of
>    `ADO_BASE_URL`), and `PLAN_ID`/`SUITE_ID`.

## Hard rules

1. **Never create a Test Plan or Suite.** Always ask the user for an existing **Plan ID** + **Suite ID**
   (paste a `_testPlans/define?planId=…&suiteId=…` URL, the raw IDs, or set `PLAN_ID`/`SUITE_ID` in
   `<qa-root>/.env.<env>`). If missing, stop and ask — never invent them.
2. **Never guess an area path.** It is derived from the case's location under `cases/` using the rules in
   [`<qa-root>/config/tms/mapping-path.md`](../../../qa/config/tms/mapping-path.md) (mirrored in `scripts/lib.mjs`).
   Anything the table can't map is flagged for the QA lead, not guessed.
3. **Confirm before pushing.** Show the per-area plan and get explicit approval. Creating a NEW area path
   requires a **second** explicit approval (and the user supplies the area path to create).
4. **Never push the same case twice.** Before creating anything, `push-cases.mjs` scans the target suite
   live and skips any case whose local ID is already there (on by default; it refuses to push if it can't
   verify the suite; `--force` overrides). `--check-existing` surfaces the same in the analyze step.

## Prerequisite — the TMS token (in `<qa-root>/.env.<env>`, NOT a global env var)

The token lives in `<qa-root>/.env.<env>` as **`TMS_ADO_PAT`** (raw PAT — the scripts base64-encode it). The
template is `<qa-root>/.env.example` — the user copies it to `.env.<env>` (gitignored) and fills in the token and
`ADO_BASE_URL`.

If `TMS_ADO_PAT` is empty, hand the user these steps (they paste the PAT into their own file — it never
lands in this conversation or shell history):

1. Mint a PAT at **`<org root of ADO_BASE_URL>/_usersSettings/tokens`** → *New Token*, scopes
   **Test Management (Read & write)** + **Work Items (Read & write)**.
2. In `<qa-root>/`, copy the template if needed (`cp .env.example .env.uat`) and set `TMS_ADO_PAT=<pasted token>`
   + `ADO_BASE_URL=<org+project URL>` (plus `PLAN_ID=` / `SUITE_ID=` if known).

> **⚠ Host matters.** The PAT authenticates against the exact host in `ADO_BASE_URL`. On some tenants
> `https://<org>.visualstudio.com/<project>` works where `https://dev.azure.com/<org>/<project>` 401s with
> the same valid token (and vice-versa). A 401 on one host form is NOT proof of a bad token — flip
> `ADO_BASE_URL` to the other form and retry before re-minting.

## Scripts (in this skill's `scripts/` folder)

All are plain Node ESM (`node <script>.mjs`), no install needed; they auto-locate `<qa-root>/` (override with
`--platform-root`). Paths passed with `--files`/`--dir`/`--plan` resolve relative to the <qa-root>/ root.

| Script | Token? | What it does |
|---|---|---|
| `plan-upload.mjs` | no* | Resolve each selected case → its TMS Area Path, group by area, flag unmapped/mismatched, write `config/tms/upload-plan.json`, print the confirmation table. *`--check-existing` also queries ADO. Reads `ADO_BASE_URL` from the env file even without a token. |
| `ensure-area-path.mjs` | yes | Check the plan's area paths exist; with `--create`, create the missing ones (after approval). |
| `push-cases.mjs` | yes | Push each case to **its own** area path, add to the suite, write the TMS id back INTO the case `.md` ("TMS Test Plan link" section) and as an `@tms:<id>` tag. Live-scans the suite first (no double-push); resumable; `--dry-run` needs no token. |
| `lib.mjs` | — | Shared parsing + the area-path rules (mirror of `mapping-path.md` — the `PROJECT SETUP` blocks are the parts you edit). |

## Procedure

### 1 — Select the cases
Decide which `cases/**/TC-*.md` to publish. If the user names a type/module/ticket, translate to a
selection: `--all`, `--dir cases/api/orders`, `--match TC-API-ORDERS-`, or `--files a.md,b.md`.

### 2 — Resolve + show the plan (mandatory, no token)
```bash
node .claude/skills/publishing-test-cases/scripts/plan-upload.mjs --dir cases/api/orders
# add --check-existing --plan-id <P> --suite <S> to ALSO mark cases already in the suite
```
This writes `<qa-root>/config/tms/upload-plan.json` and prints the per-area grouping with a per-case status:
`＋ NEW → will push`, `↷ EXISTS in suite #id (skip)`, `↷ published-local #id (skip)`, or `✖ no area —
cannot push`. **Read it back to the user** and surface every flag:
- **UNMAPPED / blocked** (a type/module with no TMS area yet) → cannot push until the user chooses one.
- **fallback / ⚠** (module not in the mapping table) → went to the type's default area; confirm intended.
- **mismatch** (case's declared `**Area Path:**` ≠ derived) → surface it; the derived value wins unless the user says otherwise.

Present with `AskUserQuestion` and get approval to proceed.

### 3 — Ensure the area paths exist (token; create only after approval)
```bash
node .claude/skills/publishing-test-cases/scripts/ensure-area-path.mjs --plan config/tms/upload-plan.json
# create missing (after a SECOND explicit approval):
node .claude/skills/publishing-test-cases/scripts/ensure-area-path.mjs --plan config/tms/upload-plan.json --create
```
Never create an area path without explicit approval.

### 4 — Dry-run (no token) then push
```bash
# dry-run: parse, show titles/priority/area/step-count + a steps-XML sample, create nothing:
node .claude/skills/publishing-test-cases/scripts/push-cases.mjs --plan config/tms/upload-plan.json \
  --plan-id <PLAN> --suite <SUITE> --tags "<TICKET>; <feature>" --dry-run

# canary: publish ONE case, eyeball it in ADO:
node .claude/skills/publishing-test-cases/scripts/push-cases.mjs --plan config/tms/upload-plan.json \
  --plan-id <PLAN> --suite <SUITE> --tags "<TICKET>; <feature>" --only TC-API-ORDERS-001

# bulk: the rest. Live-scans the suite first and skips anything already there — safe to re-run:
node .claude/skills/publishing-test-cases/scripts/push-cases.mjs --plan config/tms/upload-plan.json \
  --plan-id <PLAN> --suite <SUITE> --tags "<TICKET>; <feature>"
```
`--plan-id`/`--suite` fall back to `PLAN_ID`/`SUITE_ID` in `.env.<env>`. Filters: `--ids A,B,C`, `--only <id>`.
`--force` pushes even if the case already exists (rare). Without a reachable suite the push **aborts**
rather than risk blind duplicates.

### 5 — Write back + report
`push-cases.mjs` writes the TMS id back **into the case `.md`** — a *"TMS Test Plan link"* section plus an
`@tms:<id>` tag on the `**Tags:**` line (per `<qa-root>/docs/tag-taxonomy.md`). That is the resume/dedup record
on re-runs. Report: the plan/suite, per-area counts created, anything skipped/excluded, and any area paths
created.

## Conventions (applied automatically by the scripts)

- **Area path — per case, from the local path** (`mapping-path.md` rules in `lib.mjs`; edit the
  `PROJECT SETUP` blocks to your tree): `<type>/<module>` → `…\<Type> Test Cases\<Module segment>`. A
  surface tier (only if `§Application under test` declares surfaces) adds a `@surface:<key>` tag.
- **Priority:** `P0→1, P1→2, P2→3, P3→4` (unknown → 2).
- **Title:** prefixed with the local case ID (`TC-API-ORDERS-001 — …`) — the join key for results later.
- **Preconditions → Summary/Description**, NOT a step (written to `System.Description` as a
  `<b>Preconditions</b>` + `<ul>` block).
- **Steps:** each `N. Action:`/`Expected:` → an action/expected step; `Expected Result` → one trailing step.
  N authored steps publish as **N+1** (`**bold**` stripped, `& < >` escaped). The dry-run prints the breakdown.
- **Tags:** always `Agentic-Created`; plus whatever `--tags "…"` you pass; plus `@surface:<key>` for
  surface cases. The case's own `@<type>`/`@P<n>` markdown tags are not carried into ADO tags.

## Notes / gotchas

- **Duplicate guard.** The authoritative check is the live suite scan (by local-ID title prefix). The
  "TMS Test Plan link" section (and `@tms:` tag) in each case `.md` is the secondary per-file guard —
  a case whose `.md` already carries it is skipped on re-run. Keep each local ID in one source file.
- A Test Case's `System.AreaPath` is per work item (independent of the plan's area) — that's what lets us
  put each case in its correct area regardless of where the plan sits.
- **Nothing org-specific is baked in:** org + project come from `ADO_BASE_URL` (`ADO_PROJECT` optional
  override); the area root from `ADO_AREA_ROOT` (default = the project name); default iteration = the ADO
  project name (`--iteration` overrides).

## Done — ALL must be true
- [ ] `§Test management` is a supported TMS (not `none`); an existing Plan+Suite id was supplied (never created).
- [ ] Every case's area path derived from `mapping-path.md`/`lib.mjs`; unmapped ones flagged, not guessed.
- [ ] Per-area plan confirmed by the user; any new area path created only after a second approval.
- [ ] Live suite scan ran; no case double-pushed; `@tms:<id>` written back to each published case.
- [ ] `node --check` passes on all four scripts.

## Jira (built-in, via the Atlassian MCP)

When `§Test management → TMS` is `jira`: skip the scripts and run `references/jira-adapter.md` —
resolve project + issue type + component from `<qa-root>/config/tms/mapping-path.md` (Jira table),
dedupe by JQL on the local-id summary prefix and existing `@tms:` keys, show the per-component plan,
push ONE canary after approval, then the rest, and write back `@tms:<KEY-n>`. Required custom fields
the metadata reveals are asked once, never guessed; the ticket store is never written without the
user's explicit yes (CONTRACTS §9.9).

## Adapter seam — supporting a TMS other than Azure DevOps or Jira

The built-in scripts implement Azure DevOps only, but the CONTRACT is TMS-agnostic. To add
Jira/Xray, TestRail, or any other system, implement these four steps and nothing else changes:

1. **Resolve the container** — map each case to its destination (ADO: area path from
   `<qa-root>/config/tms/mapping-path.md`; Jira: project + folder/test-set; TestRail: suite/section).
2. **Show the per-container plan and wait for confirmation** — never push unconfirmed.
3. **Upsert the case** — create or update by the case's existing `@tms:<id>` tag; never duplicate.
4. **Write back the REAL id** as `@tms:<id>` on the case's `**Tags:**` line — never fabricated,
   never derived from the TC number (defects: `@tms-bug:<id>`, same rule).

Put credentials in `<qa-root>/.env.<env>` following the ADO naming pattern (`<TMS>_BASE_URL`,
`TMS_<NAME>_PAT`…), declare them in `<qa-root>/.env.example`, and set `§Test management → TMS` to the
new system's key. Steps 1–4 are what every consumer of `@tms:` ids relies on — keep them intact.
