---
name: analyzing-escaped-defects
description: Use when a bug is found in production or after sign-off: ESCAPED defect, phase and type missed, backfill plan (/qa-escape).
version: 1.0.0
---

# Analyzing Escaped Defects

> Profile first, by section (`profile.mjs`) — `§Test types` (which types exist to have missed it),
> `§Quality gates`, `§Domain knowledge`, `§Code knowledge`, `§Test management` (tracker for the
> ticket snapshot). QA root defaults to `<qa-root>/`.

## Prime directive — an escape is the cheapest lesson QA ever gets; write it down honestly
Every escaped defect answers three questions with evidence from THIS workspace: *which phase
should have caught it*, *which test type*, and *what artifact closes the hole*. The analysis
names the gap, not a person. A backfill that is not turned into a case, a REQ, or a regression
seat is not a backfill — it is a wish.

## Action
For one feature `<slug>` and one escaped bug, write `<qa-root>/defects/<slug>/DEF-<slug>-NNN-<short-slug>.md`
with `**Origin:** ESCAPED` and `## Escape analysis`, append the row to `<qa-root>/defects/ESCAPES.md`,
leave the exact backfill commands, and update the impact map's Notes. Cases are NOT designed here
— the designing skills do that on the backfill command, and fill the ledger's `Backfill` cell.

## Inputs — resolve before writing (STOP conditions)
1. **The bug** — one of: a tracker key (Jira `PROJ-123`, ADO `#4821`), a pasted description, a file
   path. A tracker key → fetch it READ-ONLY (Atlassian MCP `getJiraIssue`, or the ADO REST work item)
   and save a snapshot to `<qa-root>/analysis/<slug>/sources/<KEY>.md` (title, description, steps,
   environment, reporter role, dates, attachments listed) — the analysis cites the snapshot, never
   memory. Cannot fetch → ask the user to paste the ticket text; never reconstruct it.
2. **`<slug>`** — argument; unknown → resolve from the bug's module/screen/endpoint through
   `<qa-root>/docs/impact-map.md` (`Module` column) and the plans' module lists; present the researched
   candidate, never guess silently.
3. **The workspace state** for the slug: analysis (REQ register), plan (traceability), cases,
   latest report, defects, regression manifest, quarantine ledger, exploratory sheets. A slug with
   NO artifacts is itself the finding (`Phase missed` = `OUT-OF-SCOPE`).

## Step 1: Reproduce on paper — Expected vs Actual
From the snapshot: the observable behaviour (Actual, verbatim), the expected behaviour and its
source — a `REQ-###`, a `BR-###` (wiki page cited), a tracker acceptance criterion, or `no
documented expectation` (which is itself a phase-ANALYZE finding). Record environment, build/sha
when the ticket has it, and the user role.

## Step 2: Escape analysis — walk the pipeline backwards
Answer each question with the artifact that proves it; the FIRST "no" decides `Phase missed`:

| Phase missed | Question | Evidence to cite |
|---|---|---|
| `OUT-OF-SCOPE` | Was the feature/module ever in a plan? | plans' `## 1. Coverage targets`, impact map |
| `ANALYZE` | Does a REQ (or BR) state the behaviour? | analysis §2 register, wiki page |
| `PLAN` | Was that REQ placed in scope for the right type? | plan `## 1. Coverage targets` |
| `DESIGN` | Does a case's Expected cover this exact input/state? (a case for the endpoint ≠ a case for the branch) | case files, `## Test matrix` rows, `## Steps` |
| `SCRIPT` | Was the case automated (`Scripted` ✅) — or `@manual` and never executed? | traceability, HANDOFF status for unit |
| `RUN` | Was it run on a build that contained the bug, and did it pass? A ⛔ blocked row or `not run` is a RUN miss | traceability `Last run`/`Status`, run summaries |
| `QUARANTINE` | Was the case quarantined (excluded from the gate) when it would have failed? | quarantine ledger, `@quarantined:` history |
| `ENV` | Did the test run against data/config that could not exhibit the bug (env drift)? | env-check readiness, `failures.md` SETUP/ENV |

`Type missed` = the cheapest type that would have caught it (unit for in-process logic, api for
contract/validation, integration for seams, e2e for UI flows, security, performance,
accessibility) — one token or `—`.

## Step 3: Write the defect file (CONTRACTS §13)
`<qa-root>/defects/<slug>/DEF-<slug>-NNN-<short-slug>.md` (NNN = next free number — escaped defects share
the sequence with internal ones):

