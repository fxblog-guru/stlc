---
description: Pre-triage a failed run: where each failure is, failures grouped by cause, a suggested class, new or known.
argument-hint: <run dir | slug> [--type …]
disable-model-invocation: true
---

Follow `qa-phase-protocol` (invoke the skill if it is not already in context); this file holds only what is specific to this command.

> QA root defaults to `<qa-root>/`. Contract: CONTRACTS §5 (the tokens), §13 (defects).

Answer "where did it fail, and is it a bug?" for `$ARGUMENTS` in one read: a run directory, or a slug
(its latest run folder per `--type`, else per type that has one). Use it on a local run you started
yourself, a regression run, or a CI run after `/qa-ingest`.

## Execution

1. From `<qa-root>/`: `npm run qa:triage -- <run dir>` → `<run dir>/triage.md`. It reads `results.json`
   (else `junit.xml`), the `http-log` / `network` / `server-log` attachments, the run folders beside
   it and the defect files. Exit 2 = no results in that folder: say so and stop.
2. Read `triage.md`, not the traces. For each group, open ONLY the representative's evidence (the
   trace or `error-context.md` it names, the `http-log` entry) and decide the CONTRACTS §5 token. A
   `strong` hint is confirmed unless the evidence contradicts it; a `weak` one needs the screenshot
   or trace. The decision applies to every member; a member whose evidence differs is split out.
3. If the run has no `failures.md` yet, write it the way `executing-tests` Step 4 does, one entry
   per member, cause = the group's decision. An existing `failures.md` is not rewritten — print the
   differences instead.

Never `FLAKY` without an observed pass on an identical re-run (the hint says so when the run has
one). This command classifies; it does not heal, raise or quarantine.

## Done criteria

Report back, largest group first: `G<n> · <token> · <n> case(s) · <cause in one line> · <next command>`
(`FUNCTIONAL` → `/qa-defect`, `SCRIPT` → `/qa-heal`, `SETUP/ENV` → the named fix or `/qa-env`,
`FLAKY` → `/qa-flaky` · `/qa-quarantine`), then the new-since-last-run cases and the failures already
on an OPEN defect (no new defect for those — a `## Recurrence` line through `/qa-defect`).
