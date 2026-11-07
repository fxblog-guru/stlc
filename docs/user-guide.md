# agentic-fx-qa user guide

For the QA engineer who has been handed this bundle and has a feature to ship. The
[README](../README.md) explains what the bundle is and why; this explains what you type, what
appears, and what to do when a command stops.

`/qa-help` prints the command map. This guide is the part that map cannot give you: the shape of a
real session, what the artifacts actually look like, and the dozen stops you will hit in your first
week.

---

## 1. The one idea that explains all the rest

**The traceability table is the product.** Everything else — analyses, cases, scripts, runs,
reports — exists to fill in one table that says: this requirement, this case, scripted or not, last
run, status, which report.

```
| Req | Case ID | Type | Module | Priority | Scripted | Last run | Status | Report |
```

Each phase owns exactly one set of columns and never touches another's. Designers append rows;
generators flip `Scripted ❌→✅`; execution fills `Last run` / `Status` / `Report`; reports only
read. When you understand who owns which column, the whole pipeline stops feeling like ceremony.

---

## 2. Day 1 — install and prove it

```bash
cd <your-project>
pip install git+https://gitlab.com/agentic-fx/cli-afx.git   # the installer CLI
afx install --setup
afx doctor
```

`afx doctor` must pass before you do anything else. It checks the profile is filled, the env files
exist, and the tooling for each enabled test type is installed. Once the profile is filled,
`/qa-setup` (below) lists anything still missing for the types and platforms you enabled.

### Fill `PROJECT-PROFILE.md` — this is the whole portability mechanism

The bundle fits your project by **shaping one table**, not by changing code:

| Your project | Do this |
|---|---|
| headless API service | set `e2e` and `accessibility` to `no` |
| static site | set `integration` to `no` |
| native app, QA owns the flows | set `mobile` to `yes` and the `android`/`ios` Runner to `maestro` (flows run from `<qa-root>/`) |
| native app with a mobile automation repo | set `mobile` to `yes` and point `§Mobile testing` at that repo (Runner `appium-wdio`) |
| internal tool | you may set `performance` and `security` to `no` |
| team writes in Vietnamese | `§Project → Artifact language: vi` |

A disabled type vanishes from every phase, gate and report. It is never an error, never a gap, and
never mentioned again.

Two more things to fill before your first feature:

- `<qa-root>/.env.<env>` — URLs and credentials per environment, copied from `.env.example`
- `<qa-root>/docs/element-registry.md` — your `data-testid` convention. Required by e2e and accessibility
  script generation; without it, generated locators are guesses.

### Prepare the machine — `/qa-setup`

Once the profile says what you test, ask what this machine still lacks:

```
/qa-setup uat              # the plan: every tool the enabled types and platforms need, with the install command for this OS
/qa-setup uat --install    # the same, then installs what you say yes to, then checks again
npm run qa:setup           # the plan without Claude, from <qa-root>/
```

```
  ✓ Node.js ≥ 20                       v24.16.0
  ✗ k6                                 MISSING   → winget install k6 --source winget
      for: performance
  ✗ Maestro CLI                        MISSING   → https://docs.maestro.dev/…/windows
      for: mobile android (maestro)
  · mobile-mcp server                  optional  → claude mcp add mobile-mcp -- npx -y @mobilenext/mobile-mcp@latest
      for: mobile android (maestro) — /qa-explore --agent
```

The list comes from the profile: an api-only project is asked for Node and nothing else; Android on
Maestro adds Maestro, Java and `adb`; `unit` adds the app repo's toolchain. `--install` asks before
every machine-wide installer and before adding an MCP server, never runs `sudo`, and never installs
anything inside the app repo. It does not boot an emulator for you — it tells you how. Then
`/qa-env` checks the environment the tools will point at.

---

### New project or existing suite? Pick your starting point

| You have | Start with | Then |
|---|---|---|
| A new product, or a feature with no tests yet | `/qa-analyze` (section 3 below) | plan → design → script → run |
| A suite that already exists (cases in Jira/Xray/Zephyr, Azure DevOps, TestRail or spreadsheets; scripts in a repo) | `/qa-import` | dedupe → measure what exists → grow only where a feature lands |

On an existing suite, don't add cases first. Count what you have, because thousands of cases nobody has
deduplicated hide both the gaps and the waste:

```
# 1. Export every place cases live (recipes: importing-existing-suite/references/export-recipes.md)
/qa-import --source jira=imported/exports/jira.csv --source ado=imported/exports/ado.csv            --source excel=imported/exports/regression.csv --scripts ../e2e-tests
# 2. Owners retire the duplicates the report lists, in their own tools
# 3. Improve the process on the scripts that already exist
/qa-flaky <slug>             # flaky scripts: find the cause, prove 0 failures in n runs
/qa-regression               # @smoke / @regression from run evidence, not from habit
/qa-run-plan --standard      # full · smoke · regression · per-feature, run the same way in CI
# 4. Grow only where a feature lands
/qa-impact <slug> <story>    # which modules and existing cases it touches
/qa-design <slug>            # promotes that module's imported cases, designs only the gaps
```

Imported cases stay in `imported/inventory.jsonl` and outside every gate until a feature promotes
them (CONTRACTS §29). Promotion is one module at a time, never the whole suite at once.

---

## 3. Your first feature, end to end

Pick something small. One operator. Log every friction point.

### Step 1 — analyze

```
/qa-analyze checkout-discount docs/PRD-discount.md PROJ-1841
```

Takes documents, URLs, or Jira keys. A Jira key is fetched read-only and snapshotted into
`<qa-root>/analysis/<slug>/sources/PROJ-1841.md` — the analysis cites the snapshot, and the ticket is never
edited.

Produces `<qa-root>/analysis/checkout-discount/2026-09-16-analysis.md` with:

- **REQ-001, REQ-002, …** — permanent ids. They become the `Req` column forever; they are never
  renumbered, only appended to or marked superseded
