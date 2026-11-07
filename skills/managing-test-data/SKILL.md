---
name: managing-test-data
description: Use to consolidate [DATA:*] preconditions into docs/test-data.md: factories, actors, cleanup, refresh, synthetic PII (before /qa-script).
version: 1.1.0
---

# Managing Test Data

> Profile first, by section (`profile.mjs`) — `§Environments` (where data lives), `§Application
> under test` (auth mode, named actors, account pool, DB seam), `§Test types`. QA root defaults to `<qa-root>/`.

## Prime directive — every placeholder resolves, no real user data ever
Every `[DATA:*]` token any case uses must resolve to one glossary entry with a concrete provisioning
strategy — a case whose data token is undefined is unscriptable. All data is synthetic; copying
production PII into any environment is a hard violation, whatever the convenience.

## The model the scripts implement (`<qa-root>/scripts/shared/README.md`)
The contract this skill writes is executed by the Playwright kit, so it speaks the kit's terms:

| Concept | In the kit | What `test-data.md` records |
|---|---|---|
| **Factory** | `shared/data/<module>.factory.ts`: `build(overrides)` (valid payload, no I/O) · `create(overrides)` (API, asserts success, registers its undo) · `withMember(role, account)` | which factory method provisions each token, with which overrides |
| **Cleanup ledger** | `cleanup` fixture (`shared/data/cleanup.ts`): undo registered at creation, run after the test newest-first, whatever the outcome; `QA_KEEP_ON_FAIL=1` keeps a failed test's data | the undo per entity (and the order for non-cascading children) |
| **Unique names** | `uniqueName(label)` → `qa-<QA_RUN_ID>-w<worker>-<n>-<label>`; `uniqueEmail(domain)` | the label, and fields that must carry the prefix (sweepable) — never `Date.now()`/random |
| **Named actors** | `TEST_USER` (= `default`), `TEST_USER_<NAME>` — GLOBAL roles, shared by every worker | which tokens need which named actor; named actors are **read-only identities** (never change the account) |
| **Account pool** | `TEST_POOL_USER` template × `TEST_POOL_SIZE`, `TEST_POOL_PER_WORKER` per worker, disjoint slices | which tokens need a pool account, and which per-object role the factory grants it |
| **Sweeper** | deletes leftovers by the `qa-` prefix | the prefix-bearing field per entity |

Golden reference, in the bundle repo: `tests/golden/qa/scripts/shared/data/projects.factory.ts`
(`build` / `create` / `withMember`) and the specs that use it under `tests/golden/qa/scripts/`.

## Action
Create or update `<qa-root>/docs/test-data.md` — the single test-data contract that script generation and
execution read.

## Inputs — resolve before writing (STOP conditions)
1. Designed cases for at least one feature (located via the plans' traceability tables). No cases →
   STOP: "nothing to consolidate — run /qa-design first".
2. Existing `<qa-root>/docs/test-data.md` (update in place — never orphan entries other features still use).

## Step 1: Harvest the demand
Scan every case's Preconditions/steps for `[DATA:*]` tokens and implicit needs (named accounts,
roles, seeded entities, boundary values). One inventory row per distinct token:
`| Token | Entity | Needed by (Case IDs) | Constraints (role/state/boundary) |`. A token used with
conflicting constraints across cases is a **finding to report**, not something to silently merge.

## Step 2: Assign a provisioning strategy per entity
| Strategy | When |
|---|---|
| **Factory** (default) — `<module>Factory.create()` in the test, unique per test, on the ledger | every entity a test reads with mutable attributes or mutates |
| **Factory + grant** — `withMember(role, pool[0])` | a per-object role (project member, viewer): the role is DATA granted to this worker's pool account on an entity the test just created — never a shared "viewer" login |
| **Named actor** | a GLOBAL role that is a property of the account (system admin, auditor) — read through it, create data it owns, never change it |
| **Pool account** | a case that changes an account (password, lock-out, profile, sign-out-everywhere) — a pool account, never a named actor |
| **Static seed** (SQL/fixture committed under `<qa-root>/fixtures/`) | stable reference data nobody mutates (roles, catalogs, the pool accounts themselves) |
| **API-created** inside the factory | creation IS an app behaviour and DB writes would bypass validation — the factory calls the app's API, as it does by default |

Static seed for anything a test mutates is flagged — shared mutable state breaks parallel runs,
shards and `--shuffle`. State the product makes impossible to isolate (a single global setting) is
flagged too: the scripts give those cases a `lock:` (`caseMeta`), and the glossary names the lock.

## Step 3: Lifecycle & environment policy
Per entity: the undo the factory registers (non-cascading children are registered after their
parent so the ledger deletes them first), refresh cadence for seeds (per-run / nightly /
on-demand), and per-env availability from `§Environments`. **Pool sizing:** the env needs
`workers × TEST_POOL_PER_WORKER` pool accounts per concurrent run (CI shards run concurrently —
multiply by shards); the setup project refuses to start with fewer. Perf data pools sized from the
performance scenarios' `## Workload` (enough uniques to avoid cache-hit lies; distinct users → pool).

## Step 4: PII rules
Fields classified person-identifying get: generator note (synthetic, e.g. `uniqueEmail('<test
domain>')`), explicit "never sample production" line, and masking expectation if the app displays
them. This section exists even when empty ("no PII fields identified — reviewed YYYY-MM-DD").

## Step 5: Write the contract + summary to chat
`<qa-root>/docs/test-data.md` sections:

1. **Glossary** — `| Token | Entity | Strategy | Factory call | Actor | Cleanup | Needed by |`
   (e.g. `| [DATA:project-viewer] | project | factory + grant | projectsFactory.withMember('viewer', pool[0]) | pool | delete project (ledger) | TC-SEC-PROJECTS-001 |`).
2. **Actors** — named actors (`TEST_USER_<NAME>` → global role, read-only) and the pool
   (template, size, per-worker, per-object roles granted to it).
3. **Seed files** — paths under `<qa-root>/fixtures/` (pool accounts, reference data).
4. **Locks** — state that cannot be isolated, the `lock:` name and the cases that take it.
5. **PII rules** → 6. **Per-env notes** (pool size per env) → 7. **Open conflicts** (Step 1 findings).

Then print:
```
✓ Updated <qa-root>/docs/test-data.md — {n} tokens resolved, {m} entities ({f} factory / {g} factory+grant / {a} named actor / {s} seed)
Pool: {size} accounts per env (needs ≥ workers × per-worker) | Locks: {list or none}
Conflicts to resolve: {list or none} | Unresolved tokens blocking /qa-script: {list or none}
```

## Done — ALL must be true
- [ ] Every `[DATA:*]` token in scope has exactly one glossary entry with strategy, factory call, actor and cleanup.
- [ ] Mutable entities come from factories (unique names, on the cleanup ledger); per-object roles are granted to pool accounts; named actors are read-only; anything shared and mutable is flagged or locked.
- [ ] Pool sized for workers × per-worker (× concurrent shards); PII section present; synthetic-only rule stated.
- [ ] Existing entries for other features preserved; conflicts reported, not merged silently.
