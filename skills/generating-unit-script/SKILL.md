---
name: generating-unit-script
description: Use for /qa-script --type unit: one TC-UNIT case into a test in the repo’s framework, row by row, staged with a HANDOFF row.
version: 1.0.0
---

# Generating Unit Test Scripts

> Profile first, by section (`profile.mjs`) — `§Unit testing` (layer → repo path, framework, test
> dirs, test-file convention, run command, Write mode, doubles policy, hermetic rule, default
> branch), `§Test types` (is `unit` enabled), `§Code knowledge` / `§Source repos`. QA root
> defaults to `<qa-root>/` (profile-overridable).

> **The exception you operate under (CONTRACTS §9.6 / §11):** this is the only skill that may
> write outside `<qa-root>/` — and only under the `§Unit testing` test directories, only in Write mode
> `apply`, only test files. Production source is never edited, renamed, or reformatted. A subject
> that cannot be tested without a production change is a `TESTABILITY-GAP` in HANDOFF, not a refactor.

## Action

Generate ONE test file from ONE `TC-UNIT-*` case, in the framework `§Unit testing` declares for
the subject's layer. Always write the **staged mirror** `<qa-root>/scripts/unit/<module>/<same-TC-basename>.<ext>`
and upsert the case's row in `<qa-root>/scripts/unit/HANDOFF.md`; in `apply` mode also write the file to
its **Target path** in the repo. Then run the offline gate and flip the case's `Scripted` cell.
Invoked by the `unit-test-engineer` agent via `/qa-script --type unit`. Execution belongs to
`/qa-run --type unit` (`executing-tests`) — never run the suite here.

## Input

| What | Where |
|---|---|
| The case | `<qa-root>/cases/unit/<module>/TC-UNIT-<MODULE>-<NNN>-<short-desc>.md` — contract format + `## Subject`, `## Test matrix`, `## Doubles` |
| Case discovery | the plan's `## Traceability (Requirement ↔ Case)` rows with Type `unit` and `Scripted` ❌; fallback grep `**Feature:** <slug>` under `<qa-root>/cases/unit/`. **NEVER glob `<slug>.md` filenames.** |
| Code truth | the subject file at the cited `<layer>:<path>#<symbol> @ <sha>` — re-read at HEAD through `grounding-in-code`; constructor signature, port interfaces, existing test project/conventions (`Glob` the layer's test dir for a sibling test of the same namespace to copy style from) |
| Framework facts | `§Unit testing` row for the layer + [`references/framework-templates.md`](references/framework-templates.md) |
| Existing test file at the Target path | if one exists → **extend** it (append a region/`describe` block), never create a duplicate class |

## Output

- `<qa-root>/scripts/unit/<module>/<same-TC-basename>.<ext>` — the staged mirror (byte-identical to what
  lands in the repo), `<ext>` per CONTRACTS §11 (`.test.ts` · `.cs` · `.py` · `.java`/`.kt`).
- `<qa-root>/scripts/unit/HANDOFF.md` — row upserted by Case ID (columns byte-exact per CONTRACTS §11).
- `apply` mode only: the same content at the **Target path** inside a declared test dir.
- The case's traceability row flipped `Scripted` ❌ → ✅ after the offline gate.

## Grounding rules

| # | Rule |
|---|---|
| 1 | **One matrix row = one test (or one parameterised row).** Every `## Test matrix` row appears as `// Row N:` (or `# Row N:`) — table-driven (`[Theory]/[InlineData]`, `test.each`, `@pytest.mark.parametrize`, `@ParameterizedTest`) when rows share a shape; separate tests when the Then differs in kind (value vs exception vs interaction). Coverage of rows is 100% or a reasoned `// COVERAGE-GAP: Row N — <reason>`. |
| 2 | **Every assertion comes from the row's Then** — the exact value, the exact exception type + message/code, the exact interaction count. Never weaken (`not null` when the Then says `24.00m`), never add an invented expectation. |
| 3 | **AAA, visibly.** Arrange / Act / Assert (or Given/When/Then) separated by blank lines or comments; one Act per test; assertions on one behaviour (multiple asserts allowed only when they describe the same outcome, e.g. status + audit entry of one transition). |
| 4 | **Hermetic** (`§Unit testing` hermetic rule): no network, DB, filesystem, environment variables, wall clock, randomness, sleeps, threads. Time and ids are injected via the ports named in `## Doubles`. A test that needs otherwise is STOPPED and reported as mis-tiered (route to integration) — never faked with I/O. |
| 5 | **Doubles at ports only, as the case says.** Fake/stub/mock exactly the `May fake` list with the per-row values; never the subject, value objects, private members, statics, or the runtime. Prefer hand-written fakes for stateful ports; use the codebase's existing mocking library (Moq/NSubstitute · vi.fn/jest.fn · unittest.mock/pytest-mock · Mockito) — never introduce a new one. |
| 6 | **Assert behaviour, not implementation.** State/return values first; verify interactions only for rows whose Then is an interaction (`Publish called once with …`). No assertions on call order, private state, or "was helper X invoked". |
| 7 | **Determinism and precision.** `decimal`/`BigDecimal`/integer minor units for money (never float equality without an explicit tolerance from the case); dates constructed with explicit offset/zone; no `DateTime.Now`/`Date.now()`/`random` anywhere in the test; no retries. |
| 8 | **No logic in tests.** No `if`/`for`/`try` computing the expected value; no shared mutable fixtures between tests; no `sleep`; no `.skip`/`.only`/`[Fact(Skip)]` left behind. Expected values are literals (or named constants next to the row comment). |
| 9 | **Naming = the row's intent.** `Subject_Scenario_Expected` (C#/Java), `describe(Subject) › it('returns X when Y')` (TS), `test_<subject>_<scenario>_<expected>` (py). The **Case ID appears verbatim** in the container name/trait/tag (CONTRACTS §11) so run output maps back to the traceability row. |
| 10 | **Mutation guards are documented.** The file header lists each `Guards` cell and the row that kills it; if a guard has no killing row in the case, add a `// COVERAGE-GAP: guard <token> unguarded` (and report it to the designer) — never invent a row. |
| 11 | **REUSE > CREATE.** An existing test file for the subject at the Target path → extend it (new `describe`/region titled with the Case ID); existing builders/fixtures/fakes in the test project → use them; new helper files only when none exist, placed in the test project's conventional helpers folder and listed in HANDOFF Notes. |
| 12 | **Never touch production code, never reformat the test project.** No `using`/import reorders in other files, no edits to `.csproj`/`package.json`/`pyproject` beyond what a NEW test project would need — and even that is a HANDOFF Note (`> **Project setup required:**`), not an edit. |
| 13 | **TESTABILITY-GAP handling.** A `## Subject` with a gap (hard-wired clock/random/static/DB): generate the test **against the seam the case suggests** (e.g. a constructor accepting `IClock`) only if that seam already exists at HEAD; otherwise generate a compiling test for the rows that ARE testable, mark the rest `// COVERAGE-GAP: TESTABILITY-GAP — needs <seam>`, and write the seam request in HANDOFF Notes for the developers. |

## Procedure

### 1. Parse the case + gates
Read: Case ID, Feature, Plan, Tags, `## Subject` (citation, layer, testability), `## Test matrix`
(rows), `## Doubles`, `## Data`. **Skip gate**: no rows, or a Subject that is `TESTABILITY-GAP:
symbol not found` → STOP for this case, report to `case-designer`/`unit-test-engineer` — no file.
**Layer gate**: the Subject's layer must have a `§Unit testing` row (framework, test dir, convention,
run command); missing → STOP with `> **Project setup required:** §Unit testing row for layer <layer>`.

