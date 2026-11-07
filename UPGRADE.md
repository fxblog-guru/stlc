# Upgrading agentic-fx-qa

Written for: someone whose project already has the bundle installed and who has been told an update
exists, by the session-start line, the VS Code board, or `afx`. What changed is in
[CHANGELOG.md](CHANGELOG.md); this file says what to *do*.

## How you hear about an update

`afx` records the installed version in `.claude/.agentic-fx.json` and, when it checks, writes
`.claude/.agentic-fx-updates.json`. The bundle only reads that file and never goes to the network
itself:

- the SessionStart hook (`qa/scripts/shared/status.mjs --brief`) prints one line, for example
  `agentic-fx-qa 2.0.0 available (installed 1.0.0, major) — afx update --bundle qa · <changelog> — MAJOR: read UPGRADE.md first`;
- the VS Code board ("Agentic STLC") turns its version pill amber; click it to open the changelog,
  run the update in a terminal, or dismiss that version.

Set `AFX_NO_UPDATE_CHECK=1` to silence both.

## Every upgrade, whatever the kind

1. Commit or stash your work. The installer replaces bundle-owned files under `.claude/` and
   `qa/scripts/shared/`; your cases, plans, runs, reports, `.env.<env>` files and `PROJECT-PROFILE.md`
   are yours and are not touched.
2. `afx outdated` — which bundles are behind, and by what kind (patch, minor, major).
3. Read the CHANGELOG entries between your version and the new one. For a MAJOR, read its section
   below **first**, and its `### Breaking` list.
4. `afx update --bundle qa`.
5. In `qa/`: `npm ci` (then `npx playwright install` when the Playwright pin moved).
6. `npm run qa:lint` — new rules fire here; an error is a migration step the release notes name.
7. `npx tsc --noEmit` — the shared layer's types against your specs, services and fixtures.
8. Run smoke: `npm run test:smoke` (or `npm run qa:plan:run -- smoke` when you have the plan) against
   a non-production environment.

| Kind | What it means | Extra steps |
|---|---|---|
| PATCH (x.y.**Z**) | wording, fixes; no rule changes | none |
| MINOR (x.**Y**.0) | new sections, rules, scripts; old artifacts still lint without errors | the version's section below, if any |
| MAJOR (**X**.0.0) | the workspace kit, an env key, a case or plan format, or a `CONTRACTS §16` key changes | always the version's section below; the CHANGELOG has a `### Breaking` list |

## Unreleased — verdict integrity (MINOR)

Rules that can fail on files you already have, and what to do:

1. **A `.catch(() => 0 | false | '' | [] | {} | null …)` in `scripts/**/*.ts`** — a failed read turned
   into a value. Let it throw, or add `// unknown-ok: <why it can never reach a verdict>` on that line.
2. **An empty `test.step(…)`** in a spec — give it the step's action, or mark the step `COVERAGE-GAP`.
3. **A `fixed` defect with `**Case:** —`** — design the case that reproduces it, put its id in
   `**Case:**`; reopen the defect if no such case can pass yet.
4. **An EXPLORATORY defect with `**REQ:** —`** — cite the REQ/BR/AC/standard/spec it contradicts in
   `## Expected`, or turn it into a `QUESTION` follow-up.
5. **A `FUNCTIONAL` entry in a run's `failures.md` without `attribution:`** — add
   `- attribution: precondition … · control … · repro …` (`n/a — <why>` is allowed per key).

Then adopt the identity check (recommended): add `### Target identity` under `§Environments` (the
template shows the shapes), run `npm run qa:target -- --env <env>` once and fix what it cannot read.
From then on every report naming a `shipped_sha` needs the `Target identity` gate row, and runs
without a `target.json` make it `not evaluable`. Nothing changes until you declare it — only a warning.

## 2.5.0 (MINOR, from 2.4)

Nothing to do on a project that started on stlc. On a project that already had tests:

1. Add `imported/exports/` to `<qa-root>/.gitignore` (new installs have it).
2. Export the cases from each tool (`importing-existing-suite/references/export-recipes.md`) and run `/qa-import`.

## 2.4.0 (MINOR, from 2.3)

Nothing to do unless you test data pipelines. To start:

1. Add the `data` row to `PROJECT-PROFILE.md §Test types` (`no` → `yes`) and copy the
   `## Data testing` section from the bundle's profile template.
