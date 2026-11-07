---
description: Step 3 · design one case file per REQ × type and append traceability rows (--type unit|api|…|all).
argument-hint: <slug> [--type unit|api|integration|e2e|security|performance|accessibility|ui|mobile|data|all] [--platform <id>]
disable-model-invocation: true
---

Follow `qa-phase-protocol` (invoke the skill if it is not already in context); this file holds only what is specific to this command.

> Profile first, by section (`profile.mjs`): it defines the enabled test types (§Test types), the
> application scope for security work (§Application under test), and the QA root used below
> (default `<qa-root>/`, profile-overridable).

Design test cases for feature `<slug>` (first token of `$ARGUMENTS`). This is step 3 of the
pipeline and consumes the plan produced by `/qa-plan`.

## Preconditions (check before delegating)

- [ ] A test plan exists: latest `<qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md` containing the
      `## Traceability (Requirement ↔ Case)` table (skeleton or already populated)
- [ ] The matching strategy `<qa-root>/plans/<slug>/YYYY-MM-DD-strategy.md` exists
- [ ] Every requested `--type` is enabled in §Test types

If the plan is missing, STOP and tell the user to run `/qa-plan <slug>` first. If a requested
type is disabled in §Test types, STOP and report it (the profile, not the command line, decides
what this project tests). Types that are enabled but ruled out by the plan are skipped with a
warning, not designed.

## Knowledge preflight (before any case is written)

Each agent first reads, in this order: the analysis REQ and AC registers; the latest impact note
§1–§4 when `/qa-impact` ran; and `<qa-root>/wiki/compiled/index.md`, then every atomic page that names a
BR, term or persona this slug touches, read whole. It writes each case's `## Grounding` from what it
opened (CONTRACTS §7). A BR the analysis names but the wiki lacks is a gap. It goes in the design
summary and is never invented. Grounding is not filled in after the steps are written.

## Type resolution

`--type` accepts one value or `all`. Default (no flag) = `all` = every type that is BOTH enabled
in §Test types AND in scope per the plan's coverage targets.

## Routing — delegate each resolved type to its agent

| Type | Agent | Skill it invokes |
|---|---|---|
| e2e | `case-designer` | `designing-functional-cases` |
| api | `case-designer` | `designing-api-cases` |
| integration | `case-designer` | `designing-integration-cases` |
| security | `nonfunctional-engineer` | `designing-security-cases` |
| performance | `nonfunctional-engineer` | `designing-performance-scenarios` |
| unit | `unit-test-engineer` | `designing-unit-cases` |
| accessibility | `case-designer` | `designing-accessibility-cases` |
| ui | `case-designer` | `designing-ui-cases` |
| mobile | `mobile-test-engineer` | `designing-mobile-cases` |
| data | `data-test-engineer` | `designing-data-cases` |

Fan out only `sizing.mjs fanout <slug>`: the plan's sized `types` ∩ §Test types, grouped by agent; it
exits 1 on an unsized or skipped change — STOP. Before each spawn run `sizing.mjs spawn <slug> --agent <a>
--phase design`; exit 3 means the class spawn budget is spent — STOP and ask.

**One spawn per agent, not per type**: an agent with several resolved types gets them in one
dispatch and invokes each type's skill in turn. A type with no undesigned REQ is reported as
`nothing to do`, not dispatched.

Integration and api agents design the plan's `deploy_impact` checks (CONTRACTS §30).

With `<qa-root>/imported/inventory.jsonl`, pass each agent the imported cases of the modules it touches, to promote rather than design twins (CONTRACTS §29).

Pass each agent the slug, the plan path, the analysis path, the coverage target for its type, the
`§Code knowledge` table, and the latest impact note path when `/qa-impact` ran. For `unit`, also
pass the latest `<qa-root>/reviews/<slug>/YYYY-MM-DD-unit-review.md` when `/qa-unit-audit` ran — its §5
subject list is the design backlog — and require `§Unit testing` to be filled (enabled but
unconfigured → STOP with the setup callout). For `mobile`, require `§Mobile testing` to be filled
(framework repo, platforms, device matrix, test dirs, convention) and pass the slug's e2e cases so
the mobile tier targets the app's own behaviour and the device conditions, not a re-run of the web journey.
Security design is bounded by the scope guardrail: cases target ONLY the team's own application
(§Application under test) in authorized test environments — OWASP-Top-10-derived cases and
authn/authz matrices, never exploit development or third-party systems.

