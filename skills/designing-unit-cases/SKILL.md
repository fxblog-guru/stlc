---
name: designing-unit-cases
description: Use to design TC-UNIT matrices for logic at a commit: partitions, boundaries, states, properties, mutation guards (/qa-design --type unit).
version: 1.0.0
---

# Designing Unit Test Cases

> Profile first, by section (`profile.mjs`) — `§Test types` (is `unit` enabled), `§Unit testing`
> (layers, repo paths, frameworks, test dirs, doubles policy, hermetic rule, thresholds),
> `§Code knowledge` / `§Source repos` (where the code is), `§Quality gates`, `§Domain knowledge`.
> QA root defaults to `<qa-root>/` (profile-overridable).

> **Domain grounding**: when `<qa-root>/wiki/compiled/index.md` exists, resolve every business rule
> (`BR-###`), glossary term, and persona through it — index → scoping link → atomic page read WHOLE,
> cited with its `sources:` entry. Wiki silence is a reported gap, never a guess.
>
> **Code grounding — mandatory here, not optional**: a unit case tests a *symbol*. Every `## Subject`
> is resolved through `grounding-in-code` (Code KB → read-only grep) and cited
> `<layer>:<path>#<symbol> @ <short-sha>`, confirmed at HEAD. A rule you cannot locate in code is
> still designed (from the spec) but its Subject reads `TESTABILITY-GAP: symbol not found — <what
> was searched>`; the generator will hand that to the developers instead of inventing a target.

## Action

Design unit-test cases for one feature slug — **one file per case** under `<qa-root>/cases/unit/<module>/`
— from the analysis's requirements and business rules, grounded to the code that implements them.
This skill designs cases only; `generating-unit-script` turns each case into a test file in the
repo's own framework, staged under `<qa-root>/scripts/unit/` and handed to developers through
`<qa-root>/scripts/unit/HANDOFF.md` (CONTRACTS §11). Execution belongs to `/qa-run --type unit`.

**Why this tier exists in a QA bundle.** Most product defects are born in in-process logic —
a `>=` that should be `>`, a rounding rule applied once instead of per line, a state transition
nobody forbade, a null path nobody walked. API and e2e tiers see those bugs only through the
narrow window of the payloads they happen to send. Unit cases put the whole input space of the
rule on the table, cheaply, before any environment exists.

## Scope fence — what is and is not a unit case

| Unit case (design here) | Not a unit case (route) |
|---|---|
| Pure or near-pure logic: pricing, tax, discounts, rounding, proration, scheduling/date maths, quota and limit checks, validators, parsers/formatters, mappers/serializers, permission predicates, sorting/filtering comparators, state-machine transition rules, retry/backoff policies, id/reference generators | HTTP contract of an endpoint (status/schema/authz) → `designing-api-cases` |
| A class/function whose collaborators are **ports** (clock, repository interface, HTTP client interface, message bus, config) that can be faked | Behaviour that only exists with a real DB/queue/second service → `designing-integration-cases` |
| Domain services and use-case handlers *when* their branching logic is the risk (with ports faked) | Rendering, layout, navigation, client-only interaction → `designing-functional-cases` |
| — | Framework glue with no branches (thin controllers, DTOs, auto-mappers with no rules, DI wiring, migrations) → **no case**, say so in the summary |

Hermetic rule (from `§Unit testing`): a case whose Given needs network, database, filesystem,
environment variables, wall clock, or randomness is mis-tiered — either fake the port or route it.

## Inputs — resolve before designing (STOP conditions)

1. `<slug>` — argument; else the most recently dated folder under `<qa-root>/plans/`; ask if ambiguous.
2. **Analysis**: latest `<qa-root>/analysis/<slug>/YYYY-MM-DD-analysis.md` — REQ register (statement, Module,
   Kind), business rules, risk table. Missing → STOP: run `/qa-analyze` first.
3. **Plan**: latest `<qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md` with the `## Traceability (Requirement ↔ Case)`
   skeleton and the module vocabulary. Missing → STOP: run `/qa-plan` first.
4. **`unit` enabled** in `§Test types` AND `§Unit testing` filled for ≥1 layer (repo path, framework,
   test dirs, run command). Enabled but unconfigured → STOP with
   `> **Project setup required:** fill PROJECT-PROFILE §Unit testing (layer, repo path, framework, test dirs, run command)`.