```markdown
# DEF-<slug>-NNN — <what is wrong, in product terms>
**Status:** OPEN   **Severity:** <level> (<mapping rule — customer-visible money/data = Critical/High>)   **Raised:** YYYY-MM-DD   **Closed:** —
**Origin:** ESCAPED   **Feature:** <slug>   **Case:** —   **REQ:** <REQ-ids | —>   **Env:** prod   **Run:** —
**Resolution:** —

## Steps to reproduce            <!-- from the snapshot, verbatim where possible -->
## Expected (verbatim from the case)   <!-- here: from the REQ/BR/AC, with its citation; "no documented expectation" is allowed -->
## Actual (verbatim from the run output) <!-- here: from the ticket/snapshot -->
## Evidence
- <qa-root>/analysis/<slug>/sources/<KEY>.md · <ticket link> · <logs/screens listed in the ticket>
## Impact
<customers/roles affected, money/data, workaround>

## Escape analysis
### Phase missed
- <TOKEN> — <one sentence of evidence with the artifact path>
### Type missed
- <type | —> — <why this type is the cheapest catcher>
### Backfill
- [ ] REQ: <append REQ-NNN "<verifiable statement>" to <qa-root>/analysis/<slug>/…-analysis.md §2 (source: escaped DEF-…)> | already REQ-###
- [ ] Case: `/qa-design <slug> --type <type>` — <subject / endpoint / screen + the exact input or state>
- [ ] Regression: seat the new case in @regression on the next `/qa-regression` (defect-adjacent rule)
- [ ] Impact map: row (<BR>, <module>) Notes += "escaped DEF-…"
- [ ] Verification: `/qa-defect <slug> --verify` after the fix ships and the case passes
```

Severity mapping: customer-visible money/data/security → Critical; core flow broken for a role →
High; workaround exists → Medium; cosmetic → Low. Record the rule.

## Step 4: Append the REQ when the expectation was never written
If `Phase missed` = `ANALYZE` (no REQ/BR states the behaviour): append ONE row to the latest
analysis §2 register with the next REQ id (watermark rule — never renumber), `Source` =
`escaped DEF-<slug>-NNN (<KEY>)`, `Notes` = `backfill`. Any other phase → cite the existing REQ.

## Step 5: Ledger + impact map
- Append to `<qa-root>/defects/ESCAPES.md`:
  `| DEF-<slug>-NNN | <slug> | YYYY-MM-DD | <Phase missed> | <type | —> | pending | OPEN |`
  (`Backfill` becomes the TC id when the designing skill creates the case; `Status` mirrors the
  defect file).
- `<qa-root>/docs/impact-map.md`: for the (BR, Module) row(s) touched, append `escaped DEF-…` to `Notes`
  (Mode A of `maintaining-impact-map`; mint a `(BR-?, module)` row only when the BR exists).
- Optional, **confirmed by the user**: add a comment on the tracker ticket linking the DEF path and
  the backfill plan (Atlassian MCP `addCommentToJiraIssue`). Never change the ticket's status or fields.

## Step 6: Report ONLY this summary to chat
```
✓ Raised DEF-<slug>-NNN (ESCAPED, <severity>) — <qa-root>/defects/<slug>/…  ·  ledger row appended (<qa-root>/defects/ESCAPES.md)
Escape: phase <TOKEN> · type <type> — <one-line evidence>
Backfill: {REQ appended | REQ-### exists} · /qa-design <slug> --type <type> (<what>) · regression seat · impact-map note
Tracker: {snapshot saved <KEY> | pasted text} · comment {posted | declined | not configured}
Next: /qa-design <slug> --type <type>  →  /qa-script  →  /qa-run  →  /qa-defect <slug> --verify
```

## Done — ALL must be true
- [ ] The bug text comes from a saved snapshot or the user's paste — nothing reconstructed from memory.
- [ ] `Phase missed` is the FIRST failing question of Step 2, with the artifact cited; `Type missed` named or `—`.
- [ ] Defect file has `**Origin:** ESCAPED`, `## Escape analysis` with the three byte-exact sub-headings, and a concrete backfill list with commands.
- [ ] REQ appended only for `ANALYZE` misses, next id, source cited; never renumbered.
- [ ] `ESCAPES.md` row appended; impact-map Notes updated; tracker written only after explicit confirmation.
- [ ] No case, script, plan row, or application code edited here.