## Output contract (the agents enforce this; verify before reporting)

- One file per case at `<qa-root>/cases/<type>/<module>/TC-<TYPE>-<MODULE>-<NNN>-<short-desc>.md`, with
  `TYPE ∈ {API, INT, E2E, SEC, PERF, UNIT, A11Y, MOB, UI, DATA}` and `NNN` sequential per module (scan existing files to
  continue the sequence — never reuse a number). `<module>` is resolved via the
  `resolving-test-placement` skill — never guessed.
- Every case follows the canonical case format: header lines `**Feature:** <slug>` and
  `**Plan:** <qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md` (this linkage is how every later phase
  finds the cases — file names never carry the slug), `**Type:**`/`**Module:**`/`**Priority:**`,
  `**Platform:**` (an enabled §Platforms id per CONTRACTS §20, mirrored as `@platform:<id>` tags and in the
  title `[<Module> · <Platform>]`; `--platform <id>` narrows design to one platform), `**AC:**`,
  a `**Tags:**` line per `<qa-root>/docs/tag-taxonomy.md` (`@<type> @<module> @P<n> [@req:<id>]
  @agentic:gen` — `@tms:` never ADDED at design time, but preserved when re-designing a case that already carries one), then Objective (one sentence) / Technique / Isolation /
  Preconditions / Steps (every step with an Expected; extra inputs as `## Variants` rows) / Expected Result /
  Data. Performance cases use `## Workload` + `## SLOs` instead of Steps; security cases add
  `## OWASP ref` + `## Authorization`; unit cases add `## Subject` (a `<layer>:<path>#<symbol>
  @ <sha>` citation or `TESTABILITY-GAP`), `## Test matrix` (byte-exact columns) and `## Doubles`,
  with Steps mirroring matrix rows 1:1; mobile cases add `## Platforms` (one journey, both platforms;
  platform-specific Expected deltas inside the case) + `## Device profile` (devices or tier + the
  conditions exercised: network, permissions, interrupts, orientation, locale; `real device required`
  when an emulator would fake the result); accessibility cases add `## WCAG ref` (target + bare SC ids)
  + `## Scope` (screen · states · viewport · check kind · exclusions with reasons) and tag `@manual`
  when a human must execute them (`Scripted` stays ❌ for life; reports count them as manual);
  ui cases add `## Screen states` · `## Viewports` · `## Visual baseline` (masks with reasons) ·
  `## Layout rules` — visual and layout, never a journey (that is e2e); data cases add `## Hop` ·
  `## Oracle` · `## Tolerance` (CONTRACTS §28) and require §Data testing readiness R1–R8.
- Each designing skill APPENDS one row per new case to the plan's
  `## Traceability (Requirement ↔ Case)` table: Req = the `REQ-<NNN>` covered, `Scripted` = ❌,
  `Last run`/`Status`/`Report` = `—`. Rows are appended, never rewritten.
- Each designing skill also APPENDS the new Case ID to the `<qa-root>/docs/impact-map.md` row(s) of every
  `BR-###` the case cites (`maintaining-impact-map` Mode A, `TC` cell only), and sets the `Backfill`
  cell of any `pending` `<qa-root>/defects/ESCAPES.md` row whose defect named this subject (CONTRACTS §13). Code facts not in the
  analysis are resolved by `grounding-in-code` and cited `<layer>:<path>#<symbol> @ <sha>` in `## Data`.

## Done criteria

- Every in-scope REQ id has at least one traceability row per applicable type, or the gap is
  reported explicitly.
- Case files and traceability rows are consistent (same Case IDs both sides).

Report back per type: cases designed (count + ID range), modules touched, traceability rows
appended, and any REQ left uncovered with the reason. Next step: `/qa-script <slug>`.
