# Unit-test smell catalogue — detection heuristics, severity, prescribed action

Used by `reviewing-unit-tests` Step 2 (audit of existing suites) and mirrored by the static gate in
`generating-unit-script` (so generated tests never introduce these). Each entry: **what it looks
like**, **how to detect it** (language-agnostic first, then per-framework tokens), **why it hides
bugs**, **default severity** (raised to High on P0/P1 symbols), **prescribed action** — phrased for
the developer or for `designing-unit-cases`, never as an edit this skill makes.

## A. Assertions that prove nothing

### NO-ASSERT
- Looks like: a test that calls the subject and ends; or asserts only that the SUT/result is not null.
- Detect: test body without `Assert.`/`expect(`/`assert `/`assertThat(`; or the only assertion is
  `NotNull`/`toBeDefined`/`is not None` on the return of a value-producing method.
- Hides: every wrong value. The test is a smoke check that the code does not crash.
- Severity: High. Action: state the expected value from the spec/BR (designer row) or delete the test.

### TAUTOLOGY
- Looks like: `expected = sut.Calc(x); Assert.Equal(expected, sut.Calc(x))`; `expect(result).toBe(result)`;
  asserting the exact value a mock was told to return; re-implementing the formula in the test.
- Detect: expected derived from the actual or from the same function; expected built with the
  same arithmetic as the subject; assertion against a mock's setup value.
- Hides: any change to the formula — both sides move together.
- Severity: High. Action: literal expected values from the case's `Then`, sourced from spec/BR.

### ASSERTION-ROULETTE
- Looks like: 8 asserts on unrelated properties, no message/row marker; one fails, nobody knows which behaviour broke.
- Detect: > 3 assertions covering different behaviours in one test without `// Row N` or messages.
- Severity: Medium (High if it masks a NO-ASSERT on the important property). Action: split per behaviour; table-driven rows.

### EXCEPTION-SWALLOW
- Looks like: `try { sut.Do(); } catch { }`; `assertDoesNotThrow(...)` alone; `pytest.raises(Exception)` (too broad).
- Detect: empty catch; broad exception type; no assertion on type/message/field.
- Hides: the wrong exception, the wrong message, a partial write before the throw.
- Severity: High on validation logic. Action: assert type + message/code + no partial mutation.

### IGNORED-RESULT
- Looks like: the subject's return value or the fake's recorded state is never inspected.
- Detect: call expression as a statement with no capture and no later assertion on state.
- Severity: Medium. Action: assert the return/state named in the Then.

## B. Missing input space

### HAPPY-ONLY
- Looks like: one or two passing-path tests for a method that validates, throws, or branches.
- Detect: subject has `throw`/`Result.Fail`/validation attributes/`if` on inputs; tests contain no negative/invalid row.
- Severity: High on validators/money/state. Action: designer adds invalid partitions + exception rows.

### BOUNDARY-BLIND
- Looks like: subject has `>= 30`, `MaxLength(50)`, `count > 0`; tests use `10`, `100`, `"abc"` — nothing at `29/30/31`.
- Detect: for each relational operator/constant in the subject, search tests for the boundary values; none → hit.
- Hides: the off-by-one — the single most common logic defect.
- Severity: High. Action: boundary triple rows (`T−1`, `T`, `T+1`) — list the exact values.

### UNGUARDED (mutation-insensitive)
- Looks like: a test suite that passes under an obvious mutant (`+`→`−` when operands are equal; `>=`→`>` with no test at `T`).
- Detect: Step 3 spot check — no killing test for a token.
- Severity: High. Action: the specific killing row.

### STATE-MACHINE-HOLES
- Looks like: tests for `approve` from `draft` only; no test that `approve` from `paid`/`cancelled` is rejected.
- Detect: an enum/state field with N states, M transitions; tests cover < N×M cells (allowed + forbidden).
- Severity: High on core entities. Action: full transition matrix case.

### NULL-BLIND
- Looks like: reference/optional parameters never passed as null/empty/missing.
- Detect: subject dereferences a parameter/field; no test passes null/empty for it.
- Severity: Medium (High if it reaches production input). Action: null/empty rows with the contract's Then.

### DATE-TZ-BLIND
- Looks like: date maths tested with `2026-06-15` only; no month-end, leap day, DST, midnight UTC, offset input.
- Severity: High on scheduling/billing. Action: calendar-edge rows.

## C. Non-determinism and hidden dependencies

### NON-DETERMINISTIC
- Looks like: `DateTime.Now`, `new Date()`, `Random`, `Guid.NewGuid()`, `uuid4()`, `Instant.now()` in the test or reached by the subject; asserting on wall time; `Thread.Sleep`/`setTimeout`/`time.sleep`; retries.
- Detect: the token list in `generating-unit-script/references/framework-templates.md` (static-gate list) inside test bodies or in the subject without a seam.
- Hides: itself — the test flakes, gets retried, and eventually ignored.
- Severity: High. Action: inject clock/id generator (seam request to devs — `UNTESTABLE` row) or stub it in the test.

