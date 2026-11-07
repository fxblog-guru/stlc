# Test-design techniques — the shared reference for every designing-* skill

Read once per session. Every `designing-*` skill uses this file; `designing-unit-cases` uses all of
it (matrix rows, mutation guards, doubles), the other types use §0, §1–§5, §3b and §12. Each
technique says **what it finds**, **how to derive rows**, and **what it kills**. Every case names
the techniques it used in `## Technique` (CONTRACTS §7 vocabulary: `EP | BVA | decision-table |
state-transition | pairwise | error-guessing | use-case | checklist`), and each technique line may
name the coverage axes it bought (`→ positive, negative, boundary, authz, error-contract, journey`)
— `npm run qa:score` counts those axes per REQ and fails a P0/P1 REQ with no negative coverage
(and, for api, no authz or error-contract coverage). Unit rows keep their own finer `Technique`
cell in `## Test matrix`.

## 0. Vocabulary

| Term | Meaning here |
|---|---|
| **Subject** | the symbol under test, cited `<layer>:<path>#<symbol> @ <sha>` |
| **Partition** | a set of inputs the subject should treat identically |
| **Boundary** | the value where behaviour changes; tested as a **triple** (`b−1`, `b`, `b+1`) or the four-point form (`min−1`, `min`, `max`, `max+1`) |
| **Mutant** | a single small change to the subject (`>=`→`>`, `+`→`−`, `30`→`31`, dropped `!`, swapped branch, constant return). A row **kills** a mutant when its expected value differs under that mutant |
| **Guard** | the `Guards` cell: which token(s) of the subject this row protects |
| **Port** | an abstraction the subject depends on (clock, repository, HTTP, bus, config) that a test may fake |

## 1. Equivalence partitioning — find the classes, then test one of each

**Finds:** wrong branch taken; a class of inputs silently treated like its neighbour.

**Derive:** for every input parameter and every piece of state the subject reads, list valid and
invalid classes. Classes come from the spec (roles, statuses, plans), the type (null / empty /
non-empty; zero / positive / negative), and the code's own branches (read the `if`s — each
condition boundary splits a class, and a class the spec does not mention is a `CON-###` for the PM).

**Rows:** ≥1 per valid class (the "happy" rows — plural), ≥1 per invalid class. Never merge classes
into one "typical" row: `role = admin` and `role = finance` are two rows even if today both pass.

**Kills:** swapped/removed branch conditions; a wrong default.

## 2. Boundary value analysis — the operator bugs live here

**Finds:** off-by-one (`>` vs `>=`), inclusive/exclusive range errors, overflow, precision loss,
empty-collection handling, calendar edges.

**Derive per rule** (numeric, length, count, date/time comparison):

| Rule shape | Rows |
|---|---|
| threshold `x ≥ T` / `x > T` | `T−1`, `T`, `T+1` (in the unit of the rule — days, pence, characters) |
| range `[min, max]` | `min−1`, `min`, `max`, `max+1` (+ a nominal mid value in the happy row) |
| count | `0`, `1`, `many` (2 or 3), the configured max, max+1 |
| string length | empty, 1, max, max+1, whitespace-only, unicode where 1 char ≠ 1 byte (`"é"`, emoji) |
| money / decimals | exact `.005` (rounding mode), `.004999`, `−0.01`, largest representable, currency with 0 or 3 minor units (JPY, KWD) when multi-currency |
| dates | month-end (30/31), Feb 28/29 (leap), year boundary, DST spring-forward/fall-back local hours, midnight UTC vs local, epoch/`DateTime.MinValue` |
| time windows | `now == start`, `now == end` (inclusive?), `end < start` |
| pagination/offsets (when in-process) | page 0/1, size 0, size = max, offset past end |

**Kills:** relational-operator mutants, constant mutants (`30`→`31`), rounding-mode changes.
**Rule:** the boundary rows use the *exact* boundary value from the spec/code citation — write the
citation of the constant in `## Data` (`MaxDiscount = 100` at `…#MaxDiscount @ sha`).