2. Fill readiness R1–R8 and the layer table (repo path, engine, test dirs, run and mutation commands).
   The runnable templates `afx template dbt-elt` and `afx template spack-elt` already have a CI engine,
   a fixture and a mutation command.
3. `/qa-design <slug> --type data`.

## 2.3.0 (MINOR, from 2.2)

Two rules can fail on files you already have; everything else is new and optional.

1. `afx update --bundle qa`, then `npm ci` in the QA root, then `npm run qa:lint`.
2. **A case with no `## Grounding`** is now an error. Add the sources it was designed from, or
   `- none — <why>` (CONTRACTS §7).
3. **A test plan dated 2026-10-26 or later needs `## Sizing`** above `## 1. Coverage targets`
   (CONTRACTS §27). Older plans are not re-sized. `node <qa-root>/scripts/shared/sizing.mjs estimate
   <slug> --class standard --types api,e2e --reqs <n>` prints the estimate lines.
4. Optional: set `**Token budget per run:**` in PROJECT-PROFILE (`0` means none).

Rollback: `afx update --bundle qa --ref v2.2.1`; plans with `## Sizing` still lint on 2.2.1.

## 2.2.0 (MINOR, from 2.1)

The QA root is configurable and a new project gets `.stlc/`. **A `qa/` project needs nothing:** the
scripts find `qa/` when `.stlc/` does not exist, and every record that says `qa/…` still resolves.
CONTRACTS §16 did not change (a consumer looks under either name).

1. `afx update --bundle qa`, then `npm ci` in `qa/`.
2. Optional: add the two `.stlc/` lines from the shipped `settings.json` (the hooks now look in
   `$QA_ROOT`, `.stlc/` and `qa/`), or keep yours: their `qa/` paths still work.
3. Optional, to move: `node qa/scripts/shared/migrate-root.mjs --to .stlc` (a dry run), then again
   with `--write`, then `npm run qa:lint` in `.stlc/` and commit the move as one change. It runs a
   `git mv`, sets PROJECT-PROFILE `QA root`, rewrites `qa/` in records no hash covers, and rewires
   package.json, .gitignore, CI, `playwright.config.ts` and `.claude/settings.json`. A reviewed case
   keeps its `qa/…` lines, so its review does not go stale.

Rollback of a move: `node .stlc/scripts/shared/migrate-root.mjs --to qa --write`. (2.1.0 was not
tagged; its changes ship in 2.2.0, so the bundle rollback is `--ref v2.0.0` and the 2.0 section below.)

## 2.1.0 (MINOR, from 2.0)

Every template moved to `qa/_templates/`. Artifacts gain front matter, and cases gain `## Grounding`.
CONTRACTS §16 did not move, and nothing you wrote fails to lint: the new rules are warnings for 2.1.x.

1. `afx update --bundle qa`, then `npm ci` in `qa/`.
2. `npm run qa:lint`. Each warning `2.0 template folder — the formats moved to qa/_templates/` names
   a folder to delete. First diff it against its new home in case you edited a skeleton locally, for
   example `diff qa/plans/_template/YYYY-MM-DD-test-plan.md qa/_templates/test-plan.md`. Move any
   local edit into `qa/_templates/`, then `git rm -r` the old folder.
3. `npm run qa:lint` again: the warnings are gone.

4. Two new sections are warnings in 2.1.x and errors from 2.2:
   - **front matter** on analysis, plans, estimates, defects and exploratory sheets. Copy the block
     from the matching `qa/_templates/` file. Use `status: in-review` for an artifact already handed
     on, and `reviewed_by: pending`.
   - **`## Grounding`** on every case, placed above `## Objective`: the BR (with its wiki page), the
     code citation, the impact note or ticket the case came from, or `- none — <why>`. A P0/P1 case
     with nothing to cite is worth a second look. `/qa-review` now fails those cases.

Rollback: `afx update --bundle qa --ref v2.0.0`. The skills then read the old folders again.

## 2.0.0 (MAJOR, from 1.x)

`CONTRACTS §16` — what the dev bundle parses at G10 — is unchanged, so `agentic-fx-dev` reads your
reports the same before and after. What breaks is your **workspace**: specs written against the 1.x
`api.fixture.ts` no longer compile, a 1.x `.env.<env>` signs in the old way, and 1.x case files fail
`qa:lint` on the new title and section rules. Budget an afternoon per few dozen cases; the work is
mechanical and `qa:lint` lists every file.

