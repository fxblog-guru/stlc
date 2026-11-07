# Escaped defects

<!-- One row per defect that reached production / a customer / a later phase than the one that
     should have caught it. Written by /qa-escape (analyzing-escaped-defects); the Backfill cell is
     filled by the designing-* skills when the closing case exists. Feeds the defect escape rate in
     /qa-metrics. Heading and columns are byte-exact per .claude/CONTRACTS.md §13.
       Phase missed ∈ ANALYZE | PLAN | DESIGN | SCRIPT | RUN | ENV | QUARANTINE | OUT-OF-SCOPE
       Type missed  = the test type that should have caught it, or —
       Backfill     = TC id(s) designed since, or pending -->

| DEF | Feature | Reported | Phase missed | Type missed | Backfill | Status |
|---|---|---|---|---|---|---|