## 3. Decision tables — when ≥2 conditions decide the outcome

**Finds:** an unhandled condition combination; the "else" nobody specified; precedence errors
("discount before tax" vs "tax before discount").

**Derive:** list conditions (C1…Cn) and actions/outcomes. Enumerate `2^n` rule columns (or the
domain's legal subset); collapse a column only when the spec proves a condition is indifferent
there — write "indifferent per BR-xxx" in `## Data`. Each surviving column = one row.

```
Conditions          R1   R2   R3   R4
customer.vip        Y    Y    N    N
order.total ≥ 100   Y    N    Y    N
──────────────────────────────────────
discount            15%  10%  5%   0%     ← 4 rows; R2 and R3 kill "precedence" mutants
```

**Kills:** dropped `&&`/`||` terms, swapped precedence, missing default branch.

## 3b. Pairwise (all-pairs) — when the parameters are many and independent

**Finds:** defects triggered by an interaction of two parameter values (browser × locale, role ×
plan × currency) without paying for the full cartesian product.

**Derive:** list the parameters and their equivalence classes (§1 first — pairwise over raw values
is noise). Build an all-pairs array: every value of every parameter appears with every value of
every other parameter at least once. 4 parameters × 3 values = 81 full combinations, 9–10 pairwise
rows. Use a generator (PICT, `allpairspy`) when there are more than ~4 parameters, and keep its
model file next to the case under `## Data`. Add the combinations the spec calls risky as explicit
extra rows — pairwise is a floor, not a ceiling.

**Use it for:** configuration matrices (e2e browser/viewport/locale, mobile device × OS × network),
api query parameters (filter × sort × page), feature-flag sets. **Not for** conditions that depend
on each other — that is a decision table (§3).

**In the case:** one row per pairwise combination in `## Variants` (`Technique` = `pairwise`), never
one step per combination.

## 4. State-transition testing — every arrow, and every missing arrow

**Finds:** forbidden transitions that succeed (draft → paid), transitions that skip side effects
(approved without audit entry), guards evaluated on the wrong side of the boundary.

**Derive:** from the BR/wiki state diagram or the code's enum + switch: build the matrix
`from-state × event`. Every **allowed** cell = a row asserting the new state **and** the side
effects the spec names (audit, timestamp, published event). Every **forbidden** cell = a row asserting
the documented rejection (exception type/code) **and** that state did not change. Guarded transitions
(`approve` only when `total > 0`) get a boundary triple on the guard.

Legal-subset note: N states × M events is often 20–40 cells; keep them in ONE case per state machine
(split by event group only when > ~15 rows), because the value is the completeness of the grid.

**Kills:** missing `case` labels, `default` that silently succeeds, guard operator mutants.

## 5. Exception & error-contract testing — the failure path is a contract too

**Finds:** wrong exception type (a `NullReferenceException` where a `ValidationException` was
promised), unhelpful messages, partial writes before the throw, swallowed errors.

**Derive:** every documented failure of the subject (spec: "rejects…", "must not…"; code: `throw`,
`Result.Fail`, error codes). One row each asserting: type/code **and** the message or field name
the caller relies on **and** *no partial mutation* (inputs/state identical after the throw) **and**,
where relevant, that a port was **not** called (no email sent for a rejected order).

**Kills:** removed guard clauses, wrong exception type, reordered validation.

## 6. Null / empty / absent — per reference-typed input

**Finds:** the production `NullReferenceException` / `TypeError: cannot read property`.

**Derive:** for every reference/optional parameter and every optional field the subject dereferences:
`null`/`undefined`, empty collection, empty string, object with missing optional field, collection
containing a `null` element. The Then is whichever the contract says — a typed argument exception,
a documented default, or a specific result — never "does not crash".

## 7. Properties & invariants — many inputs, one law

**Finds:** bugs that only appear for inputs nobody thought to enumerate; asymmetric
serialize/deserialize; non-idempotent operations that are re-run in production (retries!).

**Derive** the laws the subject must obey; mark the row `Technique: property` so the generator emits
a property-based test (FsCheck / fast-check / Hypothesis / jqwik) or a multi-sample loop:

| Law | Example |
|---|---|
| round-trip | `parse(format(x)) == x` for any valid `x` |
| idempotence | `normalize(normalize(s)) == normalize(s)`; applying a job-status event twice ≡ once |
| commutativity / order-independence | total of lines is the same in any order |
| conservation | sum of allocated amounts == amount allocated (proration, split payments) |
| monotonicity | more quantity never lowers the total (for non-negative prices) |
| bounds | result always within `[0, 100]`; never negative money |
| no-mutation | inputs are unchanged after the call (value semantics) |
| inverse | `decrypt(encrypt(x)) == x`; `undo(apply(op, s)) == s` |
| oracle | the optimised path equals the plain reference implementation for any input |
| associativity / identity | `merge(merge(a, b), c) == merge(a, merge(b, c))`; `add(x, zero) == x` |
| easy-to-verify | the result is cheap to check even when it is expensive to compute (a sort is ordered and a permutation) |

Two ways a property proves nothing: **tautology** — the property restates the
implementation (`total(lines) == sum(l.amount for l in lines)` when that *is* the code), so it can
never fail; and **vacuity** — the generator's filter rejects nearly every input, so the property ran
on a handful of trivial values. A `Technique: property` row names the law and the generator's
domain, and the reviewer checks both.

**Kills:** the mutants that happen to be invisible to enumerated rows — and it documents intent.

## 8. Mutation guards — the last pass, always

After the matrix is drafted, read the subject once more, token by token, and ask for each:
*which row's expected value changes if this token changes?*

| Token in the subject | Typical mutant | Row that kills it |
|---|---|---|
| `>=`, `>`, `<=`, `<`, `==` | flip inclusivity / negate | the boundary triple (`T−1`, `T`, `T+1`) with three *different* expectations |
| arithmetic `+ − * /` | swap operator | a row where operands differ (`2 × 10` kills `+` only if `2 + 10 ≠ 20`… choose `3 × 10`) |
| numeric constant | ±1, 0 | the exact-boundary row |
| `!`, `&&`, `||` | drop/negate | the decision-table columns that differ only in that condition |
| `return x` | `return null` / constant | any row asserting a computed value, not just non-null |
| loop bound | off-by-one | the `1` and `many` rows with per-element expectations |
| branch bodies | swapped | rows whose expectations differ between the branches |
| side-effect call | removed | the interaction row (`Publish called once with …`) |

If a token has **no** killing row, add one. The `Guards` cell records the mapping; the generator
copies it into the test's header comment; `/qa-unit-audit` checks existing suites for the same.

## 9. Doubles — what may be faked, and how to say it in the matrix

| Kind | Use when | Say in `## Doubles` |
|---|---|---|
| **Fake** (hand-written, stateful) | repository/port with simple state (`InMemoryRateRepository`) | the fake and the state it holds per row |
| **Stub** (canned answers) | clock, config, feature flags, rate tables | the exact value per row (`IClock → 2026-02-29T00:00Z` for the leap row) |
| **Mock** (verify interaction) | the interaction IS the contract (exactly one event published; no email on rejection) | the call, its arguments, and the count |
| **Spy** | you need the real behaviour plus a record of calls | rarely; justify |

Never: fake the subject, private methods, value objects, the runtime (`Date`, `Math`), or a
collaborator that is itself pure and cheap (call it — the test then covers the seam for free).
Over-mocking (every collaborator mocked, assertions on internal call order) is a `/qa-unit-audit`
smell — design against state whenever the state is observable.

## 10. Priority calibration (with the Step 1 scores)

| Band | What lands here |
|---|---|
| **P0** | money/tax/rounding, entitlement & permission predicates, state machines on core entities, anything a `High` analysis risk points at |
| **P1** | validators on user input that reach the DB, date/scheduling maths, mappers between bounded contexts |
| **P2** | formatting/parsing for display, sorting/comparators, retry/backoff policy tables |
| **P3** | rare partitions of low-consequence subjects; property rows added for documentation |

## 11. Worked example — "invoice becomes overdue 30 days after issue" (BR-012)

Subject: `backend:src/Invoicing/OverduePolicy.cs#IsOverdue @ 3e4f5a6` — `issuedAt`, `now`, `graceDays = 30`.

| Row | Given | When | Then | Technique | Guards |
|---|---|---|---|---|---|
| 1 | issued 2026-01-01, now 2026-01-30 (29d) | IsOverdue | false | boundary T−1 | `>= 30` |
| 2 | issued 2026-01-01, now 2026-01-31 (30d) | IsOverdue | true | boundary T | `>=` vs `>` |
| 3 | issued 2026-01-01, now 2026-02-01 (31d) | IsOverdue | true | boundary T+1 | constant 30 |
| 4 | issued 2026-01-31 23:30 local, now 2026-03-02 00:10 local (DST week) | IsOverdue | true — computed in UTC dates | boundary (DST) | date vs datetime maths |
| 5 | issued 2024-01-31, now 2024-02-29 (leap, 29d) | IsOverdue | false | boundary (leap) | day arithmetic |
| 6 | status = Paid, 60d old | IsOverdue | false | decision table (paid ⇒ never overdue) | `&& status != Paid` |
| 7 | issuedAt = default/null | IsOverdue | throws ArgumentException("issuedAt") | invalid partition | null guard |
| 8 | now < issuedAt (clock skew) | IsOverdue | false | invalid partition / property (never negative age) | `Max(0, …)` |

Doubles: `IClock` stub per row; nothing else. Eight rows, every operator and constant guarded, DST
and leap covered, the paid short-circuit proven. That is what "unit-tested" means in this bundle.

## 12. Per-type use, error guessing, use cases and checklists

Three techniques in the §7 vocabulary have no unit-matrix section above:

| Technique | What it is | Derive from |
|---|---|---|
| `error-guessing` | inputs and situations experience says break things: empty, null, duplicate submit, expired session, wrong tenant, clock skew, retries, unicode, very long input | the analysis risks, `ESCAPES.md`, the endpoint-class heuristics (`designing-api-cases/references/api-test-heuristics.md`), `designing-mobile-cases/references/mobile-heuristics.md` |
| `use-case` | a user goal walked end to end through its main and alternate flows | the stories / acceptance criteria; one case per flow, alternates as `## Variants` rows when they share the intent |
| `checklist` | a published list applied item by item | WCAG 2.2 AA (`designing-accessibility-cases/references/wcag22-checklist.md`), OWASP Top 10, the perf workload rubric |

**Which techniques each type normally names** (a starting point, not a quota — the case names what
it actually did):

| Type | Typical `## Technique` lines | Axes `qa:score` expects for a P0/P1 REQ |
|---|---|---|
| api | `EP → positive` · `BVA → boundary, negative` · `error-guessing → negative, authz, error-contract` · `state-transition` for status fields | negative · authz · error-contract |
| integration | `EP → positive` · `error-guessing → negative` (the negative twin: a rejected request leaves no row) | negative |
| e2e | `use-case → journey, positive` · `error-guessing → negative` · `pairwise` for browser/locale matrices | negative · journey |
| security | `decision-table → authz, negative` (role × resource × action) · `checklist` (OWASP) · `error-guessing` | negative (the type supplies authz) |
| performance | `checklist` (workload rubric) | — (thresholds, not axes) |
| accessibility | `checklist` (WCAG) | — |
| unit | `EP` · `BVA` · `decision-table` · `state-transition` (each also a matrix-row Technique) | negative |
| mobile | `use-case → journey` · `error-guessing → negative` (device reality) · `pairwise` for device × condition | negative |

**One intent per case.** A case proves ONE behaviour (`## Objective`, one sentence). More inputs for
the same behaviour are `## Variants` rows (`| Row | Technique | Input | Expected |`), not extra steps
and not extra cases. A different behaviour (a different expected rule) is a different case.
