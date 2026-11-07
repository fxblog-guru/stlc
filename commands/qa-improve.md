---
description: Add one earned check to a design or review skill's minimums, with the two fixtures that prove it.
disable-model-invocation: true
argument-hint: <skill> "<the check that was missing>" --origin <DEF-id | retro path | review #> | <skill> --retire <row>
---

Follow `qa-phase-protocol` (invoke the skill if it is not already in context); this file holds only what is specific to this command.

Add a check to `$1`'s published minimums: `$2`, earned by `--origin`. This is the only sanctioned
way a design skill's minimums or `reviewing-cases`' depth table grows. A row added by hand is
indistinguishable from someone's preference within a year, and a checklist that only grows is one
nobody reads.

## Preconditions (check before delegating)

- [ ] `$1` is a `designing-*` skill or `reviewing-cases`; `reviewing-unit-tests`' smell catalogue
      also qualifies. Anything else → STOP: checks live where a gate reads them
- [ ] `--origin` names a real artifact: a `DEF-<slug>-NNN` (usually `ESCAPED`), a
      `<qa-root>/reports/retro/*.md` action, or a review finding. **No origin, no row** — "it seems like a
      good idea" is how a checklist reaches forty rows
- [ ] The check decides a fact an observer can settle ("every list endpoint has a page-boundary
      case"), not a quality ("the cases are thorough")
- [ ] The check does not already exist in other wording — read the skill's minimums first; if an
      existing row is too weak, this is an amendment to that row, not a new one

## Where the change lands (hard constraint)

Skills under `.claude/` are **bundle-owned** and replaced by `stlc update`, and the fixtures live in
the bundle repository's `tests/fixture/`. So:

- **In the bundle repository** (`tests/selfcheck.sh` present): edit the skill, add both fixtures,
  add the `selfcheck.sh` line, run it and show the counts.
- **In an installed project**: write the proposal
  `<qa-root>/reports/retro/improvements/YYYY-MM-DD-<skill>.md` carrying the row, both fixtures and the
  selfcheck line verbatim, ready to apply as a merge request to the bundle. Never edit `.claude/`.

## Execution

Delegate to the `test-planner` agent (it invokes `improving-checks`). The three edits, all required:

1. **One row**, appended to the skill's minimums (or the review depth table), in the skill's own
   shape, with `origin: <DEF | retro | review>` and the date beside it.
2. **A fixture the check must flag** — a case under `tests/fixture/qa/cases/<type>/…` that lacks
   the element — and the `reviewing-cases` finding it must produce.
3. **A fixture the check must leave alone** — the same case with the element present. This is the
   one people skip, and the one that prevents the worse failure: a check that fires on everything
   trains reviewers to wave findings through.

`--retire <row>`: the other half of the loop. Requires the features it was applied to (from
`/qa-metrics`' never-fired report) and keeps the fixtures.

## Done criteria

Report back: the skill and row added (or retired), the origin, both fixture paths, the selfcheck
result (or the proposal path), and how many rows the minimums now hold (past ~25, say so).