5. **Optional, strongly preferred:** the latest `<qa-root>/reviews/<slug>/YYYY-MM-DD-unit-review.md`
   (`/qa-unit-audit`) — its coverage-gap table and smell findings are subjects with evidence; the
   latest impact note (`/qa-impact`) — its `## 2. Modules & code touched` citations are candidate
   subjects at a commit.

---

## Step 1: Select subjects — what deserves a unit case (risk, not habit)

Walk every in-scope REQ (and every BR it cites). For each, ask *where does this rule execute?*
and resolve it through `grounding-in-code` to one or more **subjects** (a function, method, class,
or module with branching logic). Score each candidate:

| Signal | 1 | 2 | 3 |
|---|---|---|---|
| **Logic density** | straight-line, ≤1 branch | several branches / a formula | nested conditions, loops over money/dates, a state machine, a parser |
| **Consequence** (from the analysis risk `I`) | cosmetic | degraded workflow | money, data integrity, security, compliance |
| **Volatility** | untouched for months (`git log`) | changed this quarter | changed in this feature / churns every sprint |
| **Existing protection** (from `/qa-unit-audit` when it ran) | well covered, boundary tests present | some tests, happy-path only | no tests, or tests with smells |

`Priority hint = density × consequence` (P0 ≥ 6, P1 = 4–5, P2 = 2–3, P3 = 1); volatility and
protection order the work inside a band. **Design cases for every subject scoring ≥ 4 or cited by
a P0/P1 REQ; list lower-scored subjects in the summary as deliberately deferred** — a silent skip
is the failure mode this tier exists to prevent.

For each subject, run the **testability probe** (read the file at the cited path):
- Inputs and outputs explicit? Return value / thrown exception / mutated state observable?
- Collaborators reachable through ports the `§Unit testing` doubles policy allows?
- Hidden dependencies: `DateTime.Now` / `new Date()` / `Random` / `Guid.NewGuid()` / static
  singletons / `new HttpClient()` / direct `DbContext` / file or env reads inside the subject?
  → the case is still designed; `## Subject` adds `TESTABILITY-GAP: <dependency> is hard-wired —
  seam needed: <inject IClock | pass the value in | extract pure function>`. Never plan a refactor here.

## Step 2: Build the test matrix — techniques, in order, per subject

Full technique detail, examples, and the "kills which mutant" logic live in
[`qa-phase-protocol/references/test-design-techniques.md`](../qa-phase-protocol/references/test-design-techniques.md) (shared by every designing skill) — read it once per
session. The matrix is built in this order so nothing is missed:

1. **Equivalence partitions** — every input (and relevant state) split into valid/invalid classes;
   ≥1 happy row per valid partition, ≥1 row per invalid partition. Distinct partitions are never
   collapsed into one "typical" row.
2. **Boundary triples** — for every numeric/length/date rule: `min−1 · min · max · max+1` (and the
   exact threshold when the rule is a comparison: `29d · 30d · 31d` for "overdue after 30 days").
   Plus the universal edges per type: `0 / 1 / many`, `null / empty / whitespace-only`, max length,
   negative, precision (`0.005` rounding), unicode/emoji length, month-end / leap-day / DST / TZ.
3. **Decision table** — when the rule has ≥2 conditions, enumerate every rule column (conditions ×
   actions), collapse only provably indifferent cells, and give each column a row.
4. **State transitions** — for every status/state field: every *allowed* transition (row) and every
   *forbidden* transition from every state (row expecting the documented rejection). Guards on
   transitions get their own boundary triples.
5. **Exception / error contract** — every documented failure: the exception type or error code,
   the message/field named, and **no partial mutation** (state unchanged after a rejected call).
6. **Invariants & properties** — round-trips (`parse(format(x)) == x`), idempotence (`f(f(x)) == f(x)`),
   order independence, "sum of parts equals total", monotonicity. Mark rows `Technique: property`
   so the generator emits a property-based or multi-sample test where the framework supports it.
7. **Mutation guards** — for each relational operator, constant, and arithmetic step in the subject,
   ensure at least one row whose *expected value changes* if that token is mutated (`>=`→`>`,
   `+`→`−`, `30`→`31`, dropped `!`, swapped branches, `return x`→`return null`). Write the guard in
   the `Guards` column (`>= at 30d`, `rounding half-up at .005`). A matrix with no guards is a
   matrix that passes on the wrong code.

**Every `Then` is concrete**: a value (`total = 150.00m`), a typed exception with its message/code
(`throws ValidationException("lines")`), a state (`status = Approved; audit has 1 entry`), or a
call that must/must not happen (`bus.Publish called once with OrderApproved{orderId}`). "Works",
"handles correctly", "no error" are not expectations. A `Then` that cannot be made concrete from
spec, wiki, or code is `COVERAGE-GAP: <reason>` in `## Data` — never invented.

