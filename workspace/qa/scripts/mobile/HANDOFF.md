# Mobile-test handoff

<!-- The bridge between <qa-root>/scripts/mobile/ (staged, QA-owned) and the mobile automation repo's test
     directories (mobile-developer-owned). Written by generating-mobile-script (one row per TC-MOB
     case, identity = Case ID, rows never deleted); Status advanced by the mobile developers or
     /qa-run --type mobile. Columns and heading are byte-exact per .claude/CONTRACTS.md §15 and
     checked by `npm run qa:lint`.
       Status ∈ proposed | applied | merged | rejected | superseded
       Write mode ∈ propose | apply (as it was at generation time)
       Applied = YYYY-MM-DD when applied/merged, else —
     Notes carry, in order: FRAMEWORK-GAP: <exact method signatures the framework must add>,
     "extends <file>" when the spec appends to an existing suite file, "REAL-DEVICE: <reason>",
     "> Project setup required:" items, and the MR link. The framework's src/ is never edited by
     this bundle — every gap is a request to the mobile developers. -->

| Case ID | Staged script | Target path | Write mode | Status | Applied | Notes |
|---|---|---|---|---|---|---|
