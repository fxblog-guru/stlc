# Autonomy — running a QA phase unattended (CONTRACTS §24)

Read this when `node <qa-root>/scripts/shared/autonomy.mjs mode` prints `assisted` or `full`. With
`off`, the protocol runs as written.

A human started the run with `autonomy.mjs start --run <run-id> --by <name>`. If there is no
`runs/<run-id>/run.json`, stop and report it.

## What changes

- **§8, a clarification.** In `full`, and for a `non-blocking` question in `assisted`, write the
  sheet row's recommended answer with
  `assumed — autonomous-run <run-id> (started by <name>)` and continue. A `blocking` question in
  `assisted` is asked: stop there and report it. The sheet's recommendation must already exist; an
  agent never invents one to fill the row.
- **§8, the next command.** Do not end after a phase. Run the next phase (design → generate → run
  → report), until done or a stop.
- **Before every outward step**, run `autonomy.mjs check <action> --run <run-id>` and obey the exit
  code. The actions are `push-main`, `merge-main`, `file-defect`, `publish-results`, `delete-data`,
  `suppress-finding` and `quarantine-test`; `security-scan` and `perf-load` take `--env <env>`, and
  the env must be authorised; the sign-off is `release-signoff`.
  - Exit 0: go on.
  - Exit 4: provisional. Note it in the report and go on, on the branch only.
  - Exit 3: stop now, with one line saying why.
- **After every specialist**, add its tokens with `autonomy.mjs budget --run <run-id> --tokens <n>`.
  Exit 3 means stop.

## What does not change

- §4: nothing is fabricated.
- §5: there is evidence before every claim.
- §6: runs never fix.
- The heal guard (§23) still decides what a heal may change.

At the end, `autonomy.mjs report --run <run-id>`. Only a human runs
`autonomy.mjs resolve --run <run-id> --by <name>`, after reviewing the stops; an agent never does.
