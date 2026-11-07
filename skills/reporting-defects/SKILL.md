---
name: reporting-defects
description: Use to raise defects from FUNCTIONAL failures with verbatim evidence, close them from passing runs, re-open on recurrence (/qa-defect).
version: 1.1.0
---

# Reporting Defects (raise · verify · close · re-open)

> Profile first, by section (`profile.mjs`) — `§Quality gates` (severity impact), `§Environments`
> (where the failure happened), `§Test management` (optional ADO/Jira push). QA root defaults to
> `<qa-root>/`. Contract: CONTRACTS §13 (defect header fields, Resolution vocabulary, Verification line,
> Origin, re-open rule).

## Prime directive — evidence, verbatim, never diagnose beyond it; never close from memory
A defect report quotes the case's Expected and the run's actual output VERBATIM and points at run
evidence files. It never speculates about root cause in app code, never weakens the case to match
the app, never invents reproduction detail. A defect is CLOSED only by a passing verification run
recorded in the file (`fixed`), or by a human decision quoted in the file (`not-a-bug` /
`duplicate` / `wont-fix`) — never because "it probably works now".

## Action
For one feature `<slug>`, in this order: (0) verify pass over OPEN defects, (1) raise new defects
from FUNCTIONAL failures (or from exploratory candidates with `--from-exploratory`), (2) tag the
cases, (3) optional confirmed tracker push. `--verify` runs only step 0.

## Inputs — resolve before writing (STOP conditions)
1. `<slug>` — feature slug (argument; ask if ambiguous).
2. **Plan traceability** (`Status`, `Last run`, `Report` per case) — the source for both failures and
   verifications. Missing → STOP.
3. **Run artifacts** for the rows involved (`<qa-root>/runs/<type>/<slug>/<run-id>/` with `summary.md`,
   `failures.md`, evidence). A ❌ row with no run artifact is a data gap — report it, don't invent.
4. **Case files** for the Case IDs (located by traceability, never by filename glob).
5. `--from-exploratory <XS-id | path>`: the session sheet with `## Bugs` rows in `Status` = `candidate`.

## Step 0: Verify pass — close what the runs prove fixed (every invocation; alone with `--verify`)
For every `<qa-root>/defects/<slug>/DEF-*.md` with `**Status:** OPEN` that names a `**Case:**`:
0. **Dev handoff first.** When `dev/release/<slug>/qa-handoff.md` exists and its `## What changed`
   names `DEF-<slug>-NNN` ids (the defects the shipped fix claims to resolve), verify exactly those
   before any other; one with no newer passing run is listed as `awaiting re-run (named by the dev
   handoff)` so the dev bundle's G10 can see it. The packet is read, never edited.
1. Read that case's traceability row: `Last run`, `Status`, `Report`.
2. **Fixed** when `Status` = ✅ AND `Last run` is newer than the defect's `**Run:**` and every
   `## Recurrence` run-id AND the run's `summary.md` lists the case as pass **AND the system changed**
   (CONTRACTS §31.5): the passing run's `code` identity (its `target.json`) differs from the one the
   defect failed on. A pass on the same identity is a flake or an environment change, not a fix —
   leave it OPEN, note `passed on an unchanged system <id> — not a fix`, and route to `/qa-flaky`.
   No `target.json` on either run → close only with the line suffixed `· target unknown` and say so.
   Then write: `## Verification` line `- <run-id> · <env> · <Case ID> ✅ · <today> · target <id>`, `**Status:** CLOSED`,
   `**Closed:** <today>`, `**Resolution:** fixed (verified <run-id>)`. `**Origin:** ESCAPED` defects
   additionally set the `<qa-root>/defects/ESCAPES.md` row `Status` to `CLOSED`.