### Checklist

- [ ] `afx update --bundle qa`, then in `qa/`: `npm ci && npx playwright install`
      (`@playwright/test` and `playwright-core` are pinned to exactly `1.64.0`).
- [ ] `.env.<env>`: the new auth and actor keys (below). `cp .env.example .env.new` and diff is the
      quickest way to see them.
- [ ] Specs: import from `shared/fixtures`, rename fixtures, add `caseMeta` (below). `npx tsc --noEmit`
      until clean.
- [ ] Your own `playwright.config.ts`, if you replaced the kit's: keep the `setup` project and the
      `dependencies: ['setup']` on every HTTP and browser project.
- [ ] Case files: H1 title, `**Platform:**`, `**AC:**`, `## Objective` / `## Technique` /
      `## Isolation`, priority rule, `@req:<slug>/REQ-NNN` (below). `npm run qa:lint` until 0 errors.
- [ ] Plans: add the five `§4` headings before `## Change log`.
- [ ] VS Code: uninstall "Agentic QA" (`vscode-qa`), install "Agentic STLC" (`editor/vscode-stlc`);
      rename the setting `qa.statePath` → `stlc.statePath` if you set it.
- [ ] Smoke run green against a non-production env; commit.

### `.env.<env>`

Before (1.x):

```dotenv
AUTH_MODE=bearer-login
AUTH_LOGIN_PATH=/auth/login
AUTH_TOKEN_PATH=access_token
TEST_USER=qa@example.test
TEST_PASSWORD=…
PW_PROJECTS=chromium
```

After (2.0.0) — the same bearer API, plus the keys you now choose:

```dotenv
# none | session-csrf | bearer-login | basic | header
AUTH_MODE=bearer-login
AUTH_LOGIN_PATH=/auth/login
AUTH_USER_FIELD=username          # JSON field names of the sign-in body
AUTH_PASSWORD_FIELD=password
AUTH_TOKEN_PATH=access_token
# session-csrf only (cookie session + CSRF token on every non-GET):
# AUTH_CSRF_PATH=csrf_token
# AUTH_CSRF_HEADER=X-CSRF-Token
# AUTH_ID_PATH=me.id              # the signed-in account's id, for factories that grant roles
TEST_USER=qa@example.test         # the `default` actor
TEST_PASSWORD=…
# TEST_USER_OWNER= / TEST_PASSWORD_OWNER=   named actors → actor('owner'), as('owner')
# account pool: each worker gets its own accounts; seed workers × TEST_POOL_PER_WORKER of them
# TEST_POOL_USER=user.{n:3}@example.test
# TEST_POOL_PASSWORD=password-{n:3}
# TEST_POOL_SIZE=0
# TEST_POOL_PER_WORKER=4
PW_PLATFORMS=web,api              # platforms (CONTRACTS §20)
PW_PROJECTS=chromium              # web targets, as before
```

A wrong or missing key fails the `setup` project in its first second, naming the key.

### Specs: imports and fixtures

Before (1.x):

```ts
import { test, expect, expectSchema } from '../../shared/fixtures/api.fixture';

test('TC-API-ORDERS-001 create order', { tag: ['@api', '@orders', '@P0'] }, async ({ apiClient, anonymousClient }) => {
  const res = await apiClient.post('/orders', { data: order });
  expect((await anonymousClient.get('/orders')).status).toBe(401);
});
```

After (2.0.0):

```ts
import { test, expect, expectSchema, caseMeta } from '../../shared/fixtures';

test('TC-API-ORDERS-001 — [Orders · API] POST /orders — Clerk submits one line → 201, order Open', caseMeta({
  id: 'TC-API-ORDERS-001', type: 'api', module: 'orders', priority: 'P0', req: ['orders/REQ-001'], suites: ['smoke'],
}), async ({ api, as, anonymous, cleanup }) => {
  await test.step('Step 1: POST /orders → 201', async () => {
    const res = await api.post('/orders', { data: order });
    cleanup.add(`order ${res.body.id}`, () => api.delete(`/orders/${res.body.id}`));
  });
  await test.step('Step 2: no session → 401', async () => {
    expect((await anonymous.get('/orders')).status).toBe(401);
  });
});
```

