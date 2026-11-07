---
name: assessing-test-coverage
description: Use to measure how much of the app the suite covers: REQs, AC, API ops, screens, BRs, risks, per type, with gaps (/qa-coverage).
version: 1.0.0
---

# Assessing Test Coverage

> Profile first, by section (`profile.mjs`) — `§Test types` (which types count), `§Application under
> test` (the OpenAPI spec), `§Quality gates` (targets). QA root defaults to `<qa-root>/`.

## Prime directive — a percentage needs a denominator the application owns
"We have 120 cases" says nothing about coverage. Every number here is **covered / total**, where the
total is something the application exposes: its requirements, its acceptance criteria, its API
operations, its screens, its business rules, its risks. A dimension whose total cannot be read from
a file is **not measurable**, with the file that would make it measurable named. It is never 0 % and
never 100 %. Nothing is re-run, and no number is estimated.

## Action
Produce `<qa-root>/reports/coverage/YYYY-MM-DD-coverage.md` (CONTRACTS §22) and a short reading of it for a
lead.

## Inputs — resolve before measuring (STOP conditions)
1. At least one analysis or plan under `<qa-root>/analysis/*/` or `<qa-root>/plans/*/`; none → STOP: "nothing to
   measure — run /qa-analyze".
2. The OpenAPI spec (`§Application under test`, `OPENAPI_SPEC`, or `<qa-root>/docs/openapi.yaml`). Optional:
   without it the API dimensions are not measurable, and the report says so.
3. `<qa-root>/docs/element-registry.md` pages (`## <Page> (\`<route>\`)`). Optional, the same way, for screens.
4. `<qa-root>/wiki/compiled/` BR pages. Optional, for business rules.

## Step 1: Measure — the script, never by hand
```
npm run qa:coverage                # every feature
npm run qa:coverage -- orders      # one feature
npm run qa:coverage -- --strict    # exit 1 when a requirement or a High risk has no case
```
`scripts/shared/coverage-map.mjs` reads the files and writes the report. Run it and quote its last
lines. Do not recount anything it reports; a number you derive by reading files yourself is the
kind of number this skill exists to replace.

## Step 2: Check the matching before trusting it
API and screen coverage match a case to the surface **by its title** (CONTRACTS §7 Title): the
subject after `[<Module> · <Platform>]` is `METHOD /path`, an `operationId`, or the registry's page
name. Before you read the report out:
- Look at `## Screens` for the line listing titles whose screen the registry does not know. Each is
  either a missing registry page or a title naming the screen differently. Report it; do not
  re-match by hand.
- An operation with no case but a case that clearly tests it means that case's title names no
  operation. That is a title finding for `/qa-review`, not a coverage hit.

## Step 3: Read it — for a lead, in this order
1. **Headline**: the weakest measurable dimension, as `x/y (p %)`, and the count of High gaps.
2. **Per type**: one line for each enabled type with designed cases: cases, automated %, and the
   share of its surface covered (operations for api/integration/security/performance, screens for
   e2e/ui/accessibility, line % for unit).
3. **Not measurable**: each dimension with the one file that would make it measurable.
4. **Top gaps**: at most five High gaps, each with the next command the report gives.

Never average the dimensions into one score. "API 20 %, screens 33 %, requirements 100 %" is the
finding; a single 51 % hides it.

## Step 4: Print
```
✓ Wrote <qa-root>/reports/coverage/YYYY-MM-DD-coverage.md
Weakest: {dimension} {x}/{y} ({p}%) | High gaps: {n}
api {a}% ops · e2e {e}% screens · a11y {x}% screens · unit {u}% lines · automated {s}% (P0/P1 {q}%)
Not measurable: {dimensions, or none}
Next: {the first High gap's command}
```

## Done — ALL must be true
- [ ] The report was written by `npm run qa:coverage`, and its last lines are quoted.
- [ ] Every percentage shown has its covered / total and the file it was measured from.
- [ ] Not-measurable dimensions are listed with the file that would make them measurable.
- [ ] Unmatched case titles are reported, not silently re-matched.
- [ ] No overall score; no case, plan or script edited.
