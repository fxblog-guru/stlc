---
description: Defect lifecycle: raise from FUNCTIONAL failures, --verify closes from passing runs, re-open on recurrence.
argument-hint: <slug> [--verify] [--from-exploratory <XS-id | path>]
disable-model-invocation: true
---

Follow `qa-phase-protocol` (invoke the skill if it is not already in context); this file holds only what is specific to this command.

> Profile first, by section (`profile.mjs`) — `§Quality gates` (severity impact), `§Test management`
> (optional ADO push). QA root defaults to `<qa-root>/` (profile-overridable).

Run the defect lifecycle for feature `$ARGUMENTS` (first token = slug). Every invocation starts with
the **verify pass** (OPEN defects whose case passed a newer run → CLOSED with `Resolution: fixed
(verified <run-id>)` + `## Verification` line; recurrences appended; re-opens per CONTRACTS §13).
`--verify` runs only that pass. `--from-exploratory` raises the `candidate` rows of a session sheet
with `**Origin:** EXPLORATORY`.

## Preconditions (check before delegating)

- [ ] Raise mode: the plan's traceability table has at least one `Status ❌` row and those rows'
      `Report` dirs exist under `<qa-root>/runs/` with `failures.md`
- [ ] Verify mode: at least one OPEN defect file names a `**Case:**` (else "nothing to verify")
- [ ] `--from-exploratory`: the sheet exists with `## Bugs` rows in `Status` = `candidate`

No ❌ rows and nothing to verify → report it and stop. A ❌ row without run evidence is a data gap
to report — never invent a defect from memory of a failure; a defect is never closed from memory.

## Routing rule (hard constraint)

Only FUNCTIONAL-class failures become defects. SCRIPT → prescribe `/qa-heal`; SETUP/ENV →
prescribe the setup fix (or `/qa-env`); FLAKY → prescribe `/qa-quarantine` once the flake budget is
met. Skipped failures are listed, never silently dropped. A quarantined case with a FUNCTIONAL
failure still gets its defect. `CLOSED` needs a `**Resolution:**`; `fixed` needs a verification run
recorded in the file; `not-a-bug` / `duplicate` / `wont-fix` need the user's stated decision.

## Execution

Delegate to the `qa-reporter` agent (it invokes the `reporting-defects` skill), passing the slug
and the plan path. Output:

- Verify pass: `**Status:** CLOSED` · `**Closed:**` · `**Resolution:** fixed (verified <run-id>)` ·
  `## Verification` line on every proven-fixed defect; `## Recurrence` lines on still-failing ones;
  re-opened files back to OPEN; ESCAPED closures mirrored in `<qa-root>/defects/ESCAPES.md`.
- `<qa-root>/defects/<slug>/DEF-<slug>-NNN-<short>.md` per new defect — header fields per CONTRACTS §13
  (`Origin: INTERNAL` or `EXPLORATORY`), severity from the mapping table, steps from the case,
  Expected/Actual verbatim, evidence paths into `<qa-root>/runs/` (or the session sheet).
- Recurrences appended to existing OPEN defects instead of twins.
- `@defect:DEF-…` tag appended to each affected case's `**Tags:**` line; exploratory sheet rows set to
  `raised DEF-…`.
- Tracker Bugs ONLY if `§Test management` is configured AND the user confirms the shown list —
  ADO Bug work items via the scripts' env vars, Jira issues via the Atlassian MCP
  (`publishing-test-cases/references/jira-adapter.md`); real ids written back as `@tms-bug:<id>`.

## Done criteria

Report back: verify-pass results (closed / recurrences / re-opened / awaiting re-run), new defect ids
with severity and origin, skipped failures with their prescribed route, tracker ids (if pushed), and
the reminder that a defect closes only from a passing run recorded in its file
(`/qa-run` → `/qa-defect <slug> --verify`).
