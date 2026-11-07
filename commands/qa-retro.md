---
description: Retrospective for a release or sprint: the leaks from escapes, digests, flake and MTTR, each with a fix mechanism.
disable-model-invocation: true
argument-hint: <release-id | sprint-id> [--since YYYY-MM-DD] [--features slug,slug,…]
---

Follow `qa-phase-protocol` (invoke the skill if it is not already in context); this file holds only what is specific to this command.

Run the retrospective for `$ARGUMENTS` (a release id from `<qa-root>/reports/release/<id>/`, or a sprint
label with `--since`). This is the **recall loop**: `/qa-escape` names the phase and type that
missed one bug; this command reads every leak in the window and turns the pattern into an action
with a mechanism — a check (`/qa-improve`), a threshold, a baseline, a backfill — or records it as
not preventable. Observations describe; a human picks the actions.

## Preconditions (check before delegating)

- [ ] The window resolves: a sign-off under `<qa-root>/reports/release/<id>/` (its `date` closes the
      window, the previous sign-off opens it) or `--since` given
- [ ] At least one of: an `ESCAPES.md` row in the window, a feature report with a failure digest, a
      quarantine row, a closed defect — else STOP: "nothing to learn from yet"

## Data rule (hard constraint)

Reads ONLY: `<qa-root>/defects/ESCAPES.md` and the ESCAPED defect files (`### Phase missed`, `### Type
missed`), feature reports' `## Failure digest` and `## Deviations from plan`, the quarantine ledger,
defect files (`Raised`/`Closed` for MTTR), review files (finding classes), `<qa-root>/plans/*/…-estimate.md`
against actual case counts, and the previous retro's `## Actions` for the closed loop. Nothing is
re-run; nothing comes from memory of a conversation.

## Execution

Delegate to the `qa-reporter` agent (it invokes `running-retrospectives`). Output
`<qa-root>/reports/retro/YYYY-MM-DD-retro.md`:

1. **Window & inputs** — the dates, the features, every file read.
2. **Previous actions** — each action from the last retro with `done | open | dropped` and the
   evidence (a check that now exists, a threshold that changed, a backfill TC id).
3. **Leaks** — `| # | Leak | Evidence | Root cause | Level missed | Prevention |` — one row per
   pattern (three similar single incidents are one pattern; one incident is an anecdote and says so).
4. **Actions** — at most three, `| # | Action | Mechanism | Owner | Due | Verified by |`; the
   mechanism is one of `/qa-improve <skill> "<check>"` · `PROJECT-PROFILE §<section> <value>` ·
   `/qa-design <slug> --type <t>` backfill · `§Estimation baselines` tune · `process (named)`.
5. **Not preventable** — leaks no gate could have caught, said plainly.
6. **Metrics snapshot** — DDP (test recall) and its band, escape rate by phase and type, flake
   count, MTTR, estimate vs actual — transcribed, with the window.

## Done criteria

Report back: the retro path, the top leak in one line, the actions with their mechanisms, the
previous actions' closure rate, and the DDP for the window.