3. **Still failing** (`Status` ❌ in a newer run with the same Expected/Actual pair) → append a
   `## Recurrence` line (`… · target <id>` from the run's `target.json`); Status stays OPEN.
   A defect with `**Case:** —` (an escape not yet backfilled) cannot close `fixed`: there is no guard
   that was red before and green after. Its case is designed first (§13 Backfill).
4. **No newer run** → untouched; listed as `awaiting re-run`.
5. **Human closures** (`not-a-bug` / `duplicate of DEF-…` / `wont-fix (accepted by <role> on <date>)`)
   are written ONLY when the user states the decision in this conversation — quote it in
   `**Resolution:**`; never infer one.
6. **Re-open**: a `CLOSED` defect whose case is ❌ again in a run newer than `**Closed:**` with the
   same Expected/Actual pair → `**Status:** OPEN`, `**Closed:** —`, `**Resolution:** —`, a
   `## Recurrence` line (reason `re-opened`). A DIFFERENT failure on the same case is a new defect.

## Step 1: Select what becomes a defect — triage class decides
From each ❌ row's `failures.md` suspected-cause class:

| Class | Becomes a defect? | Otherwise |
|---|---|---|
| FUNCTIONAL | **Yes** — when its `attribution:` line holds precondition · control · repro (CONTRACTS §31.4) | missing → back to triage, never a defect on a guess |
| SCRIPT | No | prescribe `/qa-heal <TC-id>` (e2e) or `/qa-script --type <t>` regen |
| SETUP / ENV | No | prescribe the `> **Project setup required:**` fix (or `/qa-env`) |
| FLAKY | Not yet | prescribe `/qa-quarantine <TC-id>` once the flake budget is met; a defect needs a stable repro |

A ❌ row whose case is `@quarantined:` still becomes a defect when its class is FUNCTIONAL (quarantine
changes gate counting, not the truth). Skipped failures are listed with their route — never silent.

**`--from-exploratory`**: each `## Bugs` row with `Status` = `candidate` is a defect candidate with
`**Origin:** EXPLORATORY`, `**Case:** —`, `**Run:** —`, `**Env:**` from `## Session`, Expected from the
row (with its REQ/BR citation when given), Actual = `What happened`, Evidence = the row's Evidence
path. **A candidate becomes a defect only when it names its oracle** — the REQ/BR/AC/standard/spec
it contradicts (CONTRACTS §31.7). One that contradicts only an expectation nobody wrote down is not
raised: it stays `candidate` and a `QUESTION` follow-up asks the owner which behaviour is intended.
After writing, set the row's `Status` to `raised DEF-<slug>-NNN` (the only session-sheet write
this skill makes). Rows the user marks not-a-bug/duplicate are updated accordingly.

## Step 2: Dedupe against open defects
Grep existing `<qa-root>/defects/<slug>/DEF-*.md` for the same Case ID (or same Expected/Actual pair) with
`**Status:** OPEN`. Match → do NOT open a twin; append a `## Recurrence` line (run-id · env · date).
A match on a CLOSED defect → the re-open rule (Step 0.6).

## Step 3: Assign severity — mapping, not judgement
| Severity | Rule |
|---|---|
| Critical | P0 case AND (a `§Quality gates` gate fails because of it, or data loss / security exposure / money) |
| High | P0/P1 case, core behavior broken, no workaround evident in the case's own flow; any Critical/High accessibility finding on a P0 journey |
| Medium | P1/P2 case, deviation with a workaround, or non-core path |
| Low | Cosmetic / message-text deviation with no functional impact |

Record which rule fired. When in doubt between two levels, pick the higher and say why.

## Step 4: Write the defect file (CONTRACTS §13 — field names byte-exact)
`<qa-root>/defects/<slug>/DEF-<slug>-NNN-<short-slug>.md` (NNN = next free number, zero-padded):

