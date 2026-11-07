---
name: ingesting-run-results
description: Use to fold an executed run (CI JUnit/JSON, k6, axe) into a run folder, failure detail and traceability run columns (/qa-ingest).
version: 1.1.0
---

# Ingesting Run Results

> Profile first, by section (`profile.mjs`) — `§Test types`, `§Environments`, `§Quality gates`.
> The QA root defaults to `<qa-root>/` (profile-overridable).

## Prime directive — record, never execute
This skill runs no test, re-runs nothing, and fixes nothing. It turns results somebody else produced
into the evidence this bundle's gates read. Everything `executing-tests` may not do, this may not do
either: no edit to a case, a script, application code, or any traceability column other than the run
columns (`Last run`, `Status`, `Report`).

A run nobody can retrace is not evidence. If the input names no case id, says nothing about pass or
fail, or cannot be placed in time, say so and stop — never fill a column from an assumption.

## Action
Fold one already-executed run for a slug into `<qa-root>/runs/<type>/<slug>/<run-id>/` and the plan's
`## Traceability (Requirement ↔ Case)` run columns, with the same failure-detail contract
`executing-tests` writes (`CONTRACTS §5`).

## Step 1: Locate the plan and the inputs
Read the slug's newest `<qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md` and its traceability table — it is
the only list of cases that exist. Then read `--from`:

| Input | Shape | Carries |
|---|---|---|
| `junit.xml` (Playwright, pytest, JUnit 5, WDIO) | `<testsuite>` / `<testcase name=… time=…>` with `<failure>` / `<skipped>` | case id in the name, verdict, duration, message |
| `results.json` (Playwright) | the JSON reporter's suites/specs tree | the same, plus attachments and retries |
| a directory | any of the above plus `k6-summary.json`, `axe-*.json`, `zap-report.json`, `coverage/` | the native artifacts to copy verbatim |
| a URL | a CI artifact archive | download it first; refuse if it is not reachable without credentials this bundle may not hold |

`--type` narrows which type's rows are touched; without it, derive the type from each matched case
id's stem (`CONTRACTS §1`). `--env` records which environment ran; without it, read it from the
report's own metadata, and when that is absent say `env: unknown` rather than guessing.

## Step 2: Map every result to a case id
The Case ID appears verbatim in the test title (`CONTRACTS §15` and the generating skills put it
there). Match it against the traceability rows:

- **Matched** → the row this result updates.
- **Result with no row** — a test exists that this bundle never designed. Report it in the summary
  under `unmapped (n)` with its title; write no row. It is a finding for `/qa-review` or
  `/qa-design`, not a silent addition.
- **Row with no result** — the case did not run. Leave its run columns exactly as they were; a
  missing result is not a pass and not a failure.

Several results for one case id (a matrix: browser projects, devices, locales) collapse into one
row: ❌ if any project failed, ⛔ if any was blocked and none failed, ✅ only when every project
passed. The summary names which project failed.

## Step 3: Choose the run id
`--run-id`, or else the result's own finish timestamp rounded to the minute (`YYYY-MM-DD-HHmm`,
`CONTRACTS §1`). Never `now` — a run is stamped when it ran, not when it was ingested, or the
report's `stale` check (`CONTRACTS §17`) compares against the wrong moment. A run id that already
exists for this type and slug is an error: ingesting twice would overwrite the first run's evidence.

## Step 4: Write the run folder
Create `<qa-root>/runs/<type>/<slug>/<run-id>/` and write exactly what `executing-tests` Step 3 defines for
that type, from the ingested data only:

- `summary.md` — per-case verdict, counts (pass/fail/blocked), env, duration, and a header line
  naming **where the run came from**: `source: CI job <id | url> · ingested YYYY-MM-DD` (so a reader
  can tell an ingested run from a locally executed one).
- `failures.md` — the Step 4 failure-detail contract for every non-pass: case id, spec path, step,
  the quoted error, artifact paths, the classified cause (`FUNCTIONAL | SCRIPT | SETUP/ENV`), and
  the next step. Classify from the message and the artifacts, exactly as after a local run —
  `npm run qa:triage -- <run folder>` first (after the native artifacts are copied), one decision per group.
- The native artifacts, copied verbatim: `junit.xml`, `results.json`, traces, `k6-summary.json`,
  `findings.md` for security and accessibility runs (the 7 columns, built from `axe-*.json` /
  `zap-report.json` as `executing-tests` specifies), `coverage-summary.md` for unit runs,
  `device-matrix.md` for mobile runs. What the input did not contain is `not evaluable`, never
  reconstructed.

**Never `FLAKY`.** That token means one immediate unchanged re-run passed, and this skill performed
no re-run. A case that failed an early CI attempt and passed a later one is ❌ with
`retried-in-ci: attempt <n> of <m> passed` as a detail line in its failure entry, and the summary
lists it under `retried in CI (n) — not triaged as flaky`. Deciding it is flaky needs `/qa-run` or
the user's judgement (`CONTRACTS §5`, `§12`).

## Step 5: Update the run columns
For each matched row: `Last run` = the run id, `Status` = ✅ / ❌ / ⛔, `Report` = the run folder
path. Nothing else — not `Scripted`, not `Priority`, not a design column. If the row's existing
`Last run` is newer than this run id, leave the row alone and list it in the summary under
`older than the recorded run (n)`: ingesting an old CI run must never walk the table backwards.

## Step 6: Report ONLY this summary to chat
```
✓ Ingested <type> run <run-id> (<env>) → <qa-root>/runs/<type>/<slug>/<run-id>/
  {n} cases: {p} ✅ · {f} ❌ · {b} ⛔ | unmapped: {u} | not in this run: {m} | retried in CI: {r}
✗ Failures (see failures.md): {case-id → classified cause}, …
→ Next: /qa-defect <slug> (FUNCTIONAL) · /qa-heal (SCRIPT) · /qa-report <slug>
```

## Done when
- [ ] Every result mapped to a case id, or reported as `unmapped`; no row invented.
- [ ] Run folder written with `summary.md` (naming its CI source), `failures.md` for every non-pass,
      and the native artifacts copied; what was absent says `not evaluable`.
- [ ] No failure classified `FLAKY`; CI retries reported as `retried-in-ci`.
- [ ] Only run columns touched; rows with a newer `Last run` left alone and listed.
- [ ] `npm run qa:lint` clean.
