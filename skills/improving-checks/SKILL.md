---
name: improving-checks
description: Use to add one earned check to a design skill or the review table, with a fixture it must flag and one it must pass (/qa-improve).
version: 1.0.0
---

# Improving Checks (how a minimum is earned)

> Profile first, by section (`profile.mjs`) — `§Test types` (is the type enabled). QA root defaults
> to `<qa-root>/`. Contract: CONTRACTS §7 (case sections a check may require), §16 is **not** touched here.
>
> Modelled on the dev bundle's `/sdlc-improve` (its improvement loop, DEV-CONTRACTS section 17).

## Prime directive — a check is earned, decidable, and proven both ways
A row joins a skill's minimums only when something real went wrong (`--origin`), when an observer
can decide it, and when two fixtures prove it: one the check must flag, one it must leave alone.
The second is the one that matters — a check that fires on everything teaches reviewers to wave
findings through, which is worse than no check.

## Action
Append one row to `<skill>`'s minimums (a `designing-*` skill's rules section, or
`reviewing-cases` Step 2's depth table, or `reviewing-unit-tests`' smell catalogue) with its two
fixtures and its `selfcheck.sh` line — or write the proposal when not in the bundle repository.

## Inputs — resolve before writing (STOP conditions)
1. `<skill>` exists under `.claude/skills/` (or `skills/` in the bundle repo) and is one of the
   allowed kinds. Else STOP.
2. `"<check>"` — a sentence an observer can decide. "The design is thorough" → STOP and ask for
   the fact behind it.
3. `--origin` — a `DEF-<slug>-NNN` file, a `<qa-root>/reports/retro/*.md` action row, or a review
   finding. Read it; the check must plausibly have caught it. Missing → STOP.
4. Read the skill's current minimums **in full**. Same check in other words → STOP and propose the
   amendment to that row instead.
5. Where am I? `tests/selfcheck.sh` present at the repo root → bundle repository (edit); else →
   installed project (propose).

## Step 1: Write the row
In the skill's own shape and position (appended, never inserted — row numbers appear in review
files already written), with `origin: <id> · <date>` beside it. One fact per row.

## Step 2: The fixture that must be flagged
Under `tests/fixture/qa/cases/<type>/<module>/`, a minimal case that lacks the element — same
`**Feature:**`, valid tags, next free `NNN`. State the exact `reviewing-cases` finding it must
produce (`DEPTH — <row>` with the file cited).

## Step 3: The fixture that must pass
The same case with the element present. Run the review mentally against it and against the
existing fixture cases: if the new row would flag any of them, the row is too broad — narrow it
before going on.

## Step 4: Prove it (bundle repository only)
Add a `selfcheck.sh` line: the lint or review must reject the flagged fixture and accept the clean
one. Run `bash tests/selfcheck.sh` and quote the count line. A check that passes against its own
counter-example does not work, and nobody finds out later.

## Step 4b: Propose it (installed project)
Write `<qa-root>/reports/retro/improvements/YYYY-MM-DD-<skill>.md`: the origin, the row verbatim, both
fixtures verbatim, the selfcheck line, and "apply as a merge request to the bundle — `.claude/`
is bundle-owned and `stlc update` replaces it".

## Step 5: Say when it is getting crowded
Count the minimums. Past roughly 25 rows, say so and name the two most similar rows as merge
candidates. `--retire <row>` removes one that `/qa-metrics` reports as never fired across ten
features: say which features, keep the fixtures (they document a shape the team decided not to
care about).

## Step 6: Summary to chat
```
✓ <skill>: row {n} added — "<check>" (origin <id>)
Fixtures: flag → tests/fixture/qa/cases/<type>/<module>/TC-… · pass → TC-…
Proof: selfcheck — {ok} ok, {fail} failed   (or: proposal written to <qa-root>/reports/retro/improvements/…)
Minimums now: {n} rows{ — consider merging rows a and b}
```

## Refuse
- A check with no origin, or an origin the check could not have caught.
- A check that grades quality instead of deciding a fact.
- A row without both fixtures, however obvious the check looks.
- Renumbering, rewording or deleting an existing row as a side effect — that is its own change.
- Editing `.claude/skills/` in an installed project.