| 1.x | 2.0.0 |
|---|---|
| `…/shared/fixtures/api.fixture` | `…/shared/fixtures` (one `test`; add your domain fixtures to `fixtures/index.ts`) |
| `apiClient` | `api` (as `TEST_USER`), or `await as('owner')` / `await as(session)` |
| `anonymousClient` | `anonymous` |
| `hasRole` (`http/auth.ts`) | gone — per-object roles are data a factory grants; actors come from `actor()` / `pool` |
| `ApiClient.authenticated(request)` | `api` / `as(...)`; `ApiClient.open(session)` in your own fixtures |
| tags written by hand | `caseMeta({ … })`, values copied from the case's `**Tags:**` line |
| teardown in `afterAll` | `cleanup.add(label, fn)` — runs after each test, in reverse |

The golden specs under `tests/golden/qa/scripts/` in the bundle show every tier in the new shape.

### Case files: header and title

Before (1.x):

```markdown
# TC-API-ORDERS-001 — Create order contract
**Feature:** orders  **Plan:** qa/plans/orders/2026-09-01-test-plan.md
**Type:** api  **Module:** orders  **Priority:** P0
**Tags:** @api @orders @P0 @smoke @req:REQ-001

## Preconditions
```

After (2.0.0):

```markdown
# TC-API-ORDERS-001 — [Orders · API] POST /orders — Clerk submits one line for an active customer → 201, order Open
**Feature:** orders  **Plan:** qa/plans/orders/2026-09-01-test-plan.md
**Type:** api  **Module:** orders  **Priority:** P0
**Platform:** api
**AC:** AC-001
**Tags:** @api @orders @P0 @platform:api @smoke @req:orders/REQ-001

## Objective
POST /orders creates an order from a valid payload.

## Technique
- EP → positive

## Isolation
- creates: one order per test (factory)
- cleans: the order is deleted in teardown
- actor: Clerk (pool account)
- lock: none

## Preconditions
```

- Title: `[<Module> · <Platform>]`, the screen or `METHOD /path`, the actor and action, `→ <expected>`;
  no `Verify that` / `works` / `successfully`; ≤ 140 characters (`CONTRACTS §7 Title`).
- Platform: `**Platform:**`, the `@platform:` tags and the title label agree. A case still missing
  `**Platform:**` is a warning (inferred default) until 2.1, when it becomes an error.
- Priority: not above its REQ's priority unless a `Priority reason:` line names an authz/security
  denial or data integrity (`CONTRACTS §7 Priority`).
- `**AC:**` names ids from the analysis AC register, or `—`.
- Spec titles repeat the case id and title; `test.step('Step N: …')` numbers run 1..n.

### Finding every case to fix

```bash
cd qa
npm run qa:lint                                  # every ERROR / WARN, one line each, with the rule
npm run qa:lint 2>&1 | grep ERROR | cut -d: -f1 | sort | uniq -c | sort -rn   # files by error count
npm run qa:lint 2>&1 | grep -E "missing section|title:|\*\*Platform:\*\*|\*\*AC:\*\*"   # the 2.0.0 rules
```

Fix in this order, re-running `qa:lint` after each: plans (§4 headings), case headers and titles, case
sections, spec titles, then the warnings (`@req:<slug>/REQ-NNN`, `**Platform:**`). Then `npx tsc
--noEmit` and a smoke run.

### Rollback

`afx update --bundle qa --ref v1.0.0` restores the 1.x bundle files. Then `npm ci` in `qa/`. Specs,
`.env` files and cases you already migrated will not compile or lint under 1.x; roll back before you
migrate them, or keep the migration on a branch.

## Template

Copy this for every MINOR that needs steps and for **every** MAJOR (CONTRIBUTING.md, "Releasing").
The heading must name the version, e.g. `## 3.0.0 (MAJOR, from 2.x)`.

```markdown
## X.Y.0 (MAJOR|MINOR, from <previous>)

One paragraph: what breaks or what you gain, and who is affected. Say whether CONTRACTS §16 moved.

1. `afx update --bundle qa`, then `npm ci` in `qa/`.
2. <each manual step, as a command or a file to edit, with a before/after snippet>
3. `npm run qa:lint`, `npx tsc --noEmit`, smoke — and what to expect (which warnings remain).

Rollback: `afx update --bundle qa --ref v<previous>`; artifacts written under the new version may fail
the old linter.
```
