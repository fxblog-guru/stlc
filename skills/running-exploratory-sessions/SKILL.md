---
name: running-exploratory-sessions
description: Use to write risk-driven charters and session sheets, and to debrief a finished session into bug candidates and follow-ups (/qa-explore).
version: 1.0.0
---

# Running Exploratory Sessions (SBTM)

> Profile first, by section (`profile.mjs`) — `§Test types`, `§Environments` (where a human may
> explore; security/perf authorization still applies to what they do), `§Domain knowledge`,
> `§Quality gates` (exploratory row, when set). QA root defaults to `<qa-root>/`.

## Prime directive — scripted tests prove what we predicted; sessions find what we did not
A charter is a mission against a named risk with a timebox, not "click around". A session sheet is
evidence: what was covered, what was found, what is still unknown. The skill drafts charters and
debriefs; the exploring is done by a human (the tester's notes are the source — never invent
observations).

## Action
Two modes:
- **Charter mode** (`/qa-explore <slug> [--charters N]`) → create `<qa-root>/exploratory/<slug>/XS-<slug>-NNN-<charter-slug>.md`
  sheets with `## Charter` filled and the rest as the template scaffold (`<qa-root>/_templates/exploratory.md`).
- **Debrief mode** (`/qa-explore <slug> --debrief <XS-id | path>`) → from the tester's raw notes
  (pasted or already in `## Notes`), fill `## Bugs` (candidates), `## Follow-ups` (with exact
  commands) and `## Debrief` (PROOF) — CONTRACTS §14 byte-exact headings/columns.

## Inputs — resolve before writing (STOP conditions)
1. `<slug>` with an analysis and plan (a charter needs risks and scope). No analysis → STOP: run
   `/qa-analyze`; exploring a feature nobody analyzed produces notes nobody can place.
2. Charter sources (read all that exist): analysis §6 risks + §7 ambiguities · wiki `BR-###` pages
   the feature cites · `<qa-root>/analysis/<slug>/…-impact.md` §4 gaps · latest case review findings
   (GAP/THIN/VAGUE) · `<qa-root>/defects/ESCAPES.md` rows for the slug · defect files (fragile areas) ·
   `@manual` cases (accessibility, unautomatable steps) · latest report's not-run / blocked rows.
3. Debrief mode: the target sheet exists and `## Session` is filled by the tester (tester, env,
   started/ended); raw notes present. Missing → ask the tester for the notes; never write a debrief
   from nothing.

## Charter mode

> When `playwright-cli` is installed, a charter may be **driven live** by the agent on the tester's
> behalf: open the area, `snapshot`, act by ref, note what happened with the time — each note
> cites a snapshot or screenshot, and the human still writes the debrief. Absent the CLI the sheet
> is filled by the human tester, as before. Nothing here edits a case or raises a defect.

> **Agent-driven charter** (`/qa-explore <slug> --agent`): the agent runs the charter itself through
> Playwright MCP or `playwright-cli` — same mission sentence, same timebox (counted in actions, ~60
> per 30 min). It works through the **UI risk classes** of `designing-functional-cases` Step 1b on the
> charter's screens (double-submit, back/refresh/deep link, two tabs, role change while open,
> session expiry, hostile data, slow/failed network via route, unsaved-changes guard, list state,
> timezone/locale, keyboard-only) and uses two oracles beyond the screen: the browser console/page
> errors, and the **server log** the run's `QA_SERVER_LOG` / `QA_SERVER_LOG_CMD` points at (the
> `serverWatch` source) — read before and after each probe, every error line noted with its time.
> Each `## Notes` line is `HH:MM <class> <action> → <observation> [snapshot|screenshot|log excerpt]`.
> The agent never writes `## Debrief`: the human reads the notes, confirms or rejects each candidate,
> and the debrief mode below runs on their word. A candidate the agent could reproduce twice may
> carry a draft case seed in `## Follow-ups` (`CASE` row).

> **Agent-driven charter on a mobile app** (`--agent`, the charter's Areas name a mobile screen and a
> §Platforms mobile platform is enabled). Same rules, different hands. The agent drives a booted
> device through the **mobile-mcp** server when it is connected (`mobile_list_elements_on_screen`,
> then act by element, then list again) or, without it, through `maestro hierarchy` + one-command
> Maestro flows and `adb`. It reads the **element tree first** and takes a screenshot only when the
> tree cannot show what the note claims (a rendering, an image, a layout overlap). The UI risk classes
> are replaced by the **device-reality** sets of `designing-mobile-cases` (references/mobile-heuristics.md
> §1–§5): background/kill/restore, rotate mid-input, offline then back, permission denied or revoked,
> an interrupting notification, back button/gesture, font scale. Oracles beyond the screen: the
> **device log** (`adb logcat -c` before the session, `adb logcat -d` after each probe, or
> `mobile_get_device_logs`) and the **crash reports** (`mobile_list_crashes` / the `crashesOf`
> signatures of `scripts/shared/lib/device-log.mjs`) — a crash or ANR of the app id is always a
> `## Bugs` candidate with the log excerpt as Evidence. Notes keep the same line shape, with
> `[tree|screenshot|log excerpt]`. The agent never installs, uninstalls or clears the data of an app
> the tester did not name, and never touches a device the charter's `## Session` does not name.
>
> **From a reproduced candidate to a flow seed.** When the platform's Runner is `maestro` and the agent
> reproduced a candidate twice, it writes the actions as a draft flow at
> `<qa-root>/exploratory/<slug>/XS-<slug>-NNN-seed-<n>.yaml` (beside the sheet — never under
> `scripts/`, so no run, lint or traceability row sees it) and points the `CASE` follow-up at it:
> `/qa-design <slug> --type mobile (seed: XS-…-seed-<n>.yaml)`. The seed is evidence of a path, not a
> script: `generating-mobile-script` rewrites it onto the kit (element map ids, named timeouts, step
> labels) once the case exists.

