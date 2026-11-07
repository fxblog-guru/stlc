---
description: Heal a failing e2e spec or Maestro flow: static gate, root cause, locator/timing drift; --bulk after a UI refactor.
argument-hint: <script-path-or-slug>
disable-model-invocation: true
---

Follow `qa-phase-protocol` (invoke the skill if it is not already in context); this file holds only what is specific to this command.

> Profile first, by section (`profile.mjs`): it defines tool choices and the QA root used below
> (default `<qa-root>/`, profile-overridable). Default e2e framework: Playwright + TypeScript.

Heal the failing e2e script(s) identified by `$ARGUMENTS`.

## Scope guard — e2e specs and Maestro flows ONLY

This command heals browser e2e scripts under `<qa-root>/scripts/e2e/` and Maestro flows under
`<qa-root>/scripts/mobile/**/TC-MOB-*.yaml` (a platform whose §Platforms Runner is `maestro`). A
WebdriverIO spec on an `appium-wdio` platform lives in the framework repo and is not healed here
(`FRAMEWORK-GAP`, or regenerate via `/qa-script --type mobile`). If `$ARGUMENTS` resolves to an
api, integration, performance, security, or unit script, STOP and explain: those tiers are not
healed — fix the case and regenerate via `/qa-script <slug> --type <type>`, or fix the named
`.env` value for env issues. A failing unit test is either a product defect (`/qa-defect`) or a
wrong test (regenerate); "healing" it would mean bending an assertion to the code.

## Target resolution

- `$ARGUMENTS` is a **path** under `<qa-root>/scripts/e2e/` → heal exactly that script.
- `$ARGUMENTS` is a **slug** → open the latest `<qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md`, take
  the `## Traceability (Requirement ↔ Case)` rows with Type = e2e and `Scripted` ✅, and map each
  Case ID to its mirrored script `<qa-root>/scripts/e2e/<module>/<Case ID>-….spec.ts` (script path
  mirrors case path 1:1). Prefer rows whose Status is ❌ fail. **Never glob `<slug>.md` or
  `<slug>.spec.ts` filenames** — scripts are named by TC id, not by slug.

## Preconditions (check before delegating)

- [ ] The resolved script file(s) exist under `<qa-root>/scripts/e2e/`
- [ ] If resolving via slug: the plan and its traceability table exist

If nothing resolves, STOP and report what was looked for (path tried, or slug + why the
traceability lookup found no e2e scripts).

## Execution

**Maestro flow** (a `.yaml` path, or a slug whose failing rows are Type `mobile` on a `maestro`
platform): delegate to the `mobile-test-engineer` agent to invoke `healing-mobile-flow` per flow —
`qa:lint` first, the run's `results.json` `crashes` read before any edit (a crash stops the heal and
goes to `/qa-defect`), element-map fixes scored ≥ 3 and checked against the live tree
(`maestro hierarchy`), three attempts at most. The rest of this section is the e2e path.

**E2e spec:** delegate to the `automation-engineer` agent to invoke the `healing-e2e-script` skill on each
resolved script. The skill is **check-first**:

1. **Offline static pre-flight** — `npm run heal:check` from `<qa-root>/` (tsc + the shipped eslint rules:
   no sleeps / networkidle / skip / only / conditionals / missing asserts; then the skill's own locator
   cross-check against the registry) to catch structure, import, syntax and rule breakage — e.g.
   after a merge — before any browser starts. Structural errors are fixed (or reported) here first.
2. **Runtime heal** — only if the script is structurally sound: run it, diagnose failing
   selectors/timing, apply minimal selector rewrites and waits, and re-run to verify green.

> Shipped: `heal:check` in `<qa-root>/package.json` (`tsc --noEmit && eslint …`) and `<qa-root>/eslint.config.mjs`;
> if a project removed them, report that before healing can run its static stage.

Healing edits **script code only** — never the case `.md`, never the traceability table (the next
`/qa-run` records the new result), and never application code. If the diagnosis is an application
defect rather than script drift, STOP the heal for that script and report it as a product bug.

## Done criteria

Report per script: (1) pre-flight result — compile/lint pass or the structural errors found and
fixed; (2) heal result — selector/timing rewrites applied (before → after), final run verdict;
(3) anything left for a human: unhealable locators, suspected app defects, or scripts still red;
(4) a still-flaky spec → suggest `/qa-quarantine` with the run-ids, never a retry loop. Suggest
`/qa-run <slug> --type e2e` to record the healed state in traceability.
