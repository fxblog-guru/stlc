---
name: reviewing-unit-tests
description: Use to audit existing unit tests read-only: gaps vs BRs and risk, smells, mutation sensitivity → ADEQUATE / GAPS (/qa-unit-audit).
version: 1.0.0
---

# Reviewing Unit Tests (the repo's existing suite)

> Profile first, by section (`profile.mjs`) — `§Unit testing` (layers, repo paths, test dirs,
> frameworks, thresholds, coverage report format), `§Code knowledge` / `§Source repos`,
> `§Domain knowledge` (wiki BRs), `§Quality gates`. QA root defaults to `<qa-root>/`.

## Prime directive — critique with evidence, touch nothing
Every finding cites `path:line` in the repo (or a coverage-report cell) and prescribes an action.
This skill edits NO test, NO production file, NO case, NO plan row — it reads. Coverage numbers come
from an existing report (the latest `<qa-root>/runs/unit/<slug>/<run-id>/coverage-summary.md` and the raw
report copied into that run folder); this skill never runs the suite or the coverage command —
that is `/qa-run --type unit`. No report → the coverage section is `not evaluable` and says so.

## Action
Produce `<qa-root>/reviews/<slug>/YYYY-MM-DD-unit-review.md`: a coverage-gap table (BR/risk → symbol →
tests found → verdict), a severity-ranked smell findings table, mutation-sensitivity spot checks,
and a verdict `UNIT COVERAGE: ADEQUATE | GAPS` with the subject list to hand to
`designing-unit-cases`. Invoked by `unit-test-engineer` via `/qa-unit-audit <slug|module>`.

## Inputs — resolve before auditing (STOP conditions)
1. **Scope**: `<slug>` (modules from the plan's module list + the impact note's
   `## 2. Modules & code touched` when `/qa-impact` ran) — or a bare `<module>` name. Nothing
   resolvable → STOP and ask with the researched candidate.
2. **`§Unit testing`** filled for ≥1 layer (repo path, test dirs, framework). Missing → STOP with
   `> **Project setup required:** fill PROJECT-PROFILE §Unit testing`.
3. **The repo(s)** at the declared paths, readable. Record `git -C <repo> rev-parse --short HEAD`
   (or ask the agent with Bash; without Bash cite `@ HEAD (sha unavailable)`).
4. Optional: analysis + wiki (BR list for the modules), `<qa-root>/docs/impact-map.md`, the latest
   coverage evidence under `<qa-root>/runs/unit/<slug>/*/`, the latest previous unit review (trend).

## Step 1: Inventory — production symbols vs test files, per module
Through `grounding-in-code` (Code KB → read-only grep) list, for each in-scope module:
- **Logic-bearing symbols**: classes/functions with branching (`if/switch/match`, loops over
  money/dates, throws, state enums), validators, calculators, mappers, policies, handlers.
  Score each with `designing-unit-cases` Step 1 (density × consequence; volatility from `git log`).
- **Test files** in the declared test dirs that reference the symbol (by name/import); count tests
  (`[Fact]/[Theory]`, `it(`/`test(`, `def test_`, `@Test`) per symbol.
- **Coverage per symbol/file** from the run folder's raw report (cobertura `<class filename>`
  line-rate/branch-rate; lcov `SF:`/`LF`/`LH`/`BRF`/`BRH`; jacoco `<sourcefile>` counters;
  istanbul-json per file) — when present.

Output the **coverage-gap table** (columns byte-exact):
`| BR / Risk | Module | Symbol (citation) | Tests found | Line % | Branch % | Gap | Priority |`
- `Gap` ∈ `NONE` (tests + boundaries present) · `WEAK` (tests exist, happy-path/boundary-blind —
  cite) · `NO TESTS` · `UNTESTABLE` (hard-wired dependency — name the seam) · `n/a coverage`.
- A symbol behind a P0/P1 REQ or a High analysis risk with `NO TESTS`/`WEAK` = **High** finding.

## Step 2: Smell audit — the catalogue, with detection heuristics
Read every test file touching in-scope symbols (whole file, not grep hits). Apply
[`references/test-smells.md`](references/test-smells.md) — each smell has a detection heuristic,
default severity, and prescribed action. Headline classes:

