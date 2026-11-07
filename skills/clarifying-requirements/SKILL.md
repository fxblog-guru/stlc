---
name: clarifying-requirements
description: Use when requirements are ambiguous: a question sheet with options, the assumption QA proceeds on, OPEN/ANSWERED tracking (/qa-clarify).
version: 1.0.0
---

# Clarifying Requirements

> Profile first, by section (`profile.mjs`) — `§Domain knowledge` (wiki for contradiction checks).
> QA root defaults to `<qa-root>/`.

## Prime directive — questions a busy PM can answer in one pass
Each question is self-contained (no "see above"), names its REQ-id, offers the concrete options
when they are enumerable, and states what QA assumes meanwhile — so an unanswered question still
leaves testing unblocked-but-flagged, and an answered one takes 30 seconds to give.

## Action
Create or update `<qa-root>/analysis/<slug>/YYYY-MM-DD-clarifications.md` — the question sheet that
travels to the PM and back.

## Inputs — resolve before writing (STOP conditions)
1. `<slug>` + its analysis file (ambiguity/risk flags live there). No analysis → STOP:
   "run /qa-analyze first — clarifications are harvested, not invented".
2. Compiled wiki (optional): `<qa-root>/wiki/compiled/references/contradictions.md` and BR pages for conflict checks.
3. Existing clarification sheet (update in place — answered questions are history, never deleted).

## Step 1: Harvest — from artifacts, not imagination
Collect every: analysis ambiguity flag; REQ with a testability gap ("not verifiable as written");
wiki `compiled/references/contradictions.md` entry touching this feature's REQs; BR-### that a REQ appears to violate;
`[DATA:*]` or boundary value the spec leaves undefined. Each becomes at most one question — merge
duplicates, cite every source line.

## Step 2: Write each question to the answerable pattern
```markdown
### Q-NNN [BLOCKING|NON-BLOCKING] — <one-line question>
**REQ:** <ids> **Source:** <artifact + line/quote>
**Why it matters:** <what cannot be tested / could be tested wrong>
**Options (if enumerable):** a) … b) …
**QA assumes meanwhile:** <the assumption> — **cost if wrong:** <rework: which cases/scripts>
**Status:** OPEN
```
`BLOCKING` = P0/P1 coverage cannot be designed correctly without the answer. Everything else is
NON-BLOCKING with a stated assumption.

## Step 3: Order for the reader
BLOCKING first, then by REQ priority. Top of file: a 2-line header — how many questions, how many
blocking, the date, and "answer inline under each question — one word is fine when options are given".

## Step 4: Fold answers back (update mode)
When answers appear (user pastes them or edits the file): set `**Status:** ANSWERED — <answer>
(YYYY-MM-DD, <who>)`, then list which analysis sections / designed cases the answer invalidates and
prescribe the follow-up (`/qa-analyze` refresh or `/qa-design` for the affected REQs). An answer
contradicting the wiki is a new finding — flag it to `/qa-knowledge`, don't silently pick a side.

## Step 5: Report ONLY this summary to chat
```
✓ Wrote <qa-root>/analysis/<slug>/YYYY-MM-DD-clarifications.md — {n} questions ({b} BLOCKING)
Ready to send to PM. Blocking: {one-line list of Q-ids + topic}
Meanwhile: design proceeds on {a} stated assumptions; rework risk concentrated in {REQ-ids}
{Update mode: {m} answered → follow-ups: …}
```

## Done — ALL must be true
- [ ] Every question harvested from a cited artifact line — none invented, duplicates merged.
- [ ] Every question self-contained with options where enumerable, assumption + cost stated.
- [ ] BLOCKING/NON-BLOCKING assigned by the P0/P1 rule; blocking questions listed first.
- [ ] Answered questions preserved with answer, date, and follow-up actions prescribed.
- [ ] Sheet is PM-ready as-is — no QA jargon requiring a glossary to answer.