### MYSTERY-GUEST
- Looks like: reads `appsettings.json`, a `.csv` fixture from disk, env vars, a shared global, a real DB/container, `localhost` HTTP.
- Detect: `File.`/`fs.`/`open(`/`Files.`, `Environment.`/`process.env`/`os.environ`, `HttpClient`/`fetch`/`requests`, Testcontainers/`DbContext` with a real provider, in a *unit* test dir.
- Severity: High (it is not a unit test; it is a slow, order-dependent integration test misfiled). Action: route to `integration`, or fake the port.

### SHARED-MUTABLE-STATE
- Looks like: static fields mutated by tests; class-level fixtures reused across tests and mutated; test order matters.
- Detect: `static` mutable fields in test classes; `beforeAll` building objects later mutated; `[Collection]`/`--runInBand` used to hide order dependence.
- Severity: Medium (High when it causes flakes). Action: per-test Arrange; immutable fixtures.

### SLOW-UNIT
- Looks like: a "unit" project taking minutes; waits; container startup.
- Detect: timing in the run log (`/qa-run` summary) per test > 1s; sleep tokens.
- Severity: Medium. Action: remove waits; misfiled integration tests → `integration`.

## D. Testing the wrong thing

### OVER-MOCKING
- Looks like: every collaborator mocked including pure helpers and value objects; `Verify` on call order; mocking the subject's own virtual methods (partial mocks); tests break on every refactor while behaviour is unchanged.
- Detect: mock count ≥ 4 in one test; `Mock<Subject>`/`spyOn(sut, ...)`/`patch.object(sut, ...)`; assertions only on `Verify`/`toHaveBeenCalledWith` for non-contract interactions.
- Hides: real integration between the subject and its cheap collaborators; wrong wiring; the actual computed value.
- Severity: Medium (High when the "assert" is only a verify on an internal call). Action: state-based assertions; fake ports only; call real pure collaborators.

### IMPLEMENTATION-COUPLED
- Looks like: asserting private state via reflection; asserting the number of times an internal helper ran; snapshot tests of object graphs for logic.
- Severity: Medium. Action: assert observable outputs; snapshots only for serialisation contracts.

### FRAMEWORK-TESTING
- Looks like: tests proving the DI container resolves, the ORM maps, `Enum.Parse` works, getters return what setters set.
- Severity: Low (noise; dilutes coverage numbers). Action: delete; spend the time on BOUNDARY-BLIND symbols.

### EAGER
- Looks like: one test creates, updates, approves, and deletes — three Acts, one name.
- Detect: ≥ 2 Acts on the subject with assertions in between.
- Severity: Medium. Action: one behaviour per test; table rows.

## E. Hygiene that hides rot

### SKIPPED-LEFTOVER
- Looks like: `[Fact(Skip = "...")]`, `it.skip`, `xit`, `@Disabled`, `@pytest.mark.skip` without a ticket; `it.only`/`fit`/`[Fact]` filtered out in CI config; commented-out test bodies.
- Detect: tokens above; comment blocks containing `Assert`/`expect(`.
- Severity: High when the skipped test covers a P0/P1 symbol (coverage looks fine, behaviour is untested). Action: un-skip with a fix, or delete with the reason recorded.

### CONDITIONAL-LOGIC
- Looks like: `if (env == "CI")`, `for` loops computing expectations, `try/catch` around the Act deciding which assert to run.
- Severity: Medium (High if a branch can pass with no assertion). Action: table-driven rows; literal expectations.

### MAGIC-VALUES
- Looks like: `Calc(order, 0.2m, 3, true)` — which is VAT, which is the grace period, what is `true`?
- Severity: Low. Action: named constants/builders next to the `// Row N` marker.

### DUPLICATE-SETUP
- Looks like: the same 15-line Arrange pasted into 20 tests; drift between copies.
- Severity: Low. Action: builder/fixture reuse (the test project's existing ones first).

### MISLEADING-NAME
- Looks like: `Test1`, `ShouldWork`, `Total_Test`; or a name promising a boundary the body does not test.
- Severity: Low (Medium when the name claims coverage that is absent — an audit trap). Action: `Subject_Scenario_Expected`.

### NO-CASE-LINK (bundle-specific)
- Looks like: generated tests without the `TC-UNIT-…` container marker or `// Row N` markers.
- Severity: Medium. Action: regenerate via `/qa-script --type unit` (the static gate enforces it).

## Severity rule of thumb
High = the suite can be green while the P0/P1 behaviour is wrong (NO-ASSERT, TAUTOLOGY,
BOUNDARY-BLIND, UNGUARDED, HAPPY-ONLY on validators, NON-DETERMINISTIC, MYSTERY-GUEST, SKIPPED
on P0/P1). Medium = a real defect would be caught late or located slowly. Low = cost, not risk.
