---
description: Step 4 · generate scripts 1:1 from cases (Playwright, axe, k6, ZAP; unit and mobile staged → HANDOFF).
argument-hint: <slug> [--type unit|api|integration|e2e|security|performance|accessibility|ui|mobile|data|all]
disable-model-invocation: true
---

Follow `qa-phase-protocol` (invoke the skill if it is not already in context); this file holds only what is specific to this command.

> Profile first, by section (`profile.mjs`): it defines the enabled test types (§Test types), tool
> choices, and the QA root used below (default `<qa-root>/`, profile-overridable).

Generate automation for feature `<slug>` (first token of `$ARGUMENTS`). This is step 4 of the
pipeline and consumes the cases produced by `/qa-design`.

## Preconditions (check before delegating)

- [ ] The plan `<qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md` (latest) exists with its
      `## Traceability (Requirement ↔ Case)` table
- [ ] Cases exist for the requested types — locate them by:
      (a) the plan's traceability table (Case ID + Type + Module → the case path
      `<qa-root>/cases/<type>/<module>/<Case ID>-….md`), then
      (b) fallback: grep for the header line `**Feature:** <slug>` under `<qa-root>/cases/`.
      **NEVER glob `<slug>.md` filenames** — case files are named by TC id, not by slug; a
      filename glob finds nothing and must not be "fixed" by renaming files.
- [ ] Every requested `--type` is enabled in §Test types
- [ ] If a case review exists (`<qa-root>/reviews/<slug>/YYYY-MM-DD-case-review.md`, latest), its verdict
      is **READY FOR /qa-script** — a REVISE FIRST verdict blocks scripting until `/qa-design`
      addresses the High findings (no review on file → proceed; reviewing is recommended, not mandatory)

If no cases are found for a requested type, STOP for that type and tell the user to run
`/qa-design <slug> --type <type>` first. `--type` defaults to `all` = every enabled type that has
unscripted cases (`Scripted` = ❌ in traceability).

## Routing — delegate each resolved type to its agent

One spawn per agent, not per type: an agent with several resolved types gets them in one dispatch.
Resolve types with `sizing.mjs fanout <slug>` and record each spawn with `sizing.mjs spawn <slug>
--agent <a> --phase script` (exit 3 = the class budget is spent: STOP and ask), as in `/qa-design`.

| Type | Agent | Skill it invokes | Script output |
|---|---|---|---|
| e2e | `automation-engineer` | `generating-e2e-script` | `<qa-root>/scripts/e2e/<module>/<TC-name>.spec.ts` (Playwright TS) |
| api | `automation-engineer` | `generating-api-script` | `<qa-root>/scripts/api/<module>/<TC-name>.spec.ts` (Playwright API tier) |
| integration | `automation-engineer` | `generating-api-script` | `<qa-root>/scripts/integration/<module>/<TC-name>.spec.ts` (Playwright API tier) |
| performance | `nonfunctional-engineer` | `generating-perf-script` | `<qa-root>/scripts/performance/<module>/<TC-name>.js` (k6 default; locust `.py` alternative) |
| security | `nonfunctional-engineer` | `generating-security-script` | `<qa-root>/scripts/security/<module>/…` (ZAP baseline config + authz spec files) |
| unit | `unit-test-engineer` | `generating-unit-script` | `<qa-root>/scripts/unit/<module>/<TC-name>.<ext>` (staged; `.test.ts`/`.cs`/`.py`/`.java` per §Unit testing) + row in `<qa-root>/scripts/unit/HANDOFF.md`; written into the repo's test dir ONLY when §Unit testing Write mode = `apply` |
| accessibility | `automation-engineer` | `generating-a11y-script` | `<qa-root>/scripts/accessibility/<module>/<TC-name>.spec.ts` (Playwright + axe-core via `shared/a11y/axe.ts`); `@manual` cases get no script |
| ui | `automation-engineer` | `generating-ui-script` | `<qa-root>/scripts/ui/<module>/<TC-name>.spec.ts` (Playwright `toHaveScreenshot` via `shared/ui/visual.ts` + layout checks via `shared/ui/layout.ts`); baselines are generated in the CI image, never by this command |
| mobile | `mobile-test-engineer` | `generating-mobile-script` | Runner `maestro`: `<qa-root>/scripts/mobile/<module>/<TC-name>.yaml` (a Maestro flow on `<qa-root>/scripts/shared/maestro/`, runs from `<qa-root>/`). Runner `appium-wdio`: `<qa-root>/scripts/mobile/<module>/<TC-name>.spec.ts` (staged WDIO + Appium spec) + row in `<qa-root>/scripts/mobile/HANDOFF.md`; written into the framework repo's test dir ONLY when §Mobile testing Write mode = `apply` — never into its `src/` |
| data | `data-test-engineer` | `generating-data-script` | `<qa-root>/scripts/data/<module>/<TC-name>.<sql\|yml\|py>` (staged dbt or PySpark test) + row in `<qa-root>/scripts/data/HANDOFF.md`; written into the pipeline repo's test dir ONLY when §Data testing Write mode = `apply` — never into models, jobs or DAGs |

