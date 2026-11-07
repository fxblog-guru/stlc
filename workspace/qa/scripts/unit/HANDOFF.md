# Unit-test handoff

<!-- The bridge between <qa-root>/scripts/unit/ (staged, QA-owned) and the application repo's test
     directories (developer-owned). Written by generating-unit-script (one row per TC-UNIT case,
     identity = Case ID, rows never deleted); Status advanced by developers or /qa-run --type unit.
     Columns and heading are byte-exact per .claude/CONTRACTS.md §11 and checked by `npm run qa:lint`.
       Status ∈ proposed | applied | merged | rejected | superseded
       Write mode ∈ propose | apply (as it was at generation time)
       Applied = YYYY-MM-DD when applied/merged, else —
     Notes carry TESTABILITY-GAP: <seam>, "extends <file>", MR links, and
     "> Project setup required:" items (e.g. a missing test project or pytest marker). -->

| Case ID | Staged script | Target path | Write mode | Status | Applied | Notes |
|---|---|---|---|---|---|---|