- **risks**, ranked
- a **testability matrix** — one row per enabled test type
- **open questions**, each tagged `blocking` or `non-blocking`

`/qa-plan` refuses to run while a blocking question is open. That is deliberate: a plan built on an
unanswered question produces cases that get rewritten.

### Step 2 — clarify and estimate (optional, both cheap)

```
/qa-clarify checkout-discount     # a PM-ready question sheet, BLOCKING first
/qa-estimate checkout-discount    # effort, with the derivation shown
```

`/qa-clarify` harvests ambiguities from the analysis — it never invents questions from raw docs.
Each question is self-contained and carries the assumption QA proceeds on if unanswered, so a PM
can answer it without opening anything else.

### Step 3 — plan

```
/qa-plan checkout-discount
```

Produces the strategy, the test plan, and the traceability table **empty** — zero data rows, never
pre-seeded. Cases will fill it.

### Step 4 — design

```
/qa-design checkout-discount --type api
/qa-design checkout-discount --type e2e
# or: --type all
```

**Knowledge comes first.** Before any case is written, the designer reads the analysis, the impact
note from `/qa-impact`, and the wiki pages for every business rule the feature touches. A case then
records what it was built from:

```markdown
## Grounding
- BR-014 — wiki/compiled/business-rules/br-014-discount-cap.md
- code: backend:src/Pricing/Discount.cs#Apply @ 3f9c2a1
- impact: analysis/checkout-discount/2026-09-16-impact.md §1
```

`qa:lint` opens every citation. A BR with no wiki page is an error, and so is a path that does not
exist. A case with nothing to cite says so in one line, `- none — <why>`. A P0/P1 case grounded in
nothing fails `/qa-review`. Accessibility and performance cases cite their rule set instead
(`- standard: WCAG 2.2 AA`, `- profile: §Quality gates`).

One file per case, under `<qa-root>/cases/<type>/<module>/`. Each case is a document with a fixed shape.
The skeleton for each type is `<qa-root>/_templates/case-<type>.md`:

```markdown
# TC-API-ORDERS-004 — [Orders] POST /orders — Owner creates an order with no lines → 422, errors.lines
## Grounding
## Objective
## Technique
## Isolation
## Preconditions
## Steps
## Expected Result
## Data
```

Case ids are `TC-<TYPE>-<MODULE>-<NNN>`. A case's **identity is its REQ set plus its normalized
title**, never its number — which is why files are never renamed and numbers never reused.

The **title** tells a reader, without opening the file, which module, which screen or operation,
who does what, and what must be observed (CONTRACTS §7 Title; `qa:lint` checks it):

| Type | Title |
|---|---|
| e2e | `TC-E2E-ORDERS-003 — [Orders] New order dialog — Owner saves without lines → "Add at least one line", nothing saved` |
| api | `TC-API-INVOICES-002 — [Invoices] POST /invoices/{id}/void — Owner voids a paid invoice → 409 invoice_paid` |
| security | `TC-SEC-PROJECTS-001 — [Projects] DELETE /projects/{id} — Viewer deletes a project → 403, project still readable` |
| accessibility | `TC-A11Y-CUSTOMERS-001 — [Customers] Customers list — Keyboard user tabs through filters and table → focus order matches visual order` |

"Verify that", "Ensure", "works" and a bare "successfully" are lint errors: they name no outcome.

A case's **priority** comes from its requirement's priority, adjusted by the role the scenario plays
in that requirement. The main success path of a P0 requirement, an access denial and anything that
loses data or money are P0. Main negatives are P1, boundaries and alternative paths P2, and
cosmetic checks P3. A case is never ranked above its requirement unless it states a one-line
`Priority reason:` (CONTRACTS §7 Priority).

Designers append traceability rows with the run columns set to `—`.

### Step 5 — review (an amber gate)

```
/qa-review checkout-discount
```

Returns **READY** or **REVISE FIRST**, and `REVISE FIRST` blocks `/qa-script`.

The review checks grounding in both directions. Each case's cited rules are opened, and an Expected
that contradicts its rule is a High finding. Every BR the analysis or impact note names must also be
cited by at least one case. The review lists them in a `## BR coverage` table, and a BR with no case
is a GAP.

This gate is worth its cost. A vague case caught here is a healing cycle saved after scripts exist,
and the difference in effort is roughly ten to one.

### Step 6 — script

```
/qa-script checkout-discount --type api
```

Scripts mirror cases **1:1**, same basename. Playwright for API/e2e/integration/accessibility, k6
for performance, ZAP for security.

A generated Playwright spec is built on the shipped kit (`<qa-root>/scripts/shared/README.md`) and looks
like this. One case is one test whose title is the case id plus the case title, its steps mirror the
case's steps (`Step N` = the case step number), and its data comes from a
factory that cleans up after itself. Each worker gets its own accounts, so every spec runs in
parallel, shuffled and sharded:

```ts
import { test, expect, caseMeta } from '../../shared/fixtures';

test('TC-E2E-PROJECTS-003 — [Projects] Projects list — Member opens the list after a grant → project listed with role member', caseMeta({
  id: 'TC-E2E-PROJECTS-003', type: 'e2e', module: 'projects', priority: 'P1', req: ['demo/REQ-002'],
}), async ({ pool, projectsFactory, projectsPageAs }) => {
  const [account] = pool;                                         // this worker's own account
  const project = await projectsFactory.withMember('member', account);   // seeded over the API, deleted after
  const page = await projectsPageAs(account);                     // signed in by the setup project

  await test.step('Step 1: the member opens Projects → the list renders', async () => { await page.goto(); });
  await test.step('Step 2: find the granted project → listed with role "member"', async () => {
    await expect(await page.table.cell(project.name, 'Your role')).toHaveText('member');
  });
});
```

