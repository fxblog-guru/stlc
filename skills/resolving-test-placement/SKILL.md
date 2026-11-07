---
name: resolving-test-placement
description: Use before writing a case or script to resolve its <type>/<module>[/<surface>] path from the analysis and plan; asks, never guesses.
version: 1.0.0
---

# Resolving Test Placement

> Profile first, by section (`profile.mjs`): it defines `§Application under test` (whether the product has
> distinct surfaces), `§Test types` (the enabled types), and the QA root (default `<qa-root>/`).

## Action
Given a feature `<slug>`, a **type** (`unit|api|integration|e2e|security|performance|accessibility|mobile`), and a candidate module,
return the exact placement for both the case and its mirrored script — and STOP to ask the user when the
module cannot be derived. Every other skill calls this before writing; **never guess a path, never invent
a module.**

## The layout (contract — do not rearrange)
```
<qa-root>/cases/<type>/<module>/TC-<TYPE>-<MODULE>-<NNN>-<short-desc>.md
<qa-root>/scripts/<type>/<module>/<same-TC-basename>.<ext>          # mirrors the case path 1:1
```
- `<type>` ∈ {unit, api, integration, e2e, security, performance, accessibility, mobile}; `<TYPE>` = its UPPER tag (UNIT, API, INT, E2E, SEC, PERF, A11Y, MOB).
- `<module>` = lower-kebab business module (e.g. `orders`, `invoices`, `auth`).
- Script extension by type: `.spec.ts` (e2e/api/integration/accessibility), `.js` (performance — k6), for security a
  `.conf`/`.spec.ts` pair (ZAP baseline config + authz specs) under `<qa-root>/scripts/security/<module>/`, and
  for unit the framework's extension from `§Unit testing` (`.test.ts` vitest/jest · `.cs` xunit/nunit ·
  `.py` pytest · `.java`/`.kt` junit5) — the STAGED mirror; the repo Target path is derived separately
  by `generating-unit-script` from the layer's test-file convention (CONTRACTS §11).

**Optional surface tier** — ONLY if `§Application under test` declares distinct surfaces (e.g. `web`,
`admin`, `portal`, `mobile`): insert the surface segment →
`<qa-root>/cases/<type>/<surface>/<module>/…`. If the profile declares no surfaces, there is no surface segment —
do not invent one.

## Type→TYPE map (fixed)
| type | TYPE | case ext | script ext |
|---|---|---|---|
| api | API | .md | .spec.ts |
| integration | INT | .md | .spec.ts |
| e2e | E2E | .md | .spec.ts |
| security | SEC | .md | .conf + .spec.ts |
| performance | PERF | .md | .js |
| unit | UNIT | .md | .test.ts / .cs / .py / .java / .kt (per §Unit testing layer) |
| accessibility | A11Y | .md | .spec.ts (Playwright + axe; `@manual` cases have no script) |
| mobile | MOB | .md | .spec.ts (WDIO + Appium — the STAGED mirror; the framework-repo Target path is derived by `generating-mobile-script` from §Mobile testing's convention + the suite tag, CONTRACTS §15) |

## Resolution ladder — derive first, ask LAST
1. **Explicit input** — a module passed by the caller/command, or named in the request ("the orders API").
2. **The plan/analysis** — `<qa-root>/plans/<slug>/…-test-plan.md` and `<qa-root>/analysis/<slug>/…-analysis.md`: the
   requirement's module/area, the endpoint's resource group, the touched feature area. This is the primary signal.
3. **Sibling artifacts** — glob `<qa-root>/cases/**` for existing cases of the same feature/slug (via
   `**Feature:** <slug>` grep) or the same module; where siblings live is strong evidence.
4. **`§Application under test`** — endpoint path prefixes (`/orders/*` → `orders`), UI area names, or a
   declared module list.
5. **Verify** — the candidate `<type>/<module>` (and `<surface>` if surfaces exist) must be consistent
   across ≥2 signals AND, when surfaces are declared, the surface must be one the profile lists.
6. **Only if still underivable → ASK the user, with evidence** — present the researched candidate as the
   recommended option ("Endpoints for this slug are all under `/orders/*` and a sibling case sits in
   `<qa-root>/cases/api/orders/` — confirm module `orders`?"), never an open-ended "which module?".

## HARD STOP rules
- **Never guess a path.** If steps 1–5 don't converge, STOP and ask (step 6).
- **Never invent a module or surface.** A surface segment appears only when `§Application under test`
  declares surfaces; a module must trace to a signal, not a hunch.
- **Never write a legacy flat path** (`<qa-root>/cases/<slug>.md`, `<qa-root>/cases/<module>/…` without a `<type>`).
- **Type must be enabled** in `§Test types`; a disabled type → STOP and report (nothing to place).
- **Unit module = the plan's BUSINESS module**, never the code namespace/folder — `<qa-root>/cases/unit/billing/`
  even when the subject lives in `src/Domain/Pricing/`; the code location is cited in `## Subject`.
- **Mobile module = the plan's BUSINESS module too**, never the screen class or the framework suite
  folder (`smoke`/`regression`) — the suite is a tag, the module is the placement.

## Case-id allocation — next free NNN, collisions caught at merge (CONTRACTS §1)
- `NNN` = 1 + the highest NNN of ANY file `TC-<TYPE>-<MODULE>-*.md` in `caseDir`, whatever its
  `**Feature:**` — a module folder is shared by every slug that touches the module. Never reuse a
  gap, never take an id that appears in a traceability table or the impact map without a file.
- There is no id ledger to claim from (a shared ledger file is itself a merge conflict). Two
  branches can still mint the same id; `qa:lint` errors on the duplicate after the merge, and the
  second branch to merge runs `node scripts/shared/renumber-case.mjs <its case file>` — the case
  with `@tms:` or run history keeps its id.
- Return the computed id as `nextCaseId`; the calling skill re-checks it immediately before writing.

## Output contract
Return (do not write files — the calling skill writes):
```
type:            <type>
surface:         <surface | —>          # — when the profile declares no surfaces
module:          <module>
caseDir:         <qa-root>/cases/<type>/[<surface>/]<module>/
scriptDir:       <qa-root>/scripts/<type>/[<surface>/]<module>/
caseIdPrefix:    TC-<TYPE>-<MODULE>-
nextCaseId:      TC-<TYPE>-<MODULE>-<NNN>  # next free in caseDir, all slugs counted
scriptExt:       <.spec.ts | .js | .conf+.spec.ts | .test.ts|.cs|.py|.java|.kt (unit, per layer)>
derivedFrom:     <which signals agreed>  # or "asked user"
```

## Done — ALL must be true
- [ ] Type is enabled in `§Test types`; TYPE token and script extension resolved from the fixed map.
- [ ] Module derived from ≥2 signals (or confirmed by the user with evidence); never invented.
- [ ] Surface segment present ONLY when the profile declares surfaces, and is one the profile lists.
- [ ] `caseDir`/`scriptDir` mirror each other 1:1; no legacy/flat/guessed path emitted.
- [ ] Underivable placement → asked the user with a recommended, evidence-backed candidate — never guessed.
