# Quarantine ledger

<!-- Written ONLY by /qa-quarantine (curating-regression, quarantine mode). One row per grant;
     identity = (Case ID, Since); rows are never deleted — a release fills Released, an extension
     appends a NEW row. Until ≤ Since + 30 days. Evidence = run-ids whose failures.md carries the
     FLAKY triage. The case file carries the matching @quarantined:<Until> tag. Heading and columns
     are byte-exact per .claude/CONTRACTS.md §12 and checked by `npm run qa:lint` (expired +
     unreleased rows fail the lint). -->

| Case ID | Since | Until | Reason | Evidence | Ticket | Released |
|---|---|---|---|---|---|---|
