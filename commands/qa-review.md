---
description: Read-only review of designed cases before scripting: gaps, depth, duplicates, vague steps → READY / REVISE.
argument-hint: <slug>
disable-model-invocation: true
---

Follow `qa-phase-protocol` (invoke the skill if it is not already in context); this file holds only what is specific to this command.

> Profile first, by section (`profile.mjs`) — `§Test types`, `§Quality gates`, `§Domain knowledge`.
> QA root defaults to `<qa-root>/` (profile-overridable).

Review the designed cases for feature `$ARGUMENTS`. Best run between `/qa-design` and
`/qa-script` — a VAGUE case caught here is one healing cycle saved later.

## Preconditions (check before delegating)

- [ ] The plan's traceability table has rows with Case IDs for `$ARGUMENTS`

No designed cases → STOP: "nothing to review — run /qa-design".

This command reviews the *cases this bundle designed* (all types — unit depth against
`designing-unit-cases`' minimums: matrix completeness, boundary triples, mutation guards, hermetic
doubles; accessibility depth against `designing-accessibility-cases`: screen-state coverage, WCAG
refs, keyboard/validation/reflow cases, exclusions with reasons). To audit the *application repo's existing developer-written unit
tests* use `/qa-unit-audit <slug|module>` instead.

## Review rule (hard constraint)

The review edits NOTHING — no case, no plan row, no script. Every finding cites the artifact
lines that prove it and prescribes an action for the case-designer or planner. Depth is judged
against each design skill's OWN published minimums, not invented standards.

## Execution

Run `node <qa-root>/scripts/shared/sizing.mjs brief $ARGUMENTS` first and pass its output: the
lint findings, the cases changed since the last review and the REQs with no case. The reviewer
opens those, not the whole slug. Delegate to the `test-planner` agent (it invokes the
`reviewing-cases` skill — the planner is independent of the case-designer who wrote them; `qa:lint`
errors when the `**Reviewer:**` is the designer). Output
`<qa-root>/reviews/$ARGUMENTS/YYYY-MM-DD-case-review.md`:

- Findings table ranked High→Low across classes: GAP (empty REQ×type cell), THIN, DEPTH
  (missing type minimum), DUP, BR-CONFLICT (verbatim both sides), UNGROUNDED, VAGUE
  (unscriptable step).
- Verdict: **REVISE FIRST** when any High finding exists, else **READY FOR /qa-script** with
  should-fix Medium/Low findings listed.

## Done criteria

Report back: the review path, the verdict, finding counts by severity, the worst finding in one
line, and the next command (`/qa-design` for the fix list, or `/qa-script`).
