---
description: Turn analysis ambiguities into a PM-ready question sheet, BLOCKING first, with the assumption QA proceeds on.
argument-hint: <slug>
disable-model-invocation: true
---

Follow `qa-phase-protocol` (invoke the skill if it is not already in context); this file holds only what is specific to this command.

> Profile first, by section (`profile.mjs`) — `§Domain knowledge` (wiki for contradiction checks).
> QA root defaults to `<qa-root>/` (profile-overridable).

Draft (or update with answers) the clarification sheet for feature `$ARGUMENTS`. Best run right
after `/qa-analyze`, before `/qa-plan` commits scope on shaky requirements.

## Preconditions (check before delegating)

- [ ] `<qa-root>/analysis/$ARGUMENTS/YYYY-MM-DD-analysis.md` exists

No analysis → STOP: questions are harvested from artifacts, never invented from raw docs.

## Harvest rule (hard constraint)

Every question cites the artifact line that raised it (analysis ambiguity flag, testability gap,
wiki `contradictions.md` entry, BR-### conflict, undefined boundary/data value). Duplicates merge.
Each question states the assumption QA proceeds on meanwhile and the rework cost if that
assumption is wrong — so an unanswered sheet never silently blocks the pipeline.

## Execution

Delegate to the `doc-analyst` agent (it invokes the `clarifying-requirements` skill). Output
`<qa-root>/analysis/$ARGUMENTS/YYYY-MM-DD-clarifications.md`:

- Numbered `Q-NNN` questions, BLOCKING (P0/P1 design cannot proceed correctly) first, each
  self-contained with options where enumerable — answerable by a busy PM in one pass.
- **Update mode**: fold in answers as `ANSWERED`, list which analysis sections / designed cases
  each answer invalidates, and prescribe the follow-up (`/qa-analyze` refresh or targeted
  `/qa-design`). An answer contradicting the wiki flags `/qa-knowledge`, never picks a side silently.

## Done criteria

Report back: the sheet path, question counts (total/blocking), the blocking topics in one line
each, and — in update mode — the follow-up actions the new answers trigger.