### Step 1: Rank charter candidates
Score each source item `risk × novelty × coverage gap` (1–3 each). Prefer: High risks with no
passing case · BRs with no TC in the impact map · escaped-defect areas · modules with recent
FUNCTIONAL failures · `@manual` cases (the session executes them) · ambiguities the PM answered
with "it depends". Top N (default 3) become charters; the rest are listed in the summary.

### Step 2: Write each charter (the mission sentence is mandatory)
`Explore <area/flow> with <resources: personas, data variety, devices, roles> to discover
<risk class: data loss, wrong money, broken permissions, confusing states, a11y barriers>.`
Fill `## Charter` bullets: Mission · Areas (screens/endpoints/modules) · Targets (`R-###`,
`BR-###`, `REQ-###`, impact §4 items, review findings, `TC-…@manual` ids the session executes) ·
Out of scope (what scripted cases already prove) · Timebox (60/90/120 min) · Heuristics (pick from
SFDIPOT · CRUD · boundaries/zero-one-many · interrupts/undo · concurrency/two tabs · roles/tenants ·
data variety/unicode/long values · time/zone/DST · slow network · a11y keyboard/screen reader).
Leave `## Session` / `## Notes` / `## Bugs` / `## Follow-ups` / `## Debrief` as the template scaffold.

### Step 3: Placement + numbering
`<qa-root>/exploratory/<slug>/XS-<slug>-NNN-<charter-slug>.md`, NNN = next free per slug folder,
`<charter-slug>` lowercase-kebab from the mission. Re-running charter mode never rewrites an existing
sheet — it creates new ones and says which existing charters cover the same target.

## Debrief mode

### Step 4: Bugs — candidates, never defects
From the notes, each observation that contradicts a REQ/BR/AC or reasonable expectation becomes a
row in `## Bugs`: `| # | What happened | Expected | Evidence | Status |` with `Status` =
`candidate`; `Expected` cites the REQ/BR when one exists — and when none does, the same observation
also gets a `QUESTION` follow-up asking which behaviour is intended: a finding becomes a defect only
against something written down (CONTRACTS §31.7), and the question is how it gets written; `Evidence` = screenshot/log/har path the
tester saved (or `notes HH:MM`). Duplicates of an OPEN defect → `duplicate DEF-…`. Nothing becomes a
DEF here — `/qa-defect <slug> --from-exploratory XS-…` raises them with `**Origin:** EXPLORATORY`.

### Step 5: Follow-ups — every one with an executable action
`| # | Kind | Detail | Action |` — `CASE` → `/qa-design <slug> --type <t>` + the exact input/state
(or "add row to TC-…'s matrix"); `QUESTION` → `/qa-clarify <slug>` + the question; `RISK` → analysis
§6 candidate with L/I; `DATA` → `managing-test-data` token needed. Manual a11y cases executed in the
session: record the verdict per case in `## Notes` (`TC-A11Y-… — pass | fail (Bugs #n)`); the case's
traceability row is NOT edited by this skill (a human or `/qa-run` records manual results in
`Last run`/`Status` with the session id as `Report`).

### Step 6: PROOF debrief
`## Debrief` — one line each: **Past** (covered vs charter, % of mission) · **Results** (bugs,
candidates, manual verdicts, learnings) · **Obstacles** (env, data, access) · **Outlook** (next
charter) · **Feelings** (confidence in the area). Then update the sheet's `## Session` end time if the
tester gave it.

## Step 7: Report ONLY this summary to chat
Charter mode:
```
✓ Wrote {N} charter(s) under <qa-root>/exploratory/<slug>/ — XS-<slug>-NNN … (timebox {t} min each)
Targets: {R-/BR-/REQ-/manual TC ids} | Not chartered (ranked below the cut): {items}
Next: run the sessions; then /qa-explore <slug> --debrief <XS-id>  (paste raw notes)
```
Debrief mode:
```
✓ Debriefed XS-<slug>-NNN — bugs: {n} candidate · {d} duplicate · {x} not-a-bug | follow-ups: {c} CASE · {q} QUESTION · {r} RISK · {k} DATA
Manual cases executed: {TC ids → verdict}
Next: /qa-defect <slug> --from-exploratory XS-<slug>-NNN (raise candidates) · /qa-design <slug> --type <t> (CASE follow-ups) · /qa-clarify <slug> (QUESTIONs)
```

## Done — ALL must be true
- [ ] Charters carry a mission sentence, ranked targets with ids, out-of-scope, timebox, heuristics; sheets at the contract path with byte-exact headings.
- [ ] Debrief rows come only from the tester's notes; `## Bugs` statuses are `candidate` / `duplicate DEF-…` / `not-a-bug` (never `raised` — that is `/qa-defect`'s write).
- [ ] Every follow-up has an executable `Action`; manual case verdicts recorded in `## Notes`.
- [ ] No case, plan row, defect, or script written here.
