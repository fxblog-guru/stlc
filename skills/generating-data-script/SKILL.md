---
name: generating-data-script
description: Use for /qa-script --type data: a TC-DATA case into a dbt or PySpark test, staged.
version: 1.0.0
---

# Generating Data Pipeline Test Scripts

> Profile first, by section (`profile.mjs`) — `§Data testing` (layer → repo path, engine, test dirs,
> test-file convention, result files, Write mode), `§Test types`. QA root defaults to `<qa-root>/`.

> **The exception you operate under (CONTRACTS §9.6 / §28):** write outside `<qa-root>/` only under
> the `§Data testing` test directories, only in Write mode `apply`, only test files. Models, jobs,
> DAGs and macros are never edited; a missing seam is a `TESTABILITY-GAP` row in HANDOFF.

## Action
Turn ONE `TC-DATA-*` case into ONE test file in the engine its layer declares. Always write the staged
mirror `<qa-root>/scripts/data/<module>/<same-TC-basename>.<ext>` and upsert the case's row in
`<qa-root>/scripts/data/HANDOFF.md` (heading `# Data-test handoff`, CONTRACTS §11 columns); in `apply`
also write it to its Target path. Flip `Scripted` ❌ → ✅ after the offline gate. Never run the suite
here; execution is `/qa-run --type data`.

## Which file for which oracle

| Oracle | dbt (`transform` layer) | PySpark (`ingest` layer) |
|---|---|---|
| row-count · distinct-keys · sum · min-max | singular test `.sql` returning one row when the two sides differ | `reconcile(source, target, keys, measures)` assertion |
| row-hash | singular `.sql`: full outer join on key, hash via the project's `normalized_row_hash` macro, return mismatched keys | `reconcile(..., hash_columns=…)`; assert `hash_mismatched_keys == []` |
| conservation | singular `.sql`: anti-join both ways + null-key count | `conservation(raw, prepared, quarantined, keys)` |
| unit-rows | dbt `unit_tests:` entry in the model's `_*.yml` (given rows → expect rows) | pytest with a row factory; given rows → exact output rows |
| rule · pii-shape | singular `.sql` returning the violating rows | DataFrame filter, assert empty, sample travels with the failure |
| schema | `expect_table_columns_to_match_set` on the source | `diff_schema(actual, contract)` |
| freshness | source `freshness:` block | n/a (warehouse side) |
| idempotent-rerun · late-data · backfill | a step in the layer's drill runner (`ci/run_ci.py`), never a single test | pytest that runs the job twice on one window |

## Rules

| # | Rule |
|---|---|
| 1 | **The Case ID is in the file**: `meta: {tc_id: "TC-DATA-…"}` in the dbt config, or the pytest docstring/marker, so result files map back to the traceability row. |
| 2 | **Every check in `## Oracle` appears**, in order, as one assertion or one returned-row condition. A check the engine cannot express is `-- COVERAGE-GAP: <check> — <why>` and is reported, never dropped. |
| 3 | **The window filter is on both sides**, each with the column `## Hop` names; use the project's helper macro (e.g. `settled_before`) when it has one. |
| 4 | **Tolerance is a literal from `## Tolerance`**, with the reason and owner as a comment beside it. `exact` means `!=`, not `> 0.0001`. |
| 5 | **Aggregate in the column's type**; never cast money to double to compare it. |
| 6 | **Return the evidence**: singular tests select the key and both values, so the failing rows land in `store_failures` audit tables. |
| 7 | **Cross-engine SQL goes through the project's dispatch macros** (`md5_hex`, `regex_matches`, …), so the same test runs on the CI engine and the warehouse. |
| 8 | **REUSE > CREATE**: existing macros, factories and fixtures first; a new helper is listed in HANDOFF Notes. |

## Offline gate (before flipping ✅)
- dbt: `dbt parse` on the CI target succeeds with the staged file in place (staged copy in a temp project when `propose`).
- PySpark: `python -m py_compile` on the file; the Case ID string is present.
- The file name follows the §Data testing test-file convention; the HANDOFF row exists.

## Report ONLY
```
✓ Staged {n} data test(s) under <qa-root>/scripts/data/ · HANDOFF rows {upserted}
Write mode: {propose|apply} · COVERAGE-GAPs: {list or none} · TESTABILITY-GAPs: {list or none}
Next: /qa-run <slug> --type data  (runs the declared Run command, then the Mutation command)
```
