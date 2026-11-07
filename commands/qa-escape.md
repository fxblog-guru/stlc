---
description: Intake a production bug as an ESCAPED defect: phase and type missed, backfill plan, ledger row.
argument-hint: <slug> <ticket-key | "description" | path> [--slug-from-impact]
disable-model-invocation: true
---

Follow `qa-phase-protocol` (invoke the skill if it is not already in context); this file holds only what is specific to this command.

> Profile first, by section (`profile.mjs`) — `§Test types`, `§Test management` (tracker access for
> the snapshot), `§Domain knowledge`, `§Code knowledge`. QA root defaults to `<qa-root>/`. Contract:
> CONTRACTS §13 (defect lifecycle, escape analysis, `<qa-root>/defects/ESCAPES.md`).

Record and analyze the escaped bug in `$ARGUMENTS` (slug first, then a Jira key like `PROJ-123`,
an ADO id like `#4821`, a quoted description, or a file path). When the slug is unknown, pass
`--slug-from-impact` and the analyst resolves it from the impact map's modules — with the
candidate shown, never guessed.

## Preconditions (check before delegating)

- [ ] The bug text is obtainable: tracker reachable (read-only fetch → snapshot under
      `<qa-root>/analysis/<slug>/sources/<KEY>.md`) or text/file supplied. Unreachable and nothing pasted →
      STOP and ask for the ticket text
- [ ] `<slug>` resolves to a plan or impact-map module (or is explicitly a new area → `OUT-OF-SCOPE`)

## Hard rules

- Read-only towards the tracker: the ticket is snapshotted, never edited; a link-back comment is
  posted ONLY after the user confirms the exact text.
- The analysis cites artifacts (analysis §2, plan coverage targets, case Expected, traceability
  Status, quarantine ledger, readiness) — a `Phase missed` without a cited artifact is not accepted.
- Nothing is designed, scripted, or fixed here; the backfill is a list of exact commands.

## Execution

Delegate to the `qa-reporter` agent (it invokes `analyzing-escaped-defects`). Output:

- `<qa-root>/defects/<slug>/DEF-<slug>-NNN-<short>.md` — `**Origin:** ESCAPED`, severity by mapping, Expected
  (REQ/BR/AC cited or "no documented expectation") vs Actual (ticket), `## Escape analysis` with
  `### Phase missed` (one token: ANALYZE | PLAN | DESIGN | SCRIPT | RUN | ENV | QUARANTINE | OUT-OF-SCOPE),
  `### Type missed`, `### Backfill` checklist with commands.
- A REQ appended to the analysis register ONLY for `ANALYZE` misses (next id, source = the DEF).
- `<qa-root>/defects/ESCAPES.md` row (`Backfill` = `pending` until the designing skill fills the TC id).
- Impact-map `Notes` updated on the touched (BR, Module) rows.

## Done criteria

Report back: the DEF id + severity, phase/type missed with the one-line evidence, the backfill
commands in order (`/qa-design <slug> --type <t>` → `/qa-script` → `/qa-run` → `/qa-defect <slug>
--verify`), whether a REQ was appended, and the tracker action taken (snapshot only / comment posted
after confirmation / not configured).
