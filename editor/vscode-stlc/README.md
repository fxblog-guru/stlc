# Agentic STLC — VS Code board

A live, read-only board for the [`agentic-fx-qa`](https://gitlab.com/agentic-fx/stlc) pipeline. It
shows where every feature is in testing, what failed in the last run and why, which platforms and test
types are covered, and what to run next — without you opening a markdown file, and without it ever
writing one.

It is the QA sibling of the dev bundle's **Agentic SDLC** board: the same layout, type scale, pills,
stepper and tiles, with a teal accent instead of lavender so the two are told apart at a glance.

> Renamed from `vscode-qa` ("Agentic QA" 0.1.0). Settings moved from `qa.*` to `stlc.*`.

## What it shows

**Board** (`STLC: Open Board`)

- **The feature**: its `/qa-status` phase, a ring of cases passed, and a ten-step pipeline —
  knowledge → analyze → plan → design → review → script → env → run → report → sign-off. Each step is
  passed, stale, changes requested, blocked, failing, running, in progress or not started, as an
  icon, a colour and a word. A case review or env check whose inputs changed (`CONTRACTS §18`) shows
  **stale**; one that recorded no hashes says so instead of claiming to be fresh.
- **KPI tiles**: cases designed / scripted / passed, open defects by severity, quarantined cases with
  the nearest expiry, the last run's pass rate, P0/P1 coverage gaps (from a saved `npm run qa:score`
  output under `qa/reports/**/coverage-score*.md` — with none, the tile says *run npm run qa:score*),
  and the release sign-off.
- **Platform × type matrix**: web, android, ios, windows, macos, api (and any `other:*`) by api,
  integration, e2e, ui, security, performance, accessibility, mobile, unit. A cell is pass, fail,
  blocked, handoff, partly run, not run or disabled (the type is off in `PROJECT-PROFILE.md`). A
  case's platforms come from its `**Platform:**` header, its `@platform:` tags or a mobile
  `## Platforms` section. A case that names none is placed by type — api/integration/security/
  performance → api, e2e/ui/accessibility → web, mobile → android + ios — and its cell is marked
  *inferred* (a small ring in the corner). Click a cell for its cases.
- **Run plans** (`CONTRACTS §19`): every `qa/run-plans/*.md` with its description, cases by type and
  platform from `## Resolved cases`, and its last run from `runs/plans/<name>/*/summary.md`.
  **Run** and **Dry-run** open a quick pick showing the exact command —
  `npm run qa:plan:run -- <name>` (`--dry-run`) — and type it into a terminal in the QA folder only
  when you choose *Run in a terminal*. **Open** opens the plan.
- **Latest run**: pass rate, every failing case with its triage class from `failures.md`
  (FUNCTIONAL · SCRIPT · SETUP-ENV · FLAKY, or *not triaged*) and the command that class leads to, and
  links to `summary.md`, `failures.md`, the Playwright HTML report and the trace
  (`STLC: Open a Playwright Trace…` runs `npx playwright show-trace <zip>`, confirmed first). A run
  folder that has no `summary.md` yet is shown as running.
- **Gates & release**: the report's gate rows (the *Re-verify set* row is tagged), its overall verdict
  and staleness, and the sign-off: GO, NO-GO or CONDITIONAL GO.
- **What next, defects, quarantine, activity**: suggested actions with the `/qa-*` command to copy
  (`next_command` from `state.json` first, when the builder names one), open defects (escaped ones
  tagged), the quarantine ledger with expired rows in red, and a feed of commits, runs, reports and
  defects with relative times that keep ticking.
- **Summary**: the current step, the newest run's pass / fail / blocked counts and pass rate, cases
  passed and failed, the percent of pipeline steps passed, and the next action with its command.
- **Activity**: newest first. It shows commits, runs, reports and defects, plus the bundle's own
  events from `<qa root>/logs/activity.jsonl` (`docs/activity-format.md`): flaky cases, failures new
  since the last run, heals passed or refused, lessons learned, and stopped runs. A run already
  shown from its `summary.md` is not listed twice.
- **Decisions**: the questions in the feature's newest `analysis/<slug>/<date>-clarifications.md`
  (`/qa-clarify`). They are grouped as open (blocking ones tagged), assumed (open, but design
  proceeds on the stated assumption) and answered. Clicking a question opens the sheet.
- **Findings**: open defects by severity, then flaky or broken cases and new failures from the
  activity log, then quarantine rows. Clicking one opens its file.