```markdown
# DEF-<slug>-NNN — <one-line title: what is wrong, not "test failed">
**Status:** OPEN   **Severity:** <level> (<rule fired>)   **Raised:** YYYY-MM-DD   **Closed:** —
**Origin:** INTERNAL   **Feature:** <slug>   **Case:** <TC-id>   **REQ:** <REQ-ids>   **Env:** <env>   **Run:** <run-id>
**Resolution:** —

## Steps to reproduce
<numbered steps copied from the case — plus the exact test data the run used>

## Expected (verbatim from the case)
## Actual (verbatim from the run output)
## Evidence
<relative paths into <qa-root>/runs/…: trace/screenshot/log/response body/axe json>
<server ids from failures.md, when present: request <id> · trace <id> — the developer's way into the logs>

## Impact
<which quality gate / user flow this blocks>

## Recurrence
## Verification
```

Security/accessibility findings (`findings.md` rows at/above the gate) become defects too: one per
finding, Evidence = the finding's row + artifact; the finding's `Status` in `findings.md` is not
edited here (it is the run's record).

## Step 5: Tag the case file
Append `@defect:DEF-<slug>-NNN` to the failing case's `**Tags:**` line (taxonomy slot order) — the
reverse link that lets `/qa-report`'s failure digest and `/qa-signoff` find defects per case. The
tag stays after closure; the FILE's `**Status:**` is the truth. Touch nothing else in the case.

## Step 6: Optional tracker push — only when configured, only when confirmed (CONTRACTS §9.9)
Only if `§Test management` names a TMS. Show the user the exact list (id, title, severity, target
project/area) and wait for an explicit yes. Then:
- **azure-devops** → one **Bug** work item per defect via the same env vars as
  `publishing-test-cases` (`ADO_BASE_URL`, `TMS_ADO_PAT`, `ADO_PROJECT`, `ADO_AREA_ROOT`).
- **jira** → one issue of `JIRA_BUG_ISSUE_TYPE` (default `Bug`) per defect in `JIRA_PROJECT_KEY` via
  the Atlassian MCP (`createJiraIssue`: summary = `DEF-… — <title>`, description = Steps / Expected /
  Actual / Evidence paths, labels `agentic-created`, `qa-defect`, priority from severity; see
  `publishing-test-cases/references/jira-adapter.md` for the field map). A recurrence on a defect that
  already has `@tms-bug:` → `addCommentToJiraIssue` with the run-id, after confirmation.
Write the REAL id back into the defect file as `**Tags:** @tms-bug:<id>` — never fabricate, never push
unconfirmed, never transition or edit an existing ticket's fields.

## Step 7: Report ONLY this summary to chat
```
✓ Verify pass: closed {n} ({ids}) · recurrences {m} · re-opened {r} · awaiting re-run {k}
✓ Raised {n} defect(s) under <qa-root>/defects/<slug>/ — {ids with severity} (origin {INTERNAL | EXPLORATORY})
Skipped (not defects): {TC-id → route} | Quarantined but FUNCTIONAL: {ids}
Tracker: {pushed ids | not configured | declined}
Next: fix → /qa-run <slug> → /qa-defect <slug> --verify   (a defect closes only from a passing run recorded in its file)
```

## Done — ALL must be true
- [ ] Verify pass ran first: every OPEN defect with a newer passing run is CLOSED with `Resolution: fixed (verified <run-id>)` + a `## Verification` line; recurrences/re-opens recorded; nothing closed from memory.
- [ ] Every FUNCTIONAL ❌ row has exactly one OPEN defect (new or recurrence) — no twins, no misses; exploratory candidates raised with Origin EXPLORATORY and the sheet row set to `raised DEF-…`.
- [ ] Expected/Actual are verbatim quotes; every evidence path exists under `<qa-root>/runs/` (or the session sheet).
- [ ] Severity cites the mapping rule that fired; header fields byte-exact (`npm run qa:lint` clean).
- [ ] SCRIPT/ENV/FLAKY failures routed, listed, and NOT raised as defects.
- [ ] Case files tagged `@defect:…`; tracker ids (if pushed) are real, confirmed first, and written back.
- [ ] No app code, script, case, or assertion was modified.