### 2. Re-ground the subject at HEAD
Through `grounding-in-code`: open the cited file, confirm the symbol and its signature at HEAD,
record `git -C <repo> rev-parse --short HEAD`. Signature drift vs the case (renamed parameter, new
required dependency) → generate against HEAD and note `case cites @<old-sha>; generated @<new-sha>`
in the header + HANDOFF Notes; semantic drift that invalidates a row's Then → `COVERAGE-GAP` +
report (the designer re-verifies; you never rewrite a Then).

### 3. Resolve the Target path and reuse targets
- **Target path** = `§Unit testing` test dir + that layer's **test-file convention** applied to the
  subject's path (`src/Billing/PriceCalculator.cs` → `tests/Billing/PriceCalculatorTests.cs`;
  `src/billing/price.ts` → `src/billing/price.test.ts`). Convention undeclared → STOP (setup callout).
- `Glob` the target dir: existing test file for this subject → extend mode; existing fakes/builders
  → reuse; sibling test → copy its import/namespace/style conventions verbatim.
- Existing test *project* missing entirely (no `.csproj` test project, no vitest config) →
  generate anyway, `Scripted` stays ❌, HANDOFF Notes carry `> **Project setup required:** <what>`.

### 4. Emit the file — from the framework template
Pick the template in [`references/framework-templates.md`](references/framework-templates.md) for
the layer's framework (xUnit · NUnit · Vitest/Jest · pytest · JUnit 5). Non-negotiables regardless
of template:

```
<header comment>
  Case: TC-UNIT-<MODULE>-<NNN> — <case H1 title, verbatim>   Feature: <slug>   Plan: <plan path>
  Subject: <layer>:<path>#<symbol> @ <sha>          Generated @ <sha> by generating-unit-script (@agentic:gen)
  Guards: Row 1 → `*` in line net · Row 2 → rounding mode · Row 4 → `> 100` … (from the matrix)
  Doubles: IClock (stub) · IRateTable (stub) — never PriceCalculator/Money
<container named with the Case ID + subject>            e.g. [Trait("Case","TC-UNIT-BILLING-001")] / describe('TC-UNIT-BILLING-001 — PriceCalculator.Total')
  // Row 1: <Given → Then>   → one test / one parameter row
  ...
  // COVERAGE-GAP: Row N — <reason>                     (only when unavoidable)
```

- Table-driven rows share ONE test body; rows with a different kind of Then (throws / interaction /
  property) get their own test. Property rows → the framework's property library if the test
  project already has one (FsCheck / fast-check / Hypothesis / jqwik), else a small fixed sample set
  with the law asserted per sample — and say so in a comment.
