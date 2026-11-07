# Adding a test type

What a new type needs, in the order to build it, and what proves each piece. Written while adding
`data` (2.4.0), the tenth type. Before that, a type was edited by hand into nine copies of the type
list, and nothing failed when one was missed.

## 0. Decide whether it is a type

A type is a different **kind of proof** with its own case sections, its own agent, and a runner.
A different platform (web, android, …) is not a type (CONTRACTS §20). A different tool for an
existing proof is a *Tool* column swap, not a type. A new type also costs listing budget (§3 below),
which is shared by every skill.

## 1. The checklist

| # | Piece | Where | Proved by |
|---|---|---|---|
| 1 | **Registry entry**: stem, agent, §7 sections, quarantinable, functional | `workspace/qa/scripts/shared/lib/types.mjs` | every script imports it; `bundle.test.mjs` "type registry" fails on any copy that differs |
| 2 | **Contract**: stem in §1, sections in §7, paths in §2, its own section if it hands off (§11 shape), §9.6 exception if it runs in another repo | `CONTRACTS.md` | `bundle.test.mjs` reads the §1 stem list |
| 3 | **Profile**: a `§Test types` row (new types ship `no`), and a `## <Type> testing` section with readiness inputs | `PROJECT-PROFILE.md` | sizing lint: an enabled type must be sized or skipped |
| 4 | **Agent** (or a row in an existing agent) + its model class | `agents/<type>-…md`, `tests/sizing.test.mjs` `MODELS` | the agent test refuses an unclassified agent |
| 5 | **Designing skill** + a heuristics reference (the expertise, lazy-loaded) | `skills/designing-<type>-cases/` | `bundle.test.mjs` size and description budgets |
| 6 | **Generating skill** | `skills/generating-<type>-script/` | same |
| 7 | **Case template** | `workspace/qa/_templates/case-<type>.md` | the template list in `bundle.test.mjs` |
| 8 | **Type lint rules** beyond sections, in their own module | `workspace/qa/scripts/shared/lib/<type>-case.mjs`, called from `lint-qa.mjs` | one `selfcheck.sh` mutant **per rule** that must go red |
| 9 | **Runner wrapper** + `test:<type>` script; verdict from result files; silence is red | `workspace/qa/scripts/<type>/`, `package.json` | a test that drives each verdict path (pass, fail, no file, zero tests, skipped) |
| 10 | **Handoff** (types that run in another repo) | `scripts/<type>/HANDOFF.md`, `checkHandoff(...)` in `lint-qa.mjs` | a selfcheck mutant deleting a row |
| 11 | **Routing rows** | `commands/qa-design.md`, `qa-script.md`, `qa-run.md`, `agents/qa-orchestrator.md` | `sizing.test.mjs` matches every registry type to a routing row |
| 12 | **Tag** `@<type>` | `workspace/qa/docs/tag-taxonomy.md` | lint reads the tag regex from the registry |
| 13 | **Fixture**: one case, one staged script, one handoff row, traceability + AC rows, sizing `types:` | `tests/fixture/qa/` | `selfcheck.sh` "fixture clean"; rebuild `state.json` |
| 14 | **Coverage map row** | `docs/testing-coverage-map.md` | reviewers |
| 15 | **README counts, CHANGELOG, UPGRADE** | root | `bundle.test.mjs` README counts |

## 2. The five pillars, for a type

| Pillar | What the type must have |
|---|---|
| Intelligence | A heuristics reference: the defect classes of that domain, the oracle for each, the fixture row that makes it fail |
| Memory & learning | The agent recalls lessons (`qa:learn -- recall --skill designing-<type>-cases --type <type>`) before designing, and records new ones with the check that guards them |
| Judgment & integrity | Readiness inputs in the profile; a missing one is a `Project setup required` STOP, never a guess |
| Verification & safety | Each lint rule has a selfcheck mutant; the runner treats silence as red; the type's suite is mutation-gated where it can be |
| Value & experience | Runs in CI without production credentials; failures name the row, key or element, not just a count |

## 3. Traps met while adding `data`

- **Listing budget** (8000 characters for every skill and agent description). It was full: 217
  characters were freed by shortening ten descriptions, keeping their triggers. Measure it first:
  the bundle test prints the total.
- **Sizing cap.** `maxTypes` was the literal `9`; the fixture covers every type, so the tenth broke
  it. It now follows the registry (`TYPES.length`).
- **A selfcheck mutant can become a no-op** after the fixture changes. `s/, mobile$//` stopped
  matching when `data` was appended to `types:`. The case went red because it no longer mutated
  anything, not because the rule broke. After touching the fixture, re-read the mutants that edit
  the same lines.
- **CRLF.** The repo checks out with CRLF on Windows. A patch that matches LF text finds nothing;
  normalize on read and write back the same ending.
- **Rebuild the fixture state under the pinned date**:
  `QA_LINT_TODAY=2026-09-15 node workspace/qa/scripts/shared/build-state.mjs --root tests/fixture/qa`.
  Built without it, `state.json` matches the CLI check and fails the test, which pins the date.
- **Counts derived from the fixture move** when a case is added (`total_cases`, `automation-p01`).
  Update them to the new truth and say why in a comment; never loosen the assertion.
- **`$\`` in `String.replace`.** A replacement string containing `` $` `` inserts the text before
  the match. Pass a function (`s.replace(a, () => b)`) when the replacement holds code with template
  literals.
