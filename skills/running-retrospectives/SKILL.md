---
name: running-retrospectives
description: Use after a release or sprint to find where the process leaked: escapes, flake, MTTR, estimate vs actual, each with a fix (/qa-retro).
version: 1.0.0
---

# Running Retrospectives (the recall loop)

> Profile first, by section (`profile.mjs`) — `§Quality gates` (the thresholds a retro may propose
> to move), `§Estimation baselines`. QA root defaults to `<qa-root>/`. Contract: CONTRACTS §13 (escape
> analysis vocabulary), §16 (report sections this reads).

## Prime directive — patterns, mechanisms, no blame, no memory
A retro asks "why did the **process** let this through", never "who". Every leak cites the artifact
that records it. Every action names the **mechanism** that will make it stick — a check a gate
reads, a profile value, a baseline, a backfill — or the leak is recorded as *not preventable*. A
"we should test more carefully" action is not an action.

## Action
Produce `<qa-root>/reports/retro/YYYY-MM-DD-retro.md` for one window (a release id or `--since`).

## Inputs — resolve before writing (STOP conditions)
1. **Window**: the sign-off `<qa-root>/reports/release/<id>/*-signoff.md` (its `date` closes the window;
   the previous sign-off's date opens it) or `--since`. `--features` narrows; default = every slug
   with a report in the window.
2. **Leak sources**: `<qa-root>/defects/ESCAPES.md` rows with `Reported` in the window + their DEF files;
   every report's `## Failure digest` and `## Deviations from plan`; `<qa-root>/regression/quarantine.md`
   rows with `Since` in the window; review files' finding classes; `<qa-root>/plans/*/…-estimate.md`.
3. **Closed loop**: the previous `<qa-root>/reports/retro/*.md` (optional — first retro says so).
Nothing to read → STOP: "nothing to learn from yet".

## Step 1: Previous actions — close the loop before opening a new one
For each row in the last retro's `## Actions`: `done` (the mechanism exists — the row in the skill,
the profile value, the backfill TC id — cite it) · `open` · `dropped (reason)`. Print the closure
rate. A retro whose actions never close is theatre, and saying so is the point.

## Step 2: Categorise every leak on three axes
| Axis | Vocabulary |
|---|---|
| Root cause | logic · integration · data · race · configuration · regression · missing requirement · performance · environment |
| Level missed | the CONTRACTS §13 phase (`ANALYZE … OUT-OF-SCOPE`) and the test type that should have caught it |
| Prevention | add case · strengthen case · add check (minimum / review row) · add gate · improve requirement · add monitoring · process |

Sources: ESCAPED defects carry phase and type already; digest failures carry their triage class;
quarantine rows carry their flake kind; review findings carry GAP/THIN/DEPTH/DUP/VAGUE.

## Step 3: Patterns, not anecdotes
Group by (root cause, level missed). **Three** or more in a group is a pattern and gets a row in
`## Leaks`; one or two are listed under *Anecdotes* with no action unless Critical. For each
pattern apply 5 whys and stop only at a process or structural cause — "the designer missed it" and
"the developer didn't write a test" are not stopping points; "no minimum requires a page-boundary
case" is.

## Step 4: Actions — at most three, each with a mechanism
`| # | Action | Mechanism | Owner | Due | Verified by |`. First sort the leak: a **mechanical** one
(a forbidden call, a missing id, a file in the wrong place) gets a deterministic check — a lint
rule, a hook, a CI script — named as a `process (named)` action, ahead of any checklist row; a
checklist row is for what needs judgement. Before proposing a new check, look for one that already
exists but is not wired into CI or has been failing silently: that is the finding. Mechanisms, in
order of preference:
1. `/qa-improve <skill> "<check>" --origin <DEF | this retro>` — the leak becomes a permanent row.
2. `PROJECT-PROFILE §<section>: <value>` — a threshold, a flake budget, a browser tier.
3. `/qa-design <slug> --type <t>` — a backfill already named in `ESCAPES.md` but still `pending`.
4. `§Estimation baselines` — when estimate vs actual drifted more than 30 %.
5. `process (named)` — only with a named owner and a date.
`Verified by` names the evidence the next retro will look for. Owner and due date are proposed;
a human confirms them — this skill never assigns work.

## Step 5: Not preventable
Leaks no gate could have caught (a requirement nobody had, a third-party change) are listed
plainly. Pretending everything is preventable produces checks that fire on nothing.

## Step 6: Metrics snapshot — transcribed from `/qa-metrics`' sources
DDP (test recall) = INTERNAL defects / (INTERNAL + ESCAPED) in the window, with the band
(< 10 % escapes excellent · 10–20 good · 20–40 concerning · > 40 broken); escapes by phase and
type; flake count and quarantine load; MTTR; estimate vs actual per feature. Unmeasurable → say so.

## Step 7: Write + summary to chat
Sections in order: **Window & inputs** → **Previous actions** → **Leaks** (+ *Anecdotes*) →
**Actions** → **Not preventable** → **Metrics snapshot**. Then print:
```
✓ Wrote <qa-root>/reports/retro/YYYY-MM-DD-retro.md
Window: <from> → <to> · features {n} · leaks {p} patterns / {a} anecdotes
Top leak: <one line, with its phase · type>
Actions: {1..3 with mechanisms} | Previous actions closed: {x}/{y} | DDP {d}% ({band})
```

## Done — ALL must be true
- [ ] Every leak cites the file that records it; nothing from memory.
- [ ] Previous actions closed or carried, with evidence.
- [ ] Patterns need ≥3 incidents (or Critical); 5 whys stopped at a process cause.
- [ ] ≤3 actions, each with a mechanism that exists in this bundle or the profile, owner and due proposed, verification named.
- [ ] Not-preventable leaks listed; DDP and its band stated with the window.