**Sizing**: one case = one subject × one behaviour cluster (e.g. "PriceCalculator.Total — discounts
and rounding"; "OrderStateMachine — transitions"). Typically 5–15 matrix rows; split above ~15;
fewer than 5 only when the subject genuinely has fewer partitions — say so in `## Data`.

## Step 3: Decide the doubles — ports only, named up front

From the `§Unit testing` doubles policy and the subject's constructor/imports, list in `## Doubles`:
- **May be faked** (ports): the exact abstractions and the behaviour each fake needs per row
  (`IClock → fixed 2026-03-31T23:59:00Z`, `IRateRepository → returns {GBP: 1.0, EUR: 0.86}`).
- **Must NOT be faked**: the subject, value objects, pure helpers it calls, the language runtime.
- **Interaction that IS the contract** (verify a call) vs **state the test observes** (prefer) — say which.
A case that needs to mock the subject's own private parts is testing the wrong seam: re-cut the
subject (smaller pure function) or route the behaviour to `integration`.

## Step 4: Placement, naming, reconcile

- Path (contract — exact): `<qa-root>/cases/unit/<module>/TC-UNIT-<MODULE>-<NNN>-<short-desc>.md` —
  `<module>` = the plan's business module (lower-kebab; the subject's layer/namespace is recorded
  in `## Subject`, not in the path), `<MODULE>` UPPER, `<NNN>` sequential per module folder,
  `<short-desc>` lowercase-kebab. **Case ID = `TC-UNIT-<MODULE>-<NNN>`.** Placement not derivable →
  `resolving-test-placement`; never guess.
- **Feature linkage = the `**Feature:** <slug>` header, never the filename.** Consumers use the
  plan's traceability table or grep `**Feature:** <slug>` under `<qa-root>/cases/` — NEVER glob filenames.
- **Check-then-upsert, never blind-append:**
  1. Glob `<qa-root>/cases/unit/<module>/TC-UNIT-*.md`; read each `**Feature:**`, `## Subject`, title, `@req:` tags.
  2. Identity = covered REQ set + normalized title — never the `<NNN>`. A subject whose citation
     sha changed is the SAME case (update the citation and re-verify the matrix at the new HEAD).
  3. Match → UPDATE in place (keep filename/`<NNN>`; preserve `@tms:` tags and human notes).
     No match → CREATE at next `<NNN>`. Orphans (REQ dropped, symbol deleted) → flag, don't delete;
     a deleted symbol becomes `## Subject: TESTABILITY-GAP: symbol removed @ <sha>`.
  4. Report **created N · updated M · unchanged K · orphaned P**.

## Step 5: Write each case file (never print cases to chat)

```markdown
# TC-UNIT-<MODULE>-<NNN> — [<Module>] <Subject.symbol> — <Actor> <action> [<condition>] → <expected>
**Feature:** <slug>  **Plan:** <qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md
**Type:** unit  **Module:** <module>  **Priority:** P0–P3
**AC:** <AC-NNN, … from the analysis AC register | —>
**Tags:** @unit @<module> @P<n> [@req:<id>] @agentic:gen

## Objective
<ONE sentence — the single intent this case proves; a second intent is a second case>

## Technique
- EP → positive, negative
- BVA → boundary                    <!-- plus decision-table / state-transition when the matrix uses them -->

## Isolation
- creates: nothing (in-memory values)
- cleans: nothing
- actor: none
- lock: none

## Subject
- `backend:src/Billing/PriceCalculator.cs#Total @ a1b2c3d` (layer `backend`, framework `csharp / xunit`)
- Rules implemented: BR-012 (line discount before tax), BR-014 (half-up rounding to 2 dp) — wiki pages cited
- Testability: OK | TESTABILITY-GAP: <hard-wired dependency> — seam needed: <suggestion>

## Preconditions
- Hermetic: no network/DB/filesystem/env/clock/random — ports faked per `## Doubles`
- Fixtures built in-test (builders); `[DATA:<entity>-<state>]` tokens only for reusable value sets (→ docs/test-data.md)

