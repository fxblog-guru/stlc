---
description: One-screen read-only posture per feature: phase, counts, scripted %, last run, gate glance.
argument-hint: [slug]
disable-model-invocation: true
---

Follow `qa-phase-protocol` (invoke the skill if it is not already in context); this file holds only what is specific to this command.

> Profile first, by section (`profile.mjs`): it defines the enabled test types (§Test types), the
> gate targets (§Quality gates), and the QA root used below (default `<qa-root>/`, profile-overridable).

Show a quick status summary. **Console output only — this command never writes or modifies any
file**, never runs tests, and never delegates; it is the cheap read-only glance between pipeline
steps. For the authoritative, artifact-backed verdict, use `/qa-report <slug>`.

## Scope

- `$ARGUMENTS` = a slug → status for that one feature.
- Empty → status for every feature: enumerate the union of `<qa-root>/analysis/*/` and `<qa-root>/plans/*/`
  directory names.

If `<qa-root>/` (or the profile-overridden QA root) does not exist at all, STOP and say the workspace
has no QA artifacts yet — suggest `/qa-analyze <slug> <docs…>`.

## Data sources (read-only)

`node <qa-root>/scripts/shared/status.mjs` prints this whole posture from the same derivation the board
uses (CONTRACTS §17), without writing anything; run it first and fill in only what it marks
`see /qa-report`. The sources below are what it reads.

Per feature, look only at what exists:

- `<qa-root>/analysis/<slug>/` — latest `YYYY-MM-DD-analysis.md`
- `<qa-root>/plans/<slug>/` — latest `YYYY-MM-DD-test-plan.md` and its
  `## Traceability (Requirement ↔ Case)` table (the single source of truth for case counts,
  scripted state, and run results — do not rescan `<qa-root>/cases/` or `<qa-root>/scripts/` when the table
  exists)
- `<qa-root>/reports/<slug>/` — latest `YYYY-MM-DD-report.md`, if any

## Output — one block (or table row) per feature

1. **Phase reached** — the furthest pipeline stage with evidence:
   `analyzed` (analysis exists) → `planned` (plan exists) → `designed` (traceability has rows) →
   `scripted` (any row ✅ Scripted) → `run` (any row has Last run) → `reported` (a report file
   exists). Show what the next command would be.
2. **Cases by type** — row counts per Type from the traceability table (unit / api / integration /
   e2e / security / performance / accessibility / mobile), against the enabled set in §Test types.
   For unit and mobile, also count their `HANDOFF.md` rows by Status (`proposed` = waiting on the
   developers; mobile rows live in `<qa-root>/scripts/mobile/HANDOFF.md`).
   Count `@manual` cases separately and quarantined cases (unreleased rows in
   `<qa-root>/regression/quarantine.md`) with the soonest expiry.
3. **Scripted %** — ✅ Scripted rows / total rows.
4. **Last run** — most recent `Last run` id across rows, with pass / fail / blocked counts from
   the Status column; `not run yet` when the column is empty.
5. **Gates** — a quick verdict per §Quality gates computed from the traceability table alone
   (e.g. "P0/P1 failures: 2 (quarantined: 1) → functional gate ❌"); mark gates needing run-artifact
   data (perf SLOs, security/accessibility findings, unit coverage %) as `see /qa-report`. Flag
   expired quarantines and OPEN defects whose case now passes (`/qa-defect --verify`). Never present
   this glance as sign-off.

Keep it terse — one screen. Missing artifacts are reported as gaps ("no plan yet — run
`/qa-plan <slug>`"), never errors.
