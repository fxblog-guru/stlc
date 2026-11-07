# ELT heuristics — what a data suite must be able to catch

Loaded by `designing-data-cases` Step 1–2. Each row is a defect class seen in real pipelines, the
oracle that catches it, and the fixture row that makes the check able to fail. Coverage is judged
against this file: a row is designed or recorded `N/A — <reason>`.

## Hop relationships

| Relationship | Meaning | Expected | Typical oracles |
|---|---|---|---|
| `exact` | 1:1 copy or typing (RAW → RAW_PREPARED staging) | equal counts, keys, sums, row hashes | row-count, distinct-keys, sum, row-hash |
| `dedup` | latest row per key wins | target rows = source distinct keys; content = the latest row | distinct-keys, row-hash against the deduped source; `duplicates_removed` measured |
| `filtered` | rows move to a quarantine | source = target + quarantine, by key | conservation, row-count per reject reason |
| `aggregated` | target grain is coarser | Σ measures equal; target rows = distinct source grain | sum, distinct-keys, min-max |
| `source` | one side only (landing, a mart's own rule) | the rule holds | schema, freshness, rule, pii-shape |

Compare a dedup hop against the **deduplicated** source. Summing every source row, duplicates
included, against the mart goes red on any day an order is re-sent.

## Defect classes

| # | Defect | Oracle | Fixture row that makes it fail |
|---|---|---|---|
| 1 | Rows dropped by a filter nobody declared | row-count, conservation | a row the filter would hit (e.g. status `cancelled`) |
| 2 | A value changed in the cast (rounding, truncation, timezone) | row-hash, sum | `99.99` amount, a timestamp at 23:59:59, a long string |
| 3 | Cast silently produced NULL (`'abc'` → integer) | conservation (uncastable reason), not_null downstream | a non-numeric value in a numeric column |
| 4 | Dedup kept the stale row | row-hash against latest-per-key | the same key loaded twice with different status |
| 5 | Dedup depends on physical order | unit-rows with the rows in reverse order | two loads, latest listed first |
| 6 | Join fan-out (duplicate keys on the right side) | distinct-keys, row-count | a dimension key present twice |
| 7 | Unmatched join key dropped (inner instead of left) | conservation, unit-rows | a fact row with no dimension row |
| 8 | Late-arriving dimension | unit-rows, rule | a fact before its dimension row exists |
| 9 | Incremental window misses late data | late-data drill | a row older than the lookback |
| 10 | Re-run duplicates rows | idempotent-rerun drill | run the same window twice |
| 11 | Backfill differs from incremental | backfill drill | rebuild one historic partition |
| 12 | Schema drift upstream | schema (missing, retyped, new) | drop / retype one source column |
| 13 | Stale source, green pipeline | freshness on a schedule independent of the DAG | an old `_loaded_at` |
| 14 | PII unmasked | pii-shape (the column IS a hash: `^[0-9a-f]{64}$`) | a raw email, a phone number, a name |
| 15 | Business total wrong (qty × price ≠ total) | rule with an owned tolerance | a row off by one cent |
| 16 | Case / whitespace variants split one value | unit-rows, accepted values after normalization | `PAID`, ` paid ` |
| 17 | Floating-point aggregation drift | sum in the column's own decimal type | a sum near 10^15 with a cent difference |
| 18 | Empty load treated as "no data today" | row-count minimum, freshness | an empty landing |
| 19 | Month/day boundary (partition date vs timestamp) | unit-rows, recon per partition | 23:59:59 on the last day of a month |
| 20 | Cross-engine hash disagreement (Spark vs warehouse) | golden vectors shared by both engines | a NULL, a padded string, a timestamp |

## Rules for the oracle

- **Counts are necessary, never sufficient.** A count cannot see a changed value (#2, #4).
- **Key level beats total level.** A conservation or hash anti-join names the exact key that moved; a total only says "different".
- **Silence is red.** No result file, zero tests, a skipped test, a hop with no checks: ⛔, never ✅.
- **Late-arrival window on every recon**, on both sides, each with its own settled column (a mart may have no `_loaded_at`).
- **Aggregate in the column's own type.** A double cast hides or invents cents.
- **Tolerance defaults to exact**; a non-exact one carries `reason:` and `owner:`.

## Mutation set the suite must kill

A data suite counts toward a gate only when its mutation command plants and catches at least these
(adapt names to the project): dedup keeps the oldest row · staging drops rows · amount loses cents ·
mart drops zero-value rows · normalization removed · hash separator changed · PII column replaced by
a raw value. A planted defect no test catches is a gap in the suite. Fix the suite, never the mutant.
