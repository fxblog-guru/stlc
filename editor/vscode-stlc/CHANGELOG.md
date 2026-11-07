# Change Log

All notable changes to the Agentic STLC board. The version is the one in `package.json`.

## [Unreleased]

### Added
- **Background rebuild (0.4.3)**, as in vscode-sdlc: `stlc.backgroundRebuild` (off by default) runs
  the project's `build-state.mjs` when a run, report, defect, run plan, case or review changes, at
  most once per `stlc.backgroundRebuildSeconds` (default 120, minimum 15). The bundle's Stop hook
  only fires for a Claude session opened inside the project; a session opened in a parent folder
  left the board frozen at the last build.

### Changed
- The update action runs `npx agentic-fx@latest update --bundle qa` for a project installed with
  the public npx package, `afx update --bundle qa` otherwise, picked by the notice's `source`. The
  notice's own `command` is no longer used at all: a file is data, and data never picks what runs.

### Fixed

- Long text no longer squeezes a row into a narrow column. Needs you names at most three ids and
  shows a longer list as a range (`24 assumed: DEC-009 … DEC-033`). Rows in Needs you and Decisions
  wrap their text in its own column, and the tag and command move to their own line when space
  runs out. A decision's question is clamped to three lines and its answer to two.

### Added

- **Agents tab (0.4.0, 0.4.1).** The full board has a second view, *Agents*, beside *Board*, and the
  sidebar has an *Agents* tab. **STLC: Open Agents** opens the board on it. Each figure is one
  Claude Code subagent, with a name that is unique within its chat, the work items it names, its
  last step and whether it is working, idle or done. Agents that ran together sit at one round
  table. Chats opened in the project, in a parent folder or in a sibling worktree all count.
  Transcripts are read from `~/.claude/projects`, and nothing is written there. The separate
  *Agents* sidebar view of 0.4.0 is gone: the webview's Content-Security-Policy blocked its inline
  styles, so the figures drew as black shapes. `src/agents.ts`, `src/agentsView.ts` and
  `media/agents.{js,css}` are identical copies of the ones in the sdlc addon.
- **Summary**, **Activity**, **Decisions**, **Findings** and **Needs you** views, as sidebar tabs and
  as sections on the board. The tabs wrap at narrow widths.
- Reads `<qa root>/logs/activity.jsonl` in the shared activity format (`src/activity.ts`, the same
  parser the SDLC board carries). Runs, findings, heals, lessons and stops reach the feed, and a
  run already shown from its folder is not listed twice. Open needs reach Needs you.
- Decisions come from the feature's newest clarifications sheet: open, assumed (open, with the
  assumption design proceeds on) and answered. Needs you batches them under `/qa-clarify <slug>`,
  and adds a sign-off for a passed report that has none.
- Findings lists open defects by severity, then flaky cases and new failures from the log, then
  quarantine rows. Each opens its file.
- Watches `logs/activity.jsonl` and `analysis/**/*-clarifications.md`.

## [0.3.0] - 2026-10-15

Several QA projects in one workspace, at parity with the SDLC board 0.3.0.

### Added
- `STLC: Select Project` lists every project under the workspace folders with a `qa/state.json`,
  newest first, plus projects that have `qa/run-plans/*.md` but no index yet ("no index yet — run
  node qa/scripts/shared/build-state.mjs"). "Most recently updated" (the default) follows the newest
  index; a pick is remembered per workspace. `.claude/worktrees`, `.git`, other dot folders and
  `node_modules` are skipped; a folder with an index is a project and is not searched further.
- The views, the status bar and the Board tab title name the project on show, only when there is
  more than one. A discovery watcher per workspace folder picks up a project that appears.
- Activates on `onStartupFinished` as well, so projects nested deeper than the `workspaceContains`
  search reaches (or with an ignored `qa/state.json`) still get the board; with no project found it
  stays silent.

### Changed
- Every path resolves against the selected project, even when its index is missing or broken: the
  live overlays, Run / Dry-run (terminal cwd = the project's `qa` folder), traces, report and artifact
  links, and the version pill (`.claude/.agentic-fx.json`, `.claude/.agentic-fx-updates.json`).

## [0.2.0] - 2026-10-15

Renamed from `vscode-qa` ("Agentic QA") to `vscode-stlc` ("Agentic STLC"), and rebuilt on the
architecture of the dev bundle's Agentic SDLC board.

### Changed
- Package `vscode-stlc`, display name "Agentic STLC", folder `editor/vscode-stlc`. Every id is
  `stlc.*`: commands, views, the view container and settings (`qa.statePath` → `stlc.statePath`,
  `qa.showStatusBar` → `stlc.showStatusBar`). Activates on `**/qa/state.json` or `**/qa/run-plans/*.md`.
- The seven-column kanban is replaced by a per-feature board: a ten-step pipeline
  (knowledge → … → sign-off), KPI tiles and the sections below.

### Added
- Webview **Overview** in the sidebar, tabbed Now · Runs · Defects · Coverage; full **Board** tab.
- **Platform × type matrix**, with platforms from `**Platform:**` / `@platform:` / `## Platforms`,
  or the type's default marked *inferred*.
- **Run plans** panel and tree: cases by type and platform, last run, and Run / Dry-run that open a
  terminal with `npm run qa:plan:run -- <name>` only after a confirm pick.
- **Latest run**: failures with their triage token, links to `summary.md`, `failures.md`, the HTML
  report, and `STLC: Open a Playwright Trace…`.
- **Gates & release** with the Re-verify set row and the GO / NO-GO / CONDITIONAL GO sign-off.
- **Live overlay**: runs, reports and defects newer than `state.json`, marked *inferred*; an activity
  feed from `.git/logs/HEAD` and those files; relative times that tick.
- **Version pill** with the installed `qa` bundle version, turning amber on an update notice from
  the installer (`.claude/.agentic-fx-updates.json`): CHANGELOG, `afx update --bundle qa` (confirmed
  first) or dismiss for this version.
- Teal accent (`stlc.accent`: teal | green | theme); dark, light and high-contrast themes; a new
  flask-and-check icon generated by `media/make-icon.mjs`.
- Project picker (`STLC: Select Project`) when a workspace holds several QA roots.
- Tests under plain Node for the view model and live layer (48), against the bundle fixture and a
  richer neutral fixture; `tools/preview.mjs` renders static pages for screenshots.

## [0.1.0] - 2026-10-04 (as `vscode-qa`, "Agentic QA")

### Added
- Initial release for Agentic QA (`agentic-fx-qa`).
- Reads `qa/state.json` (CONTRACTS §17 derived read model).
- Kanban board on the `/qa-status` ladder; eight-type posture strip.
- Open defects tree view with click-to-open artifact navigation.
- Status bar item with active feature and defect count.
