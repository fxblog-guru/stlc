---
description: Exploratory sessions: risk-ranked charters for a feature, or --debrief a finished session sheet.
argument-hint: <slug> [--charters N] [--agent] | <slug> --debrief <XS-id | path>
disable-model-invocation: true
---

Follow `qa-phase-protocol` (invoke the skill if it is not already in context); this file holds only what is specific to this command.

> Profile first, by section (`profile.mjs`) — `§Environments` (where a human may explore),
> `§Domain knowledge`, `§Quality gates` (exploratory row, when present). QA root defaults to
> `<qa-root>/`. Contract: CONTRACTS §14 (session sheet headings, Bugs / Follow-ups columns).

Charter mode: write N (default 3) risk-ranked exploratory charters for feature `<slug>` as session
sheets under `<qa-root>/exploratory/<slug>/`. Debrief mode (`--debrief`): turn the tester's raw notes for one
session into `## Bugs` candidates, `## Follow-ups` with commands, and a PROOF `## Debrief`.

## Preconditions (check before delegating)

- [ ] Charter mode: analysis + plan exist for `<slug>` (charters are built from risks and scope — no
      analysis → `/qa-analyze` first)
- [ ] Debrief mode: the sheet exists, `## Session` is filled (tester, env, times), raw notes are in
      `## Notes` or pasted in chat — none → STOP and ask the tester for the notes

## Hard rules

- `--agent`: the agent runs the charter itself (Playwright MCP/CLI, the UI risk classes, the server log
  as an oracle — `running-exploratory-sessions` § Agent-driven charter) and writes `## Notes` only;
  the human still confirms the candidates and owns the debrief. On a mobile charter it drives the
  booted device named in `## Session` (mobile-mcp when connected, else `maestro hierarchy` + `adb`),
  works the device-reality sets, reads the device log and crash reports as oracles, and may leave a
  `XS-…-seed-<n>.yaml` flow seed beside the sheet (CONTRACTS §14) — never under `scripts/`.
- The agent writes charters and debriefs; a human runs the session. No observation is invented —
  every `## Bugs` row traces to a note line or an artifact the tester saved.
- Debrief writes `candidate` / `duplicate DEF-…` / `not-a-bug` only; raising a defect is
  `/qa-defect <slug> --from-exploratory <XS-id>` (Origin EXPLORATORY). No plan row, case, or script is edited.
- Security/performance-flavoured exploration still obeys `§Environments` authorization — a charter
  never sends a human to probe an unauthorized env.

## Execution

Delegate to the `test-planner` agent (it invokes `running-exploratory-sessions`):

- Charter mode → `<qa-root>/exploratory/<slug>/XS-<slug>-NNN-<charter-slug>.md` per charter: mission sentence,
  areas, targets (R-/BR-/REQ-/impact §4/review findings/escapes/`@manual` TC ids), out of scope, timebox,
  heuristics; remaining sections scaffolded from `<qa-root>/_templates/exploratory.md`.
- Debrief mode → the same sheet with `## Bugs`, `## Follow-ups` (`CASE` → `/qa-design … --type <t>` + exact
  input; `QUESTION` → `/qa-clarify`; `RISK`; `DATA`), `## Debrief` (Past · Results · Obstacles ·
  Outlook · Feelings), manual case verdicts noted in `## Notes`.

## Done criteria

Charter mode: sheet paths, targets per charter, items ranked below the cut. Debrief mode: bug
candidates / duplicates / not-a-bug counts, follow-ups by kind, manual case verdicts, and the next
commands (`/qa-defect --from-exploratory`, `/qa-design`, `/qa-clarify`).
