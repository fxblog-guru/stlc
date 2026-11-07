---
description: Fold a CI run's JUnit/k6/axe results into a run folder and the traceability run columns.
disable-model-invocation: true
argument-hint: <slug> --from <junit.xml | dir | url> [--type …] [--env …] [--run-id YYYY-MM-DD-HHmm]
---

Follow `qa-phase-protocol` (invoke the skill if it is not already in context); this file holds only what is specific to this command.

Ingest an already-executed run for `$ARGUMENTS` through `ingesting-run-results`: the pipeline ran
the suite, this command gives its results the same run folder, failure detail and traceability
columns a local `/qa-run` would have produced, so a CI run is evidence like any other.

`/qa-run` executes and records; this command only records. It runs nothing, re-runs nothing and
never decides a verdict — `/qa-report` still does that from the artifacts.

## When

- The suite runs in CI (the usual case: `<qa-root>/ci/` jobs) and the traceability table would otherwise
  stay empty, or carry a stale `Last run` from the last local execution.
- A teammate ran the suite on their machine and shares the result files.
- A nightly or cross-browser matrix produced results nobody has folded in yet.

## Refuse

- To ingest a file that names no case id this bundle knows: a result that cannot be traced to a
  `TC-…` row is not evidence, and inventing the mapping would make the table lie.
- To ingest into a slug whose plan has no traceability table yet (`/qa-plan` first).
- To re-run, heal or fix anything. A `FUNCTIONAL` failure ingested here goes to `/qa-defect`, a
  `SCRIPT` one to `/qa-heal`, exactly as after `/qa-run`.
- To write a `FLAKY` triage from a CI retry. CI retries are configured, not observed: the rule in
  `CONTRACTS §5` is one immediate unchanged re-run, and this command did not perform it. A case
  that passed only on a CI attempt after the first is ingested as ❌ with
  `retried-in-ci` in its failure entry, and the `FLAKY` decision stays with `/qa-run` or the user.