**Path contract:** every script mirrors its case path 1:1 —
`<qa-root>/cases/<type>/<module>/<TC-name>.md` → `<qa-root>/scripts/<type>/<module>/<TC-name>.<ext>` (same
filename, same casing). Pass each agent the case file paths, the plan path, and the env variable
names from `<qa-root>/.env.example` (`BASE_URL`, `API_BASE_URL`, `TEST_USER`, `TEST_PASSWORD`,
`DB_CONNECTION`, `PERF_TARGET_URL`, `PERF_VUS`, `PERF_DURATION`, `ZAP_TARGET_URL`) — scripts read
config from env, never hardcode it. Unit scripts take no env at all (hermetic) — pass the case
paths, the plan path, and the `§Unit testing` layer rows instead; the agent must refuse any target
path outside the declared test dirs (CONTRACTS §9.6 / §11). Mobile scripts take the `§Mobile testing`
rows (framework repo, platforms, test dirs, convention, path aliases) — device selection happens at
run time, never in a spec, and the framework's `src/` is read-only (missing pieces are
`FRAMEWORK-GAP`s in the handoff, CONTRACTS §15).

**Code truth:** endpoint paths, payload shapes, and locators beyond the case and
`<qa-root>/docs/element-registry.md` resolve through `grounding-in-code` (PROJECT-PROFILE `§Code knowledge`
→ read-only source grep) and are cited `<layer>:<path>#<symbol> @ <sha>` in the spec header; an
unresolvable fact is `// UNRESOLVED` / `// COVERAGE-GAP`, never a guess.

> **Project setup required:** generated scripts run via the `<qa-root>/package.json` runner scripts
> (`test:e2e`, `test:api`, `test:integration`, `test:perf`, `test:security`, `test:unit`, `test:a11y`, `test:ui`, `test:mobile`); the
> project must have installed the toolchains they invoke (Playwright browsers, k6 or locust, ZAP,
> the app repo's own unit toolchain per §Unit testing) before `/qa-run`.

## Post-generation write-back

For every case that received a script, flip its `Scripted` cell in the plan's traceability table
from ❌ to ✅. Cases that could not be scripted (e.g. an e2e case with no automatable surface)
keep ❌ and are reported with the reason — never delete their rows. `@manual` cases keep ❌ by design
(reported as manual, not as a gap). Unit cases flip ✅ once the
staged file passes the static gate and its HANDOFF row exists — even in `propose` mode; the
HANDOFF `Status` (`proposed`/`applied`/`merged`) tells `/qa-run` whether the test is runnable yet.
Mobile cases behave identically against `<qa-root>/scripts/mobile/HANDOFF.md` (CONTRACTS §15).

## Done criteria

- Every generated script compiles/parses AND passes `npm run heal:check` (tsc + the shipped eslint
  rules: no sleeps, no skip/only, no conditionals in a test, every test asserts) and sits at the
  exact mirrored path.
- Traceability `Scripted` cells match the filesystem: ✅ rows have a script, ❌ rows do not.

Report back per type: scripts generated (count), cases skipped with reasons, and the traceability
cells flipped. Next step: `/qa-run <slug>`.