The patterns the generators refuse to write: `test.describe.serial`, data in `beforeAll`/`afterAll`,
variables shared between tests, `Date.now()` names, UI logins, `new SomePage(page)` in a spec, and
CSS/XPath selectors. The bundle repo's `tests/golden/` holds one complete module that
`node tests/golden/run.mjs` runs green. Use it as the reference when a generated spec looks wrong.

Auth is configured once in `<qa-root>/.env.<env>`: `AUTH_MODE` (`session-csrf`, `bearer-login`, `basic`,
`header` or `none`), the named actors (`TEST_USER_<NAME>`) and, when cases grant per-object roles,
an account pool (`TEST_POOL_*`). PROJECT-PROFILE §Application under test records which is which.

Two types behave differently on purpose. `unit` and `mobile` on `appium-wdio` are **staged, not
applied**: they land in `<qa-root>/scripts/unit/` or `<qa-root>/scripts/mobile/` with a `HANDOFF.md` that maps each
staged file to its target path in the application or mobile repo. Developers apply them. The bundle
writes into those repos only if the profile says `apply`, and never into production paths.

`mobile` on **Maestro** is the exception to the exception: the flow is a YAML file in
`<qa-root>/scripts/mobile/<module>/`, built on the kit in `<qa-root>/scripts/shared/maestro/`, and it runs from `<qa-root>/`
like a Playwright spec. No second repo, no handoff. See [Mobile on Maestro](#mobile-on-maestro).

### Step 7 — check the environment (the second amber gate)

```
/qa-env uat
```

Blocks runs against an environment that is not ready, or not authorized. Security and performance
runs **refuse** an environment whose `§Environments` row says no. CI never authorizes an
environment; a human does.

### Step 8 — run

```
/qa-run checkout-discount --type api --env uat
```

Every run creates `<qa-root>/runs/<type>/<slug>/<run-id>/` — no run without evidence. Execution fills the
`Last run`, `Status` and `Report` columns.

`/qa-run` never auto-fixes anything. Quarantined cases still run; they just do not block.

### Step 9 — upload (when a report hub is configured)

```
/qa-upload checkout-discount --type api --env uat --tag smoke
```

Nothing is converted: the run already wrote `results.json` and `junit.xml` into its evidence
folder, and verdict reads both natively. What the hub adds is what local artifacts structurally
cannot — a **flakiness score** (needs the same test across many runs), a trend line, and gates
evaluated server-side so CI and a person get the same answer.

A missing `VERDICT_URL` is not an error: the command prints the upload line and reports the skip.
Uploading is reporting, and a green run does not become red because a hub was unreachable.

### Step 10 — report

```
/qa-report checkout-discount
```

Per-type summary, quality-gate verdicts, SLO / security / a11y / coverage tables — and the
traceability table as the source of truth for what was actually covered.

---

## 4. After the run — the loop that keeps it honest

A failure is one of three things, and picking correctly is most of the skill. Start with
`/qa-triage <slug>`: it groups the failures by cause and suggests the class for each group, so a
regression run with forty red cases is three or four decisions, not forty trace reads.

| It is… | When | Command | Result |
|---|---|---|---|
| **FUNCTIONAL** | the product is wrong | `/qa-defect` | an evidence-backed defect the dev team accepts without questions |
| **SCRIPT** | the test is wrong — locator moved, timing, stale data | `/qa-heal` | a healed script, then re-run |
| **FLAKY** | passes and fails without the product changing | `/qa-quarantine` | bounded quarantine, ≤30 days, in a ledger |

Getting this wrong in either direction is expensive. A script problem raised as a defect burns the
dev team's trust; a real defect healed away ships a bug.

After the fix ships:

```
/qa-run checkout-discount --type api
/qa-defect --verify DEF-checkout-discount-001
```

Defects close **from evidence of a passing run**, which is what makes MTTR a real number rather
than a self-report.

### When production bites

```
/qa-escape "customers on annual plans got charged twice"
```

Names the hole — which phase missed it, which test type should have caught it — and backfills a
case so it cannot recur silently. Every escape lands in `<qa-root>/defects/ESCAPES.md`. That ledger is how
escape rate becomes measurable instead of anecdotal.

### An existing suite meets a new feature

Every artifact is per slug, but modules are not: `billing-refunds` lands on `orders` code that
already has cases owned by the `orders` slug. Without the steps below those cases are listed and
never run, and the dev deploy gate can go green on a feature that broke its neighbour.

```
/qa-impact billing-refunds dev/release/billing-refunds/qa-handoff.md --base main --head 4f2a9c1
/qa-analyze billing-refunds dev/release/billing-refunds/qa-handoff.md   # change_type: add_feature
/qa-plan billing-refunds        # imports the impact note's re-verify list as rows
/qa-design billing-refunds --type all
/qa-review billing-refunds      # mandatory on a brownfield slug
/qa-script billing-refunds --type all
/qa-run billing-refunds --changed main..4f2a9c1   # slug rows + re-verify rows
/qa-report billing-refunds      # adds the "Re-verify set" gate
/qa-signoff 2026-10 billing-refunds,orders        # the baseline slug is in scope too
```

What each step adds for this case:

- **`/qa-impact`** maps the diff onto modules with `scripts/shared/changed-modules.mjs` (it reads
  the impact map's `Endpoint / Screen` citations) and lists the existing cases to re-verify, each with
  its owning slug. Changed paths the map cannot place are printed as `UNMAPPED`, and each one is a
  gap. Don't ignore them.
- **`/qa-analyze`** keeps the handoff packet's `REQ-NNN` ids verbatim. REQ numbers restart per
  slug, so case tags are written `@req:billing-refunds/REQ-003`. A bare `@req:REQ-003` still lints,
  but with a warning.
- **`/qa-plan`** seeds the new plan's traceability table with
  `| re-verify:orders | TC-API-ORDERS-004 | … |` rows. These rows are the only ones a plan is born with.
- **`/qa-design`** allocates ids as the next free NNN in the module folder, counting every slug's
  cases. If a parallel branch took the same number, lint fails after the merge with
  `duplicate Case ID`. Whoever merges second runs
  `node scripts/shared/renumber-case.mjs <their case file> --dry-run`, then runs it again without
  the flag. A case whose behaviour this feature removes gets `@deprecated:billing-refunds` and the
  Status `⊘ deprecated`. Don't use ⛔: blocked means "could not run" and gets re-triaged on every
  run, while a deprecated case is never run again.
- **`/qa-run`** runs the slug's rows and its re-verify rows together, and writes the results into
  the new plan only. `--changed` narrows the Playwright types to `--grep "@orders|…"`. It never
  drops a re-verify row or a row that has never run. For a change to spec files only, Playwright's
  own `--only-changed=<base>` does the same job.
- **`/qa-report`** adds the gate row `Re-verify set`. It passes only when every re-verify row ran
  green at or after the shipped SHA, and `overall` follows from it, so the dev bundle's G10 cannot
  go green with the baseline unrun.
- **`/qa-signoff`** gets criterion 11: every feature that has re-verify rows needs that gate passing.

Two shared files are written so that parallel branches rarely conflict on them. Rows in
`docs/impact-map.md` stay sorted by BR, then Module, and are inserted in place (lint checks the
order). The rows of `regression/regression-suite.md` are sorted by Case ID within each tier.

---

## Run plans: pick a plan and run it

Everything above runs **one feature**. Release week asks a different question: "run the P0/P1
orders and invoices checks, API and browser, on uat" — cases from several features and several
types, picked once and re-run many times. That is a **run plan**: a named, saved selection, like a
test run in TestRail or Azure DevOps.

Do not confuse it with the **test plan**:

| | Test plan | Run plan |
|---|---|---|
| File | `<qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md` | `<qa-root>/run-plans/<name>.md` |
| Scope | one feature | any mix of features, modules, types, priorities, suites |
| Purpose | the planning document — scope, gates, the traceability table | what you execute |
| Written by | `/qa-plan` | `/qa-run-plan` (from a prompt, or the standard set), or by hand |
| Results go to | its own traceability table | the traceability tables of every feature it touched |

### Build the plans once, then just trigger

```
/qa-run-plan --standard
```

writes the standard set into `<qa-root>/run-plans/`:

- `full` — every enabled type, every case that is neither deprecated nor quarantined
- `smoke` — the `@smoke` cases (P0 journeys + api happy paths), chromium only, ≤ 10 min
- `regression` — the `@regression` cases plus every P0/P1, sharded ×4 for the nightly
- `feature-<slug>` — one per planned feature, its re-verify rows included

Add `--release 2026-10 --features orders,invoices` for `release-2026-10`: those features with their
re-verify rows, P0–P2, security and performance only if the default env authorizes them.

`/qa-regression` still decides which cases carry `@smoke` and `@regression`; the plans select by
those tags, so curating a case into the smoke suite is all it takes to put it into the MR job.

A plan of your own, from a sentence:

```
/qa-run-plan orders-invoices-p1 "P0/P1 orders and invoices, api + e2e, exclude perf, uat, 3 shards"
```

The skill turns it into front matter, resolves it, and shows what it got:

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

The pre-release check for the two billing-facing modules.

## Resolved cases

| Case ID | Type | Module | Priority | Feature | Script |
|---|---|---|---|---|---|
| TC-API-ORDERS-001 | api | orders | P0 | orders | `scripts/api/orders/TC-API-ORDERS-001-create-order-contract.spec.ts` |
| TC-API-INVOICES-003 | api | invoices | P1 | invoices | `scripts/api/invoices/TC-API-INVOICES-003-void-invoice.spec.ts` |
| TC-E2E-ORDERS-002 | e2e | orders | P0 | orders | `scripts/e2e/orders/TC-E2E-ORDERS-002-checkout-journey.spec.ts` |
```

The `## Resolved cases` table is written by `npm run qa:plan:resolve -- <name>` — the reviewer sees
exactly what will run, and `qa:lint` warns when the table is stale. It never invents an id: a slug
without a plan or an id without a case file is a lint error, a selected case with no script makes
the resolver fail until you script it or exclude it.

### Run it — anywhere, same definition

| Where | How |
|---|---|
| Claude | `/qa-run --plan regression` |
| terminal | `cd qa && npm run qa:plan:run -- regression --env uat` (`--dry-run` prints the exact commands; `--shard 2/4`; `--last-failed`) |
| GitHub | *Actions → qa → Run workflow* → `suite: plan`, `plan: regression`, `env: uat` |
| GitLab | *Build → Pipelines → Run pipeline* → variable `RUN_PLAN=regression` (and `QA_ENV`) |

One Playwright invocation covers every Playwright tier, filtered to the exact Case IDs; k6 runs the
performance scripts; the ZAP baseline runs per selected security `.conf`. Security and performance
cases make the whole run **refuse** on an env §Environments does not authorize — it never silently
drops them. Evidence lands in `<qa-root>/runs/plans/<name>/<run-id>/`: `summary.md` (plan, env, git SHA,
counts per type, one row per case), `junit.xml`, `results.json`. Locally the run columns of every
feature it touched are filled in; `/qa-report` and `/qa-signoff` read those runs like any other.

### Schedules

| Cadence | What runs |
|---|---|
| every MR/PR | the `smoke` plan (the CI smoke job uses it automatically when `run-plans/smoke.md` exists) |
| nightly | the `regression` plan, sharded ×4, merged into one report |
| weekly | GitLab: a pipeline schedule with `RUN_PLAN=full`; GitHub: dispatch `plan: full` |
| release | `release-<id>` on the release environment, then `/qa-signoff` |

CI runs do not write the traceability table; import a CI run with `/qa-ingest <slug> --from <junit.xml>`.

---

## Platforms and UI tests

One product, three surfaces: an **invoices** feature ships in the browser, in the Android and iOS
apps, and in an Electron desktop build for accountants. Before 1.1 every case quietly meant "the
web"; now each case says where it runs, and so does every report.

**1. Declare the platforms once** — PROJECT-PROFILE `## Platforms`:

```markdown
| Platform | Kind | Runner | Targets | Tier | Enabled |
|---|---|---|---|---|---|
| `web` | web | playwright | chromium (gate), firefox (nightly), webkit (nightly) | gate | yes |
| `api` | service | playwright-request | api | gate | yes |
| `android` | mobile | appium-wdio | devices from §Mobile testing | gate | yes |
| `ios` | mobile | appium-wdio | devices from §Mobile testing | gate | yes |
| `windows` | desktop | playwright-electron | electron | nightly | yes |
```

**2. Design states the platform** — `/qa-design invoices --type e2e` writes, among others:

```markdown
# TC-E2E-INVOICES-007 — [Invoices · Windows] Export dialog — Accountant exports a month → CSV saved with 12 rows
**Type:** e2e  **Module:** invoices  **Priority:** P1
**Platform:** windows
**Tags:** @e2e @invoices @P1 @platform:windows @req:invoices/REQ-004 @agentic:gen
```

The H1, the `**Platform:**` line and the `@platform:` tags must agree (`qa:lint` errors otherwise);
the platform must be an enabled row; a `mobile` case can only be `android`/`ios`; nothing UI-shaped
runs on `api`. Cases written before 1.1 lint with a warning and the inferred default (`web` for
browser types, `api` for HTTP types) until you add the line.

**3. UI tests are their own type.** "Does the export work" is e2e; "does the invoice list still look
right — empty, full, with a 120-character customer name, at 320 / 768 / 1280 px" is `ui`:

```
/qa-design invoices --type ui     → TC-UI-INVOICES-001 visual baselines (state × viewport, masks with reasons)
                                    TC-UI-INVOICES-002 layout at 320 px with the longest name (no sideways scroll, nothing clipped)
/qa-script invoices --type ui     → expectVisual(...) per row + expectNoHorizontalScroll / expectNoOverflow / expectTouchTargets
```

Baselines are screenshots, and screenshots differ per OS, so the committed set is the one the CI
image renders: run the manual **`ui-baselines`** job (`npm run test:ui:update` =
`--update-snapshots=changed`), review every PNG, commit `<qa-root>/scripts/ui/__screenshots__/linux/`. A
local run on Windows writes `win32/` beside it and never overwrites it. A red visual run is a
triage, not a chore: the screen changed (FUNCTIONAL — a defect, or an intended change whose new
baseline you review) or a dynamic region was not masked (SCRIPT).

**4. Run by platform.** `/qa-run invoices --platform web,windows` runs the browser projects
(`web-chromium`, …) and the `desktop-electron` project (`ELECTRON_APP_PATH` points at the build —
without it those specs are ⛔ skipped with that reason, never ✅). Android and iOS on Runner `maestro`
run in the same command, through Maestro; on `appium-wdio` they are listed as handoff with the
command the mobile repo runs, and results come back through `/qa-ingest`. A run plan says the same
in its front matter:

```yaml
select:
  features: [invoices]
  platforms: [web, windows]
```

**5. Read it per platform.** The run's `summary.md` and `/qa-report` carry a platform × type matrix,
and the report's `## Quality gates` gains one `Platform: <label>` row per gate-tier platform — a
platform whose cases never ran is `not evaluable`, so "green on web" can never pass for "green".

---

### Runners: Playwright today, Selenium or Cypress tomorrow

The `Runner` column in §Platforms says HOW a platform's cases run. Every runner is one entry in
`<qa-root>/scripts/shared/lib/runners.mjs`. Today the entries are Playwright (browser, HTTP and Electron),
Maestro, Appium and handoff. A team on Selenium + Java, Cypress or Detox adds one entry and one
wrapper script that writes `results.json` (Case ID → pass / fail / skip). Run plans, verdicts, the
traceability write-back and the summary then work for it unchanged. CONTRIBUTING.md, "Adding a
runner", lists the five steps.

## Mobile on Maestro

[Maestro](https://docs.maestro.dev) flows are YAML, so a QA engineer can read, write and review them
without a mobile framework repo. Pick Maestro when QA owns mobile automation. Pick `appium-wdio` when
the mobile team already has an Appium + WebdriverIO repo with screen objects.

**1. Turn it on.** In PROJECT-PROFILE §Platforms set the Runner of `android` / `ios` to `maestro`,
and put the app ids in `<qa-root>/.env.<env>`:

```bash
MOBILE_ANDROID_APP_ID=com.example.app
MOBILE_IOS_APP_ID=com.example.app
TEST_USER=qa.standard@example.test        # the actor flows sign in as
TEST_PASSWORD=…
API_BASE_URL=https://qa.example.test/api  # only when a flow seeds data
MOBILE_API_TOKEN=…
```

Install the `maestro` CLI and boot an emulator or a simulator. `/qa-env` checks each of these and
names whatever is missing.

**2. What `/qa-script --type mobile` writes.** One flow per case, at the case's path with `.yaml`.
The flow composes the kit and never re-implements it:

```
<qa-root>/scripts/mobile/orders/TC-MOB-ORDERS-002-reopen-draft-after-restart.yaml   the case's flow
<qa-root>/scripts/shared/maestro/
  config.yaml                      which files are flows; `quarantined` always excluded
  elements/app.js · orders.js      every id the app exposes — the only place an id is written
  flows/launch-clean.yaml          cleared state, permissions, arrival asserted
  flows/sign-in.yaml               sign in as an actor from .env (never a password in a flow)
  flows/network.yaml               offline / online (Android airplane mode; iOS: a labelled skip)
  flows/orders/create-order.yaml   the data factory: unique name, API create, undo registered
  flows/cleanup.yaml               onFlowComplete: network back on, every registered record deleted
  scripts/run-context.js           every timeout (output.T.*) and the run id
```

`qa:lint` checks every flow for these rules:
- `name:` starts with the Case ID. It is the JUnit test name, which is how a result reaches its
  traceability row.
- `appId` is `${APP_ID}`.
- The tags are `mobile`, the module, the priority and the suites.
- Each case step has one `label: "Step N: …"` block.
- No raw `id:`: ids come from `${output.<module>.<key>}`.
- No literal timeout: timeouts come from `${output.T.<name>}`.
- Every referenced file exists.
- A case never has both a flow and a WebdriverIO spec.

**3. Run it.**

```bash
npm run test:mobile:maestro -- --platform android --tags smoke
npm run test:mobile:maestro -- --platform ios --cases TC-MOB-ORDERS-002 --device "iPhone 15"
/qa-run orders --type mobile       # both platforms, written back to the traceability table
/qa-run --plan orders-mobile       # a run plan with platforms: [android] routes to Maestro
```

Evidence lands in `<qa-root>/runs/…/mobile/<platform>/`: `junit.xml`, `results.json`, the Maestro log, and
the screenshots and recordings. `repo-state.txt` records the device, the app id and the Maestro
version. A case is ✅ only when it passed on every platform it ran on. A run that produced no report
is ⛔ SETUP/ENV, never ✅.

**4. Crashes.** On Android the runner clears the device log before the run and saves it as
`device.log` after. Every crash or ANR of your app id lands in `results.json` `crashes` and fails
the run, even when every flow passed: the user saw the app die. `/qa-run` files it as FUNCTIONAL
with the log excerpt, never as a flaky retry. No `adb` → `deviceLog: not captured`, and the summary
says so.

**5. A flow broke.** `/qa-heal <flow.yaml | slug>` runs `qa:lint`, reads the failing run's evidence,
and fixes the element map entry (never a raw id in the flow) after checking the new id against the
app source or the live tree (`maestro hierarchy`). A crash stops the heal. Three attempts, then the
failure is re-triaged.

**6. Let the agent explore.** `/qa-explore <slug> --agent` on a mobile charter drives the device
named in the sheet: background and restore, rotate, offline, permission denied, back gesture. It
reads the device log after each probe. If the [mobile-mcp](https://github.com/mobile-next/mobile-mcp)
server is connected it uses it (`claude mcp add mobile-mcp -- npx -y @mobilenext/mobile-mcp@latest`);
otherwise `maestro hierarchy` and `adb`. A bug it reproduces twice can leave a draft flow
(`XS-…-seed-1.yaml`) beside the sheet for `/qa-design` to start from.

## How much of the app do we test? — `/qa-coverage`

"We have 300 cases" does not answer it. `/qa-coverage` (`npm run qa:coverage` in `<qa-root>/`) answers
with **covered / total** over things the application owns, each read from a file:

```
qa:coverage — 1 feature(s), 10 case(s)
  Requirements with ≥1 case                       ██████████    100%  5/5
  API operations with an api case                 ██░░░░░░░░     20%  1/5  below 100%
  Screens with an e2e case                        ███░░░░░░░   33.3%  1/3  below 100%
  Business rules cited by ≥1 case                 ██████████    100%  1/1
  P0/P1 cases automated                           ███████░░░   66.7%  6/9  below 90%
```

| Dimension | The total comes from |
|---|---|
| requirements, AC, REQ × type | the analysis registers and its §5 matrix |
| API operations (api; authz via security) | the OpenAPI spec (`§Application under test`, or `<qa-root>/docs/openapi.yaml`) |
| screens (e2e, ui, accessibility) | the pages of `<qa-root>/docs/element-registry.md` |
| business rules | `<qa-root>/wiki/compiled/` BR pages, matched to `## Grounding` |
| risks | the analysis §6 risk table |
| automation, execution | the traceability table |

The match from a case to an operation or a screen is its **title**. `[Orders · API] POST /orders —
…` covers `POST /orders`, and `[Orders · Web] New order form — …` covers the registry page `New
order form`. A title naming a screen the registry lacks is listed, not guessed. A good title is
what makes the coverage map honest.

The report, `<qa-root>/reports/coverage/YYYY-MM-DD-coverage.md`, adds a per-type table (designed,
automated, run, passing, and the share of the surface that type covers). It has one row per
operation and per screen with the case ids, the unit line coverage transcribed from the last run,
and the gaps ranked with the command that closes each. No spec means the API rows say
`not measurable — set …`. There is never one blended score: "API 20 %, requirements 100 %" is the
finding. `--strict` exits 1 when a requirement or a High risk has no case, for a CI gate.

## Finding the bugs cases miss

Scripted cases share the spec's blind spots: they test the values, orders and screens somebody
predicted. An experienced tester exploring the same feature finds more, because they double-click,
open a second tab, refresh halfway through, paste emoji, wait for the session to expire, and watch
the server log while they do it. The kit turns each of those habits into something that runs on every
build, and the bundle's own golden suite proves each one by seeding a bug and watching the right spec
go red.

| Habit | Mechanism | Where | What makes it fail |
|---|---|---|---|
| "what if I click twice / use two tabs / go back?" | **UI risk classes**: a mandatory table in `/qa-design --type e2e` (Step 1b), eleven classes, each with case seeds and the Playwright tool to use | `designing-functional-cases` · e2e cases carry `## UI risk classes` | a class that applies with no case is a GAP in `/qa-review` |
| "what if I send garbage?" | **Schema fuzzing**: one generic spec walks every operation in your OpenAPI document and sends boundary, wrong-type, null, missing, extra, huge, unicode and malformed inputs as each actor | `<qa-root>/scripts/api/_fuzz/TC-API-FUZZ-001-*.spec.ts` → `shared/fuzz/openapi-fuzz.ts` | any 5xx, an undocumented status, a body that breaks its schema, a stack trace or internal field |
| "what if I do things in a strange order?" | **Model tests**: you describe the state, the actions and the rules that must always hold; random seeded sequences run against the API, and a failure shrinks to the shortest sequence that still breaks | api cases with `## Model` → `shared/model/model-runner.ts` (guide: `designing-api-cases/references/model-based.md`) | an invariant (count, permission, deletion, uniqueness) broken after any step |
| "let me watch the server log" | **serverWatch**: an auto fixture reads the server's log during every test, HTTP and browser | `shared/fixtures/server-watch.fixture.ts`, set `QA_SERVER_LOG` or `QA_SERVER_LOG_CMD` | an error line while the test ran, even if every response was 200 |

**Turning it on.** UI risk classes and model cases come from `/qa-design` and are reviewed by
`/qa-review` like any other case. Fuzzing is one case per API: add your new operations to its
`fuzz-allow` line (or `fuzz-deny` them with a reason). The server watch needs one line in
`<qa-root>/.env.<env>`, for example:

```
QA_SERVER_LOG_CMD=kubectl logs deploy/api --since-time={since}
```

**Replaying a failure.** Fuzz and model failures print their seed:

```
QA_FUZZ_SEED=1 npx playwright test scripts/api/_fuzz/TC-API-FUZZ-001-openapi-operations.spec.ts
QA_MODEL_SEED=1 npx playwright test scripts/api/projects/TC-API-PROJECTS-003-membership-model.spec.ts
```

A model failure arrives already reduced to a bug report:

```
minimal sequence (4 of 8 steps):
  1. create()  2. create()  3. grant(project=1, account=0, role=admin)  4. grant(project=1, account=0, role=viewer)
  → invariant "member_count equals the members granted": member_count 2, granted 1
```

**Triage.** All four are `FUNCTIONAL` when they fire (`/qa-run` attaches the server-log excerpt,
the fuzz request and seed, or the minimal sequence as evidence). Hunt harder on a schedule:
`QA_FUZZ_SEED=random QA_FUZZ_MAX=500 QA_MODEL_SEED=random QA_MODEL_RUNS=50`.

**Exploring with an agent.** `/qa-explore <slug> --agent` lets the agent drive a charter itself
through Playwright, working through the same UI risk classes with the server log as a second
oracle. It writes notes; you still read them, decide what is a bug, and own the debrief.

---

## 5. What each command stops on

Every stop is a contract refusing to produce work that looks finished and is not.

| Stop | Means | Do |
|---|---|---|
| bad slug | slug becomes a directory segment | lowercase-kebab only: no spaces, no uppercase, no `/` |
| unreadable path / dead URL / unresolvable Jira key | the analysis would cite nothing | fix the input, or drop it and say so |
| `change_type` unknown | `new_project` vs `add_feature` changes the whole analysis | state it; the command will not guess between those two |
| no analysis for this slug | `/qa-clarify`, `/qa-estimate` and `/qa-plan` all read the analysis | run `/qa-analyze` first |
| blocking questions still open | a plan on an unanswered question produces cases that get rewritten | answer them, or downgrade them to non-blocking with a recorded assumption |
| type disabled in `§Test types` | the profile decides scope, not the command line | enable it in the profile if you actually want it |
| `unit` enabled but `§Unit testing` empty | the bundle will not pick your test framework for you | fill the section: repo path, framework, test dirs, run commands, write mode |
| `REVISE FIRST` from `/qa-review` | the case is not specific enough to script | fix the case. Scripting it produces a script you will heal later |
| `/qa-env` NOT READY | the environment is down, unseeded, or unauthorized | fix the env. Running anyway produces failures that mean nothing |
| unknown env | it is not in `§Environments` | use one that is |
| `/qa-heal` on a tier it does not heal | healing is for locator drift in e2e specs and Maestro flows | api/unit/perf/security failures are defects or data problems, not healing targets; a WebdriverIO spec is fixed in the framework repo |
| `/qa-heal` on a flow whose app crashed | a crash is a product bug, not drift | `/qa-defect` with the `device.log` excerpt the run saved |
| `/qa-setup` lists MISSING tools | the machine cannot run the enabled types yet | install them (`/qa-setup <env> --install`), or disable the type in the profile |

---

## 6. Your week

| When | Run | You get |
|---|---|---|
| every morning | `/qa-status` · `/qa-env` | traceability posture, quarantine expiries, verifiable defects — and whether the env is usable today |
| a story lands | `/qa-impact <slug> <story>` | what it touches: business rules, modules, existing cases to re-verify, gaps |
| a run fails | `/qa-triage` → `/qa-heal` · `/qa-defect` · `/qa-quarantine` | grouped causes, then the right one of the three |
| a fix ships | `/qa-run` → `/qa-defect --verify` | defects closed from evidence |
| production bug | `/qa-escape` → `/qa-design` | the hole named and closed |
| before a release | `/qa-coverage` | what is tested and what is not: per dimension, per type, with gaps |
| sprint review | `/qa-metrics` | DDP (test recall) first, then coverage, pyramid shape, pass rate, flake, defect load, MTTR, trend |
| after a release or sprint | `/qa-retro` → `/qa-improve` | where the process leaked, as patterns, each action bound to a mechanism; a check that was earned becomes a permanent row with two fixtures |
| before a release | `/qa-signoff` → `/qa-regression` | GO / NO-GO with conditions named, then a pruned regression suite |

`/qa-explore` sits outside the rhythm on purpose: charter-driven sessions for what scripts cannot
see. Run one after every significant feature. Scripted checks confirm what you predicted; an
exploratory session finds what you did not.

---

## 7. Rolling out to a team

### Reviewing each other's test PRs

```bash
/qa-review-pr 42                     # GitLab MR !42 or GitHub PR #42 — fetched from origin, no CLI needed
/qa-review-pr test/orders-refunds    # a branch, before anyone opens the PR
```

Once more than one person writes tests, every branch needs a reviewer before it merges. A test PR
is reviewed for a different failure than a code PR. Code goes wrong by *doing* the wrong thing. A
test goes wrong by *saying* the wrong thing: green while the feature is broken, or quietly no
longer running. So `/qa-review-pr` does three things:

1. **Scans** the diff with `<qa-root>/scripts/shared/pr-scan.mjs`. It flags assertions removed,
   `.only`/`.skip`, sleeps, `force: true`, a script with no case, a Case ID minted twice,
   `@quarantined` added by hand, a loosened `playwright.config.ts`, an edited shared kit file, and
   a case edited after its review hashed it.
2. **Runs** the changed specs three times and shuffled, from a throwaway worktree. It also breaks
   one new assertion on purpose to see it go red. A test you have never seen fail proves nothing.
3. **Reads** each changed case and script pair against a 20-row checklist in four groups (honest · does not break · right format · ready to merge). It writes
   `<qa-root>/reviews/_pr/<pr-id>-<stamp>.md` with APPROVE / REQUEST CHANGES and a comment you paste into
   the PR.

The scanner also runs in CI on every merge request (`qa:pr-scan` / `pr-scan`) and fails only on
High findings. A PR that also changes the application gets `/sdlc-review-pr` from the dev bundle
as well.

### The rollout

The README has the four-week playbook. The principle behind it is the part that matters:

> **Do not open to the whole team before the pilot completes one full loop.** Fixing a contract
> with one user costs an afternoon. With five users holding artifacts built on the old contract, it
> costs a migration week.

Week 3 is the one people skip and should not: compare your estimate against the pilot's actuals and
tune `§Estimation baselines`. Until that happens, `/qa-estimate` is producing numbers from someone
else's project.

---

## 8. Mistakes that cost the most

1. **Hand-editing artifacts.** The gates read the traceability table. Edit a column you do not own
   and the next phase overwrites it, or worse, does not.
2. **Skipping `/qa-review` because the cases look fine.** The review exists to catch vagueness
   before it becomes ten scripts.
3. **Healing a real defect.** A failing test that is actually right is the most valuable output the
   pipeline produces. Read the evidence before reaching for `/qa-heal`.
4. **Letting quarantine become a parking lot.** It is bounded at 30 days and it is a ledger for a
   reason. `/qa-status` surfaces expiries — act on them.
5. **Renumbering REQ or TC ids** to "tidy up". Ids are permanent join keys; renumbering silently
   breaks every historical comparison while everything still looks consistent.
6. **Designing e2e cases for what an API case could prove.** The API tier is faster, more stable
   and more precise. Push everything down that can go down.

---

## 9. Where everything lives

```
.claude/PROJECT-PROFILE.md            the one config file — fill this, not the skills
.claude/CONTRACTS.md                  when a file disagrees with this, this wins

<qa-root>/_templates/                        every artifact's format, in one folder (bundle-owned)
<qa-root>/analysis/<slug>/…-analysis.md      REQ ids, risks, testability matrix
<qa-root>/analysis/<slug>/sources/<KEY>.md   the snapshotted ticket the analysis cites
<qa-root>/plans/<slug>/…-test-plan.md        strategy + THE TRACEABILITY TABLE
<qa-root>/cases/<type>/<module>/TC-*.md      one file per case
<qa-root>/scripts/<type>/…                   mirrors cases 1:1, same basename
<qa-root>/scripts/{unit,mobile}/HANDOFF.md   staged → target repo path, with status
<qa-root>/runs/<type>/<slug>/<run-id>/       evidence. No run without it
<qa-root>/reports/<slug>/…-report.md         per-type summary + gate verdicts
<qa-root>/defects/<slug>/DEF-*.md            one open defect per distinct failure
<qa-root>/defects/ESCAPES.md                 the escaped-defect ledger
<qa-root>/regression/quarantine.md           the quarantine ledger — no silent skips
<qa-root>/docs/element-registry.md           your test-id convention
<qa-root>/wiki/compiled/index.md             the domain wiki, if you built one
```

Analysis, plans, estimates, defects and exploratory sheets open with the same front matter
(CONTRACTS §2.1):

```yaml
---
slug: checkout-discount
artifact: test-plan
status: in-review          # draft | in-review | superseded — "approved" lives in the review, not here
authored_by: planning-tests
reviewed_by: pending
created: 2026-09-16
updated: 2026-09-16
---
```

Run `npm run qa:lint` whenever something feels off. It enforces the mechanical half of
`CONTRACTS.md` and will name the file and rule rather than leaving you to guess.

---

## 10. How it fits the rest of agentic-fx

| Repo | Role |
|---|---|
| [`cli-afx`](../../cli-afx) | installs and updates this bundle; `afx doctor` is your first diagnostic |
| [`verdict`](../../verdict) | send run reports here for history, flakiness scoring and cross-project gates |
| [`ai-eval`](../../ai-eval) | the same discipline for LLM features — it hands defects and sign-off evidence **back** to this bundle |
| [`playwright`](../../playwright) · [`python-api-automation`](../../python-api-automation) · [`mobilewright-automation`](../../mobilewright-automation) | the automation frameworks the generated scripts target |
| [`qa-manager`](../../qa-manager) | Luna, the management layer above all of this — releases, team rhythm, metrics |

---

## 11. Getting unstuck

```
/qa-status              where every slug stands, what is blocking
/qa-help                every command, grouped by phase, with when-to-use and what's next
/qa-help qa-design      one command's card plus its arguments
/qa-feedback "…"        the bundle got in the way — one entry for the maintainer (Recall, or <qa-root>/feedback.md)
npm run qa:lint         contract violations, with the file and the rule
npm run qa:score        per REQ: which test axes the cases cover; exit 1 on a P0/P1 gap
afx doctor             environment and tooling prerequisites per enabled type
npm run qa:setup       what this machine lacks for the enabled types and platforms, with install commands
```

If an artifact and `CONTRACTS.md` disagree, **CONTRACTS.md wins** — fix the artifact. That rule is
what keeps a bundle used by several people from drifting into several dialects.