- **Needs you**: questions to answer and assumptions to confirm (`/qa-clarify <slug>`, one batch),
  a passed report with no sign-off yet, and anything the activity log still asks for (a stopped
  run to review, a push). A need stays until a later event for the same feature and link passes.

**Sidebar Overview** is the same page at sidebar width. Its tabs are **Summary · Activity ·
Decisions · Findings · Needs you · Runs · Defects · Coverage**, and they wrap onto a second row
when the sidebar is narrow.

**Trees** — *Features* (feature → pipeline step → the artifact behind it), *Open defects* (with the
quarantine ledger), *Run plans* (with inline Run / Dry-run).

**Status bar** — the feature furthest along that is still in flight: its current step, the last
run's pass/fail and its open defects, in the accent colour, with a filled dot while files are moving.

**Version pill** — the board version and the installed `qa` bundle version, read from
`.claude/.agentic-fx.json` (or `VERSION`). When the installer's no-network notice
`.claude/.agentic-fx-updates.json` names a patch, minor or major update, the pill turns amber
(*update 2.1.0*, *MAJOR update 3.0.0*). Clicking it offers: open the CHANGELOG, run
`afx update --bundle qa` in a terminal (confirmed first), or dismiss that version for this workspace.
An absent or unreadable notice is a plain pill.

## Live while agents work

`state.json` is rebuilt by the Stop hook at the end of a turn. A `/qa-run` can take an hour; what it
writes in that time is what the board shows:

| Source | What the board does with it |
|---|---|
| `runs/<type>/<slug>/<run-id>/`, `runs/plans/<name>/<run-id>/` | Latest run, failures, traces; a run newer than the index turns the feature's Run step to *running*, marked *inferred*, and its verdicts show in the matrix |
| `reports/**` | A report newer than the index marks the Report step *inferred*; `coverage-score*.md` feeds the coverage tile |
| `defects/**`, `regression/quarantine.md` | Named in the feed when newer than the index |
| `run-plans/*.md` | The Run plans panel |
| `logs/activity.jsonl` | Activity, Findings and Needs you (written by `qa:plan:run`, `qa:triage`, `qa:flaky`, `qa:heal-guard`, `qa:learn check`) |
| `analysis/**/*-clarifications.md` | Decisions and Needs you |
| `plans/**`, `cases/**` | Traceability rows and case platforms for the matrix |
| `.git/HEAD`, `.git/logs/HEAD` | Branch and commits in the feed — read from the reflog, so no git process |
| `.claude/.agentic-fx.json`, `.claude/.agentic-fx-updates.json`, `VERSION` | The version pill |

One watcher per source group, debounced at ~300 ms, ignoring dot folders such as `.claude/worktrees`.
No polling and no extra process. An inferred value is drawn beside the builder's, never instead of
it, and the next rebuild settles it.

## What it deliberately does not do

It does not judge a gate, apply a threshold or choose a triage class. Every state is one the builder
recorded in `qa/state.json` (`CONTRACTS §17`), one a verdict file states (§18), or a run file's own
Status cell (§3). Where it fills a gap — a platform a case does not name, a run newer than the index —
it says so.

It writes no file and runs nothing by itself. Run, Dry-run, the trace viewer and the bundle update
each show the exact command and wait for you to pick *Run in a terminal*; you can copy it instead.

## Settings

| Setting | Default | Meaning |
|---|---|---|
| `stlc.statePath` | `qa/state.json` | Where the index lives, relative to the project folder |
| `stlc.showStatusBar` | `true` | Show the active feature in the status bar |
| `stlc.accent` | `teal` | `teal`, `green`, or `theme` (follow the editor accent) |

## Develop

```bash
npm ci
npm run compile        # tsc → out/
npm test               # model, view model (pipeline, matrix, run plans, update notice) and live layer
node media/make-icon.mjs                 # regenerate icon.png from the motif in icon.svg
node tools/preview.mjs <out-dir>         # static pages of the board and the sidebar, dark and light
npx @vscode/vsce package --no-dependencies   # build the .vsix
```

`viewmodel.ts` and `live.ts` import no `vscode`, so the tests run under plain Node against the bundle's
own fixture (`tests/fixture/qa`) and a richer one in `src/test/fixtures/rich` (three features, mixed
platforms, runs, run plans, defects, quarantine, an update notice). That fixture's `state.json` is
produced by the bundle's `build-state.mjs`, so a drift between builder and board fails here first.
