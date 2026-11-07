---
description: Release readiness across features: eleven exit criteria → GO / NO-GO / CONDITIONAL GO (advisory).
argument-hint: <release-id> <slug,slug,…>
disable-model-invocation: true
---

Follow `qa-phase-protocol` (invoke the skill if it is not already in context); this file holds only what is specific to this command.

> Profile first, by section (`profile.mjs`) — `§Quality gates` defines the exit criteria.
> QA root defaults to `<qa-root>/` (profile-overridable).

Sign off release `$ARGUMENTS` (release-id, then a comma-separated slug list; no list → propose
every slug under `<qa-root>/plans/` with run activity and ask). Ten exit criteria (`summarizing-release`
Step 3), incl. quarantine, accessibility and mobile crash/ANR wherever those types are enabled.

## Preconditions (check before delegating)

- [ ] Each named slug has a plan with a traceability table
- [ ] Each slug has a report under `<qa-root>/reports/<slug>/` — a slug without one is marked
      `NOT ASSESSED` (forcing CONDITIONAL at best) unless `/qa-report` is run first

## Data rule (hard constraint)

The sign-off reads ONLY feature reports, traceability tables, defect files, and the two ledgers
(`<qa-root>/regression/quarantine.md`, `<qa-root>/defects/ESCAPES.md`). Reports older than the newest run in their
table are STALE and cannot contribute a GO. Nothing is re-run or recomputed from raw run artifacts
here. A run-plan run (`<qa-root>/runs/plans/<name>/<run-id>/`, CONTRACTS §19 — e.g. `release-<id>`) is
evidence through the traceability rows it wrote and the reports that cite it; cite its `summary.md`
for the release-wide picture. A feature whose plan has re-verify rows is assessed against its baseline: a `Re-verify set`
gate that is not `pass` blocks GO for it, and the baseline slug's report is read too. A quarantined P0/P1 case, an expired-unreleased quarantine, an unresolved Critical/High
accessibility finding, or a pending escape backfill is never silent — it is a condition or a NO-GO.

## Execution

Delegate to the `qa-reporter` agent (it invokes the `summarizing-release` skill). Output
`<qa-root>/reports/release/<release-id>/YYYY-MM-DD-signoff.md` in the **CONTRACTS §16 shape** (front
matter with `recommendation`, byte-exact headings, the `| # | Exit criterion | Verdict | Evidence |`
table — the dev bundle reads `recommendation` at its deploy gate):

1. **Executive summary** — ≤ 5 jargon-free bullets, written for the release meeting.
2. **Recommendation** — GO (all criteria met) / NO-GO (critical criterion failed, evidence listed)
   / CONDITIONAL GO (named, actionable conditions). Advisory — the accept/override decision
   belongs to release authority.
3. **Feature posture table**, **exit-criteria checklist** (eleven criteria, each verdict cites its
   evidence), **open defects Critical→Low** (ESCAPED first), **quarantined P0/P1 + pending backfills**,
   **lessons learned** from the failure digests and escape analyses.

## Done criteria

Report back: the sign-off path, the recommendation with its one-line reason, stale/not-assessed
features, open Critical/High count, and the conditions list (if CONDITIONAL).