## Test matrix
| Row | Given (input / state) | When (call) | Then (expected) | Technique | Guards |
|---|---|---|---|---|---|
| 1 | 1 line, qty 2 × 10.00, no discount, VAT 20% | Total(order) | 24.00m; lines[0].net = 20.00m | partition (happy) | `*` in line net |
| 2 | 1 line 10.005 (needs rounding) | Total(order) | 10.01m (half-up), not 10.00m | boundary (precision) | rounding mode |
| 3 | discount 100% | Total(order) | 0.00m; no negative total | boundary (max) | `>= 0` clamp |
| 4 | discount 101% | Total(order) | throws ValidationException("discount") | boundary (max+1) + exception | `> 100` check |
| 5 | 0 lines | Total(order) | 0.00m | boundary (0) | empty loop |
| 6 | lines = null | Total(order) | throws ArgumentNullException("order.Lines") | invalid partition | null guard |
| 7 | 2 lines, discount on line 2 only | Total(order) | discount applied once, to line 2 only | decision table | per-line vs per-order |
| 8 | any valid order | Total(order) twice | identical result; order unchanged | property (idempotent) | hidden mutation |

## Steps
1. Action: call `PriceCalculator.Total` with Row 1's order
   Expected: 24.00m; lines[0].net = 20.00m
2. Action: Row 2 …
   Expected: …
<!-- one numbered step per matrix row, same order; Action names the call + row, Expected repeats the Then -->

## Doubles
- May fake (ports): `IClock` → fixed `2026-03-31T10:00:00Z` (rows 1–8); `IRateTable` → `{VAT: 0.20}`
- Never fake: `PriceCalculator`, `Money`, `LineItem`
- Verify interaction: none (state-based assertions only)

## Expected Result
- <overall: the subject's contract holds across every partition, boundary, transition and error path as stepped>

## Data
- Builders / fixed values used per row; `[DATA:*]` tokens if any
- Sources: analysis REQ ids; BR pages; code citations for the bounds (`MaxDiscount = 100` at `…#MaxDiscount @ sha`)
- COVERAGE-GAPs (a Then that could not be made concrete) and assumptions
- Deferred rows (why) · deliberately routed behaviours (to api/integration/e2e)
```

**Title** (CONTRACTS §7 Title; lint-checked): `[<Module>]` = the module folder in Title Case · <Subject.symbol> · the actor as a role (never "the user") + action + condition · `→` an observable outcome. No "Verify that"/"Ensure"/bare "successfully"/"works"; one outcome; ≤ 120 chars. Example: `TC-UNIT-INVOICES-004 — [Invoices] InvoiceTotal.round — Caller rounds 2.345 half away from zero → 2.35`.

**Priority** (CONTRACTS §7 Priority): start from the REQ's priority (analysis §6 hint); P0 only for the main success path of a P0 REQ, an authz/security denial or data loss/money/irreversible state; main negatives and error contracts → P1; boundaries, alternative paths, rarer roles → P2; cosmetic/copy/rare edges → P3. Never above the REQ unless a denial or data-integrity case, with a one-line `Priority reason:` under the header. Header, `@P<n>` and the traceability Priority are one value.

**Grounding first** (CONTRACTS §7): before writing a case, open the sources it rests on (the wiki pages for its BRs, the impact note, the code citation) and list them under `## Grounding`; a source you did not open is not cited.

