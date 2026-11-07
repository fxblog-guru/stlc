---
name: designing-data-cases
description: Use to design TC-DATA cases per pipeline hop: recon, transforms, rules, PII, drills.
version: 1.0.0
---

# Designing Data Pipeline Cases (ELT / ETL)

> Profile first, by section (`profile.mjs`) — `§Test types` (is `data` enabled), `§Data testing`
> (readiness R1–R8, layers, engine, test dirs, conventions, Write mode), `§Domain knowledge`.
> QA root defaults to `<qa-root>/`. Contract: CONTRACTS §28 (`## Hop` / `## Oracle` / `## Tolerance`).

> **Domain grounding**: business rules (`BR-###`), grains and tolerances resolve through
> `<qa-root>/wiki/compiled/index.md` when it exists (cite page + `sources:`); wiki silence is a gap.
> **Code grounding**: model, column and macro names resolve through `grounding-in-code` against the
> pipeline repo, cited `<layer>:<path>#<symbol> @ <sha>` in `## Data`. Never invent a column.

## Prime directive — prove the data, not that the job ran
A green job, a green `dbt test` and equal row counts all happen on pipelines that publish wrong
numbers. Each hop has an expected relationship between its two sides; the case states that
relationship and checks it at the value level. A check that cannot fail on a planted defect is not
a case — the suite's mutation command proves it before the data gate counts (CONTRACTS §28).

## Inputs — resolve before designing (STOP conditions)
1. `<slug>`; latest analysis and plan with the traceability skeleton — missing → STOP.
2. `data` enabled AND `§Data testing` readiness R1–R8 all filled. Any empty row → STOP with
   `> **Project setup required:** fill PROJECT-PROFILE §Data testing <row ids>`. Never guess a grain,
   a relationship, a tolerance or a rule; ask for it.
3. Lessons: `npm run qa:learn -- recall --skill designing-data-cases --type data`; read the hits whose
   probe is a question this design faces.

## Step 1: Map the hops
From R3, list every hop the slug's models touch: `from → to`, relationship, grain, window. Classify
each (`references/elt-heuristics.md` § Hop relationships). A hop with no declared relationship is a
question for the data engineer, not a default.

## Step 2: Case seeds (minimums)
Walk `references/elt-heuristics.md`; for each row design the case or write `N/A — <reason>` in the
summary. The floor per slug:

- **Per hop** → 1 recon case: `row-count` + `distinct-keys` + a value oracle (`sum` on each money
  measure, `row-hash` on P0 hops). Dedup hops add a dedup-correctness case (latest row wins, by hash).
- **Per cleansing hop** → 1 `conservation` case (nothing vanished, nothing invented, null keys
  quarantined) and 1 case per reject reason in the contract.
- **Per transformation model** → `unit-rows` cases for: normal row · null in each nullable input ·
  duplicate key · case/whitespace variants · boundary values · empty input · the join's unmatched key.
- **Per business rule** (R4) → 1 `rule` case returning violating rows; tolerance from the rule's owner.
- **Per protected column** (R6) → 1 `pii-shape` case asserting the masked shape (positive pattern),
  never a search for one leak pattern.
- **Per source** → `schema` (drift: missing, retyped, new column) and `freshness` against R5.
- **Per incremental model** → drills: `idempotent-rerun`, `late-data` (inside window picked up,
  beyond window caught by recon), `backfill` (full refresh recovers).

Priority: P0 = money, counts that feed a decision, PII, a hop consumers read directly; P1 =
intermediate hops and rules on P0 data; P2 = reference data, freshness warn; P3 = cosmetic columns.

## Step 3: Write each case (never print cases to chat)
Skeleton: `<qa-root>/_templates/case-data.md`. `## Hop`, `## Oracle`, `## Tolerance` per CONTRACTS §28;
`## Steps` = the checks in run order, each `Expected:` naming the value (`target rows = 1 204 =
source distinct keys`, `0 violating rows`). `## Data` names the fixture rows that make each check able
to fail (R7) — a fixture with no duplicate cannot test dedup. Title: `[<Module> · API] <from> → <to>
— <check> → <expected>`, ≤ 120 chars. `## Grounding` lists the contract, hop map and BR pages opened.

## Step 4: Placement, ids, traceability
Path `<qa-root>/cases/data/<module>/TC-DATA-<MODULE>-<NNN>-<short-desc>.md`; `<module>` = the business
domain of the target model (via `resolving-test-placement`). Mint with `sizing.mjs next-id`, add rows
with `sizing.mjs trace-upsert` (`Scripted` ❌). Identity = hop + oracle intent, never the NNN.

## Step 5: Report ONLY this summary
```
✓ Reconciled <qa-root>/cases/data/: created {N} · updated {M} · unchanged {K} · orphaned {P}
Hops: {n} ({exact} exact · {dedup} dedup · {filtered} filtered · {agg} aggregated) | Value oracles on P0/P1: {k}/{n}
N/A: {heuristic row + reason} | TESTABILITY-GAPs: {list} | Readiness questions: {list or none}
Next: /qa-script <slug> --type data
```

## Done — ALL must be true
- [ ] Every hop in scope has a recon case with a value oracle; dedup and cleansing hops have their extra cases.
- [ ] Every non-exact tolerance names a reason and an owner the business gave.
- [ ] Every case's fixture rows can make its checks fail; lint passes (`qa:lint`, CONTRACTS §28).
- [ ] Heuristic rows designed or `N/A — reason`; only the Step 5 summary printed.
