---
description: Record one piece of feedback about the bundle itself (a gate, a skill, a command) for the maintainer.
disable-model-invocation: true
argument-hint: "<what happened>"
---

Follow `qa-phase-protocol` (invoke the skill if it is not already in context); this file holds only what is specific to this command.

Record the user's feedback about **the bundle**, not about their product: `$ARGUMENTS`.

The rollout improves on two signals. Usage numbers say *what* people run (Recall's Usage tab
tracks tokens per command, per skill, per user and per project automatically through the two
Recall hooks described in the README); this command carries the *why* — the friction that numbers cannot
show. One entry per annoyance. Thirty seconds, not a form.

## Run

1. Shape the feedback into one fact:
   - **title** — the complaint in one line, concrete: "`/qa-review` returns REVISE FIRST for a
     missing negative case the API cannot express", not "review too strict".
   - **body** — what happened, what was expected, and the cost ("re-ran the phase twice", "wrote
     a placeholder case to pass"). Name the command, skill, agent or lint rule involved. If the
     user gave a suggestion, keep it in their words.
   - **tags** — the bundle (`qa`), the command or skill name, and the test type if one is involved
     (e.g. `e2e`).

2. If anything essential is missing — which command, what it did wrong — ask **once**, briefly.
   Do not interrogate; a vague entry a maintainer can follow up on beats no entry.

3. Push it, trying in order:
   - the `knowledge_push` MCP tool (kind `feedback`, project from `RECALL_PROJECT` if set), or
   - `recall push --kind feedback --title '…' --body '…' --tag qa [--tag <skill>]`.

   If neither is available (no Recall configured), append it to `<qa-root>/feedback.md` with a date and
   tell the user it is parked there until Recall is wired up — do not silently drop it.

4. Confirm in one line what was recorded and where. Done. No follow-up questions, no summary.

## Refuse

- To record product bugs, flaky tests or escaped defects here — those belong to `/qa-defect`,
  `/qa-quarantine` and `/qa-escape`. This channel is for the bundle's own ergonomics.
- To record a check the bundle *should* make — that is `/qa-improve`, which lands a row with
  its fixtures. Feedback is for what the bundle does wrong, not for what it should do next.
- To editorialise. The entry records what the user said happened, not whether the gate was right.