Skeleton: `<qa-root>/_templates/case-unit.md` (CONTRACTS §7). `## Objective` is one sentence; `## Technique` uses the §7
vocabulary and names the axes it buys (`npm run qa:score` counts them per REQ and fails a P0/P1 REQ
without negative — and, for api, authz and error-contract — coverage); `## Isolation` says what the case
creates, cleans and which pool actor it uses so cases run in parallel; `**AC:**` lists the AC ids it
proves (add the Case ID to the plan's `## AC coverage` row for each). Techniques:
[`test-design-techniques.md`](../qa-phase-protocol/references/test-design-techniques.md).

Priority: P0 = money / data-integrity / security predicates / core state machines (gate: 0 failing
+ coverage thresholds per `§Quality gates`); P1 = every-release rules; P2 = edge partitions of
lower-consequence subjects; P3 = rare. Steps mirror the matrix 1:1 (one step per row).

### Tags — derived, never invented
Vocabulary at exact path `<qa-root>/docs/tag-taxonomy.md`. Fixed order:
`@unit @<module> @P0|@P1|@P2|@P3 [@req:<id>] [@tms:<id>] @agentic:gen` — `@req:` one per covered
requirement; `@tms:<id>` ONLY when a real work-item id exists (written by `publishing-test-cases`
post-publish, only preserved on update); `@agentic:gen` always.

## Step 6: Append traceability rows to the plan

ONE row per Req ↔ Case pair in `## Traceability (Requirement ↔ Case)` — exactly these columns:

| Req | Case ID | Type | Module | Priority | Scripted | Last run | Status | Report |
|---|---|---|---|---|---|---|---|---|
| REQ-004 | TC-UNIT-BILLING-001 | unit | billing | P0 | ❌ | — | — | — |

Designing appends with `Scripted` ❌ and run columns `—` (`generating-unit-script` flips ✅;
`executing-tests` fills the rest). On UPDATE, refresh existing rows — no duplicates. Any in-scope
logic-bearing P0/P1 REQ with no unit row → `⚠️ No unit case covers REQ-<id> — "<summary>"` below
the table (the `§Quality gates` Unit gate reads this).

**Impact map:** for each `BR-###` the case cites, `maintaining-impact-map` Mode A appends the Case
ID to that BR's row for this module in `<qa-root>/docs/impact-map.md` (`TC` cell only). The subject
citation is NOT written to `Endpoint / Screen` here — that cell belongs to `/qa-impact`.

### Escape backfill (CONTRACTS §13)
If `<qa-root>/defects/ESCAPES.md` has a row for this slug with `Backfill` = `pending` whose defect's
`### Backfill` names the subject / endpoint / screen this case covers, set that row's `Backfill` cell to
the new Case ID (comma-append when several) — the ledger is how `/qa-metrics` proves the hole closed.

## Step 7: Report ONLY this summary to chat

```
✓ Reconciled <qa-root>/cases/unit/: created {N} · updated {M} · unchanged {K} · orphaned {P}   ({rows} matrix rows, {guards} mutation guards)
✓ Appended traceability rows to <qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md
Subjects: {n} designed (P0 {a} · P1 {b} · P2 {c}) | deferred (score < 4): {list or "none"} | TESTABILITY-GAPs: {n} ({symbol → seam})
Routed — api: {list or "none"} | integration: {list or "none"} | e2e: {list or "none"} | no-case glue: {n}
REQs covered: {ids} | Uncovered logic-bearing P0/P1: {ids or "none"} | COVERAGE-GAPs: {n}
Next: /qa-script --type unit  (framework per §Unit testing → staged <qa-root>/scripts/unit/<module>/<same-TC-name>.<ext> + HANDOFF.md; write mode: {propose|apply})
```

---

## Common pitfalls
1. Unit-testing the framework — a controller with no branches, an auto-mapper, a DTO. No case; say why.
2. One "typical values" row per method — partitions and boundaries are the whole point; a matrix with
   no `min−1 / max+1` rows finds nothing.
3. Matrices with no mutation guards — every row passes on `>` and on `>=`; the test proves nothing.
4. Faking the subject or its private helpers to force a path — re-cut the subject or route the case.
5. Hidden clock/random/env in the Given — the test is non-deterministic before it is written; record
   the `TESTABILITY-GAP` and design against an injected value.
6. Designing from the code alone — code shows behaviour, not intent; a code/BR disagreement is a
   `CON-###` for the PM (via `/qa-clarify`), not a Then copied from the implementation.
7. Blind-appending on re-run, renumbering on update, or fabricating a citation sha.

## Done — ALL must be true
- [ ] `unit` enabled and `§Unit testing` configured; stopped with the setup callout otherwise.
- [ ] Every in-scope REQ/BR walked; subjects scored; every subject ≥ 4 or behind a P0/P1 REQ has a case; deferred subjects listed.
- [ ] Every `## Subject` cites `<layer>:<path>#<symbol> @ <sha>` confirmed at HEAD, or carries a `TESTABILITY-GAP` with the seam suggestion.
- [ ] Matrix per case: ≥1 row per partition · boundary triples per numeric/length/date rule · every state transition (allowed + forbidden) · every documented exception with no-partial-mutation · null/empty per reference input · ≥1 mutation guard per relational operator/constant · every Then concrete.
- [ ] `## Doubles` names ports only (from the `§Unit testing` policy); the subject is never faked; the Given is hermetic.
- [ ] One file per case at `<qa-root>/cases/unit/<module>/TC-UNIT-<MODULE>-<NNN>-<short-desc>.md` in the exact contract format; Steps mirror matrix rows 1:1.
- [ ] Reconciled by identity (REQ set + normalized title); orphans flagged, not deleted.
- [ ] Tags in fixed order; traceability rows appended (`Scripted` ❌); uncovered logic-bearing P0/P1 REQs ⚠️-flagged; impact-map TC cells appended.
- [ ] Only the Step 7 summary printed to chat.
