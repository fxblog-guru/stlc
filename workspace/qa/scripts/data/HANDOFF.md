# Data-test handoff

<!-- The bridge between <qa-root>/scripts/data/ (staged, QA-owned) and the pipeline repo's test
     directories (data-engineer-owned). Written by generating-data-script (one row per TC-DATA case,
     identity = Case ID, rows never deleted); Status advanced by developers or /qa-run --type data.
     Columns and heading are byte-exact per .claude/CONTRACTS.md §28 (§11 shape) and checked by `npm run qa:lint`.
       Status ∈ proposed | applied | merged | rejected | superseded
       Write mode ∈ propose | apply (as it was at generation time)
       Applied = YYYY-MM-DD when applied/merged, else —
     Notes carry TESTABILITY-GAP: <seam>, COVERAGE-GAP: <check>, MR links. -->

| Case ID | Staged script | Target path | Write mode | Status | Applied | Notes |
|---|---|---|---|---|---|---|