| Class | One-line detector |
|---|---|
| `NO-ASSERT` | a test body with no assertion call (or only `Assert.NotNull(sut)`) |
| `TAUTOLOGY` | expected computed from the same expression as actual; `expect(x).toBe(x)`; asserting the mock's canned return |
| `ASSERTION-ROULETTE` | many unrelated asserts, no messages/row markers — a failure cannot be located |
| `MYSTERY-GUEST` | reads a file/DB/env/network/global fixture the test does not build |
| `NON-DETERMINISTIC` | `Now`/`Random`/`Guid`/real time; `sleep`; order-dependent tests; shared mutable static |
| `OVER-MOCKING` | mocks the subject, private/internal members, value objects, or verifies call order/internal helpers |
| `EAGER` | one test walks several behaviours; ≥2 Acts |
| `CONDITIONAL-LOGIC` | `if`/`for`/`try` computing expectations or branching assertions |
| `SKIPPED-LEFTOVER` | `.skip`/`.only`/`[Fact(Skip)]`/`@Disabled`/commented-out tests |
| `HAPPY-ONLY` | a subject with validation/throws has only positive rows |
| `BOUNDARY-BLIND` | thresholds in the subject (`>= 30`, `MaxLength(50)`) with no test at `T−1/T/T+1` |
| `EXCEPTION-SWALLOW` | `try { … } catch { }` or `assertDoesNotThrow` with nothing else |
| `MAGIC-VALUES` | unexplained literals where the meaning matters (which discount? which date?) |
| `SLOW-UNIT` | wall-clock waits, real I/O, container startup in a "unit" project |

Each hit → one finding row `| # | Severity | Class | Where (path:line) | Evidence (quoted) | Prescribed action |`.
Severity: High when it hides a defect in a P0/P1 symbol (NO-ASSERT, TAUTOLOGY, BOUNDARY-BLIND,
NON-DETERMINISTIC on money/date logic); Medium for maintainability smells on covered logic; Low otherwise.

## Step 3: Mutation-sensitivity spot checks — the question that matters
For the top 3–5 risk-ranked symbols WITH tests: read the subject and its tests side by side and,
per relational operator / constant / arithmetic token, ask **"which existing test fails if this
token is mutated?"** (the same guard logic as `designing-unit-cases` techniques §8). Record:
`| Symbol | Token (path:line) | Mutant | Killing test (or NONE) |`. Every `NONE` is a **High**
`BOUNDARY-BLIND`/`UNGUARDED` finding with the exact row to add. This is reasoning, not a tool run —
never install or run a mutation framework here (a project may adopt one; that is a setup note).

## Step 4: Hermeticity & structure
Per test project: does anything in the declared *unit* test dirs touch network/DB/filesystem/env
(`MYSTERY-GUEST`/`SLOW-UNIT` at project level), is there a shared clock/random seam, are builders/
fakes reused or copy-pasted (`DUPLICATE-SETUP`), does the project pin a mocking library and an
assertion style. Findings here are Medium/Low unless they cause non-determinism.

## Step 5: Write the review + verdict
`<qa-root>/reviews/<slug>/YYYY-MM-DD-unit-review.md`, sections in order:
1. **Scope & evidence** — modules, repo(s) @ sha, test dirs read, coverage run folder used (or `not evaluable`).
2. **Coverage-gap table** (Step 1).
3. **Findings** (Step 2 + 4) ranked High→Low.
4. **Mutation-sensitivity spot checks** (Step 3).
5. **Subjects for `/qa-design --type unit`** — every `NO TESTS`/`WEAK`/`UNGUARDED` symbol with its
   citation, priority, and the specific rows missing (boundary triple at …, forbidden transition …).
6. **Testability seams for developers** — `UNTESTABLE` symbols with the minimal seam suggestion.
7. **Trend** vs the previous unit review (gaps closed/opened) when one exists.
8. **Verdict**: `UNIT COVERAGE: ADEQUATE` when zero High findings and no `NO TESTS`/`WEAK` on
   P0/P1 symbols; else `UNIT COVERAGE: GAPS`. Coverage % vs `§Unit testing` thresholds stated per
   module, or `not evaluable`.

Then print:
```
✓ Wrote <qa-root>/reviews/<slug>/YYYY-MM-DD-unit-review.md   (repo @ <sha>; coverage: <run-id> | not evaluable)
Verdict: UNIT COVERAGE: {ADEQUATE | GAPS}
Symbols: {n} logic-bearing · NO TESTS {a} · WEAK {b} · UNTESTABLE {c} · NONE {d} | Branch cov: {module: %…}
Findings: {h} High / {m} Medium / {l} Low — top: {one-line worst}
Next: /qa-design <slug> --type unit  ({n} subjects listed in §5) · seams for dev: {n}
```

## Done — ALL must be true
- [ ] Scope resolved to modules/symbols; repo read at a recorded sha; nothing executed, nothing edited.
- [ ] Every logic-bearing symbol in scope appears in the coverage-gap table with a Gap verdict and evidence.
- [ ] Every test file touching in-scope symbols read whole; every smell hit cites `path:line` and quotes the evidence.
- [ ] Mutation-sensitivity checked for the top risk symbols; every unkilled mutant is a finding with the row to add.
- [ ] Coverage numbers only from an existing run folder report; absent → `not evaluable`, never estimated.
- [ ] Verdict follows the High-findings rule; §5 subject list is directly consumable by `designing-unit-cases`.
