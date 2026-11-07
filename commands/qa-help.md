---
description: Print every /qa-* command grouped by phase, with when-to-use and the next command.
argument-hint: [command-name]
disable-model-invocation: true
---

Follow `qa-phase-protocol` (invoke the skill if it is not already in context); this file holds only what is specific to this command.

Print the map below (or only the row for `$ARGUMENTS` when a command name is given, plus its
`argument-hint` from `.claude/commands/<name>.md`). Console only; no files read beyond the command
file, nothing written.

## The pipeline (one feature, in order)

| Command | When | Produces | Then |
|---|---|---|---|
| `/qa-import --source <name>=<export> … [--scripts <dir>]` | the project already has tests (first, instead of starting from an empty suite) | inventory + import report: duplicates, weak steps, script links | `/qa-flaky` · `/qa-regression` · `/qa-impact` |
| `/qa-knowledge` | raw domain docs exist (optional, first) | `<qa-root>/wiki/compiled/` + BR-### | `/qa-analyze` |
| `/qa-impact <slug> <story>` | the moment a story lands | impact note + `<qa-root>/docs/impact-map.md` rows | `/qa-analyze` |
| `/qa-analyze <slug> <docs \| JIRA-KEY…>` | start of every feature | analysis with REQ-ids, risks, testability matrix | `/qa-clarify` · `/qa-estimate` · `/qa-plan` |
| `/qa-clarify <slug>` | requirements shaky | PM question sheet (BLOCKING first) | `/qa-plan` |
| `/qa-estimate <slug>` | before committing scope | effort forecast with derivations | `/qa-plan` |
| `/qa-plan <slug>` | analysis approved, blocking questions = 0 | strategy + plan + EMPTY traceability | `/qa-unit-audit` · `/qa-design` |
| `/qa-unit-audit <slug \| module>` | brownfield module, before unit design | existing-unit-test audit (ADEQUATE / GAPS) | `/qa-design --type unit` |
| `/qa-design <slug> [--type …] [--platform <id>]` | plan approved | one file per case + traceability rows (`--type ui` = visual & layout; every case names its §Platforms platform) | `/qa-review` |
| `/qa-review <slug>` | before scripting | READY / REVISE FIRST | `/qa-script` |
| `/qa-script <slug> [--type …]` | review READY | scripts mirroring cases 1:1 (unit + mobile → HANDOFF; `--type ui` → screenshots + layout checks, baselines from the CI job) | `/qa-env` |
| `/qa-setup [<env>] [--install]` | once per machine, after `afx install` | tools per enabled type + install commands | `/qa-env` |
| `/qa-env <env>` | before the first run of a session | readiness per type | `/qa-run` |
| `/qa-run <slug> [--type …] [--env …] [--platform <id>,…]` | scripts exist, env ready | run evidence + traceability run columns + a platform × type matrix (`--type ui` needs CI baselines) | `/qa-upload` · `/qa-report` |
| `/qa-run-plan <name> "<prompt>" \| --standard \| --list` | you want a named, re-runnable selection across features and types | `<qa-root>/run-plans/<name>.md` (a run plan — not the test plan) | `/qa-run --plan <name>` |
| `/qa-run --plan <name> [--env …]` | a run plan exists | run evidence in `<qa-root>/runs/plans/<name>/` + run columns of every slug touched | `/qa-report` · `/qa-signoff` |
| `/qa-ingest <slug> --from <junit.xml | dir | url>` | the suite ran in CI (or on a teammate's machine) | run folder + traceability run columns, without re-running | `/qa-report` |
| `/qa-upload <slug> [--type …] [--gate]` | after a run, when a report hub is configured | results + evidence in `verdict`: history, flakiness score, server-side gate | `/qa-report` |
| `/qa-report <slug>` | after runs | gate verdicts, findings, coverage, trend | `/qa-defect` · `/qa-heal` · `/qa-signoff` |

## After a run

| Command | When | Produces |
|---|---|---|
| `/qa-triage <run dir \| slug>` | a run failed — before deciding what each failure is | `triage.md`: where, groups by cause, suggested class, new vs known | `/qa-defect` · `/qa-heal` · `/qa-flaky` |
| `/qa-defect <slug> [--verify] [--from-exploratory XS-id]` | FUNCTIONAL failures · fixed defects to verify · session bug candidates | DEF files (OPEN → CLOSED with Resolution), `@defect:` tags, optional tracker push |
| `/qa-heal <spec \| slug>` | SCRIPT failures on e2e | healed spec (static gate first) |
| `/qa-quarantine <TC-id> --until … --reason … \| --release \| --list` | FLAKY triage meets the flake budget | tag + ledger row (≤30 days), suites drop it, gates stop counting it |
| `/qa-escape <slug> <ticket \| text>` | a bug reached production / a customer | ESCAPED defect + escape analysis + backfill + ledger row |
| `/qa-explore <slug> [--charters N] \| --debrief <XS-id>` | unknown-unknowns, manual a11y, fragile areas | charters → session sheets → bug candidates + follow-ups |

## Team work

| Command | When | Produces |
|---|---|---|
| `/qa-review-pr <n \| branch> [--env …]` | a teammate's testing PR/MR (GitLab or GitHub) is ready to merge | `<qa-root>/reviews/_pr/…` — scan + run 3× + read → APPROVE / REQUEST CHANGES and a comment to paste (code PRs: `/sdlc-review-pr`) |

## Release & portfolio

| Command | When | Produces |
|---|---|---|
| `/qa-signoff <release-id> <slug,…>` | release readiness | GO / NO-GO / CONDITIONAL with exit criteria (quarantined P0/P1 = condition) |
| `/qa-regression` | after sign-offs | curated `@smoke` / `@regression` (quarantined excluded) |
| `/qa-coverage [slug]` | before a release, or when asked "how much do we test?" | covered / total per dimension: REQs, AC, API operations, screens, BRs, risks, automation, per type, with gaps and next commands |
| `/qa-metrics` | sprint review | portfolio KPIs: DDP (test recall), coverage, pass rate, pyramid mix, defect load, MTTR, escape rate, quarantine, trend |
| `/qa-feedback "<what happened>"` | the bundle itself got in the way | one feedback entry in Recall (or parked in `<qa-root>/feedback.md`) for the maintainer |
| `/qa-retro <release-id \| sprint> [--since …]` | after a release or sprint | the recall loop: leaks as patterns (phase × type × prevention), ≤3 actions each with a mechanism, previous actions closed |
| `/qa-improve <skill> "<check>" --origin <DEF \| retro>` | a retro or escape earned a check | one row in a design skill's minimums + the fixture it must flag + the one it must pass (proposal when not in the bundle repo) |
| `/qa-publish <slug>` | TMS configured (ADO or Jira) | `@tms:<id>` write-back after per-container confirmation |
| `/qa-status [slug]` | any time | one-screen read-only posture |

Types: `unit · api · integration · e2e · security · performance · accessibility · ui · mobile` — enabled
per PROJECT-PROFILE §Test types (`mobile` needs §Mobile testing: the Appium/WebdriverIO framework
repo, platforms, device matrix; specs are staged and handed over like unit tests). Contracts: `.claude/CONTRACTS.md`; `cd qa && npm run qa:lint`.
