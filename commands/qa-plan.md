---
description: Step 2 · strategy + test plan with the EMPTY traceability table, coverage and gate targets.
argument-hint: <slug> [--run-plan]
disable-model-invocation: true
---

Follow `qa-phase-protocol` (invoke the skill if it is not already in context); this file holds only what is specific to this command.

> Profile first, by section (`profile.mjs`): it defines the enabled test types (§Test types), the
> gate targets (§Quality gates), the environments (§Environments), and the QA root used below
> (default `<qa-root>/`, profile-overridable).

Plan testing for feature `$ARGUMENTS`. This is step 2 of the pipeline and consumes the analysis
produced by `/qa-analyze`.

## Preconditions (check before delegating)

- [ ] An analysis exists: at least one `<qa-root>/analysis/$ARGUMENTS/YYYY-MM-DD-analysis.md` (use the
      latest by date)
- [ ] The analysis has **no unresolved blocking open questions** — read its Open questions
      section; if any entry marked `blocking` lacks a recorded answer, STOP, list each one
      verbatim, and ask the user to resolve them (in the analysis file or in chat) before
      re-running
- [ ] §Quality gates is readable (if absent, the defaults below apply — say so in the plan)

If the analysis is missing entirely, STOP and tell the user to run
`/qa-analyze <slug> <docs…>` first. Do not plan from raw docs.

## Execution

Delegate to the `test-planner` agent (it invokes the `planning-tests` skill), passing the slug,
the latest analysis path, and the `change_type` recorded in the analysis (the planning skill's
entry criteria require it). It produces two dated artifacts:

1. **Strategy** — `<qa-root>/plans/$ARGUMENTS/YYYY-MM-DD-strategy.md`: scope, approach per enabled type,
   risks carried over from the analysis, environments (§Environments), tooling.
2. **Test plan** — `<qa-root>/plans/$ARGUMENTS/YYYY-MM-DD-test-plan.md`, which MUST contain:
   - **Per-type coverage targets** — one target per type the analysis marked applicable AND
     §Test types enables. Types the matrix ruled out are listed as out of scope with the reason.
   - **Quality-gate targets** — copied from §Quality gates; where the profile is silent, the
     defaults: case coverage per enabled type ≥ the plan's target; e2e/api/integration → 0
     failing P0/P1 before sign-off; performance → p95 latency & error-rate SLOs; security → no
     unresolved High/Critical findings.
   - **The empty traceability skeleton** under the exact heading
     `## Traceability (Requirement ↔ Case)` with the exact column set and zero data rows:

     ```markdown
     ## Traceability (Requirement ↔ Case)
     | Req | Case ID | Type | Module | Priority | Scripted | Last run | Status | Report |
     |-----|---------|------|--------|----------|----------|----------|--------|--------|
     ```

     **Brownfield exception (`add_feature` / `update_existing`):** when
     `<qa-root>/analysis/$ARGUMENTS/*-impact.md` exists, the table is seeded with one **re-verify row** per
     case in its `## 3. Existing cases to re-verify` owned by ANOTHER slug —
     `| re-verify:<owning-slug> | <Case ID> | <type> | <module> | <priority> | <Scripted from the
     owner's row> | — | — | — |` (CONTRACTS §3); `@deprecated:` cases are skipped. These are the only
     rows planning writes. No impact note on a brownfield slug → STOP: run `/qa-impact $ARGUMENTS` first.

     This table is the single source of truth for the rest of the pipeline: `/qa-design` appends
     rows, `/qa-script` flips `Scripted`, `/qa-run` fills `Last run`/`Status`/`Report`, and
     `/qa-report` + the gates read ONLY this table. Do not rename the heading or columns.

**`--run-plan`** (optional; `<slug>` is the first token): after the plan is written, the
`composing-run-plans` skill also writes the RUN plan `<qa-root>/run-plans/feature-<slug>.md` (CONTRACTS
§19) — every enabled type of this feature, its re-verify rows included. It resolves to no cases until
`/qa-design` + `/qa-script` land; `npm run qa:plan:resolve -- feature-<slug>` refreshes it, and
`/qa-run --plan feature-<slug>` runs it. The test plan is the planning document; the run plan is
what you execute.

## Done criteria

- Both artifacts exist under `<qa-root>/plans/$ARGUMENTS/` with today's date.
- Every REQ id from the analysis is either assigned to at least one planned type or explicitly
  descoped with a reason.
- The traceability skeleton is present and exactly matches the column contract — empty, or holding
  only the re-verify rows imported from the impact note (count reported).

Report back: both artifact paths, the per-type coverage targets, the gate targets adopted
(profile vs defaults), and a reminder that `/qa-design $ARGUMENTS` is the next step.