- Money: `decimal`/`BigDecimal`/integers; JS: integer minor units or a decimal lib already in the repo
  — never `toBe(0.3)` on floats without the case's tolerance.
- Exceptions: assert type AND message/code/param name per the row; assert no partial mutation when
  the row says so (re-read the input object after the throw).

### 5. Write the staged mirror + HANDOFF row (+ apply)
1. Write `<qa-root>/scripts/unit/<module>/<same-TC-basename>.<ext>` (create `<qa-root>/scripts/unit/HANDOFF.md`
   from the workspace seed if missing — heading `# Unit-test handoff`, byte-exact columns).
2. Upsert the row by Case ID:
   `| TC-UNIT-… | <qa-root>/scripts/unit/<module>/<file> | <repo-relative target path> | propose|apply | proposed | — | <notes> |`
   Notes carry: `TESTABILITY-GAP: <seam>` · `extends existing <file>` · `> Project setup required: …`
   · `generated @<sha>`. Re-generation of an already `applied`/`merged` case → new staged content,
   Status `superseded` on the old meaning: set Status back to `proposed` and note `supersedes <date>`.
3. **Write mode `apply`** (from `§Unit testing`): write the identical content to the Target path
   (create parent folders inside the declared test dir only); Status → `applied`, `Applied` → today.
   Any Target path that resolves outside a declared test dir → STOP, do not write, report.
   **`propose`**: write nothing in the repo; the HANDOFF row is the developer's instruction.

### 6. Offline gate — static always, compile when possible
**Static gate (both modes, all frameworks)** — every check must pass or the file is fixed:
1. Case ID present in the container name/trait; `// Row N:` count == matrix rows (or reasoned gaps).
2. Every test has ≥1 assertion; no tautologies (`Assert.True(true)`, `expect(x).toBe(x)`), no
   assertion-free "does not throw" unless the row's Then is exactly that.
3. No forbidden tokens: `DateTime.Now|UtcNow`, `Date.now()`, `new Date()` without args, `Random`,
   `Math.random`, `Guid.NewGuid` in the test body (allowed only inside a fake), `Thread.Sleep`,
   `setTimeout`, `time.sleep`, `HttpClient`, `fetch(`, `File.`, `fs.`, `open(`, `Environment.`,
   `process.env`, `os.environ`, `.skip`, `.only`, `Skip =`, `@Disabled`, `xit(`, `fit(`.
4. No `if`/`for`/`while`/`try` in test bodies (table-driven constructs excepted).
5. Doubles ⊆ the case's `May fake` list; the subject's type is never mocked.
6. Imports resolve to files that exist at HEAD (`Glob`/`Grep` the repo — no invented namespaces).
7. Header lists every `Guards` cell.

**Compile gate (`apply` mode, and `propose` mode when the framework compiles a single file
without side effects on the repo):** run the layer's *compile-only* command from `§Unit testing`
(or the template's default: `dotnet build <test project> --no-restore` · `npx tsc --noEmit -p
<test tsconfig>` · `python -m pytest --collect-only <file>` · `mvn -q test-compile`). Exit 0
required. Never run the tests. In `propose` mode when compiling would require the file to be in the
repo → record `compile: not evaluable (propose mode)` in HANDOFF Notes; the static gate alone
decides.

A file failing the static gate never flips `Scripted`. A file failing only the compile gate in
`apply` mode → fix or revert the apply (delete what you wrote, Status back to `proposed`), report.

### 7. Traceability write-back + report
After the gate is clean: open the plan from the case's `**Plan:**` line, flip this Case ID's
`Scripted` ❌ → ✅. Leave `Last run`/`Status`/`Report` to `executing-tests`. Report per case: staged
path, Target path, write mode + HANDOFF status, framework/template, rows ↔ tests (n/n), gaps
(COVERAGE-GAP / TESTABILITY-GAP), reused vs created, gate results (static · compile), setup callouts.

## Done — ALL must be true
- [ ] Case located via traceability / `**Feature:**` grep; skip + layer gates applied (no file for an unresolvable subject or unconfigured layer).
- [ ] Subject re-grounded at HEAD; drift recorded in the header and HANDOFF Notes; Thens never rewritten.
- [ ] Staged mirror at `<qa-root>/scripts/unit/<module>/<same-TC-basename>.<ext>`; HANDOFF row upserted with the derived Target path and the correct Write mode/Status.
- [ ] `apply` mode wrote ONLY inside a declared test dir (or refused); `propose` mode wrote nothing in the repo.
- [ ] Every matrix row is a `// Row N` test/parameter (or reasoned gap); every assertion equals the row's Then; Case ID in the container name.
- [ ] Hermetic and deterministic: no forbidden tokens; doubles only at the case's ports; no logic in tests; money/dates exact.
- [ ] Guards listed in the header; unguarded tokens reported as gaps, never invented rows.
- [ ] Existing test file extended, never duplicated; no production code or project-file edits.
- [ ] Static gate clean (+ compile gate where evaluable); `Scripted` flipped only then; report delivered.
