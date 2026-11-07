# Case review checklist — per case

<!-- Used by /qa-review (reviewing-cases, Step 5b) for EVERY case it audits; the scored rows go into
     the review file's `## Case scores` table. Each attribute is pass (1) or fail (0) — no partial
     marks; a fail names the line that proves it. Score = passes / 8. A case scoring < 7/8, or
     failing "objective single", "deterministic expected" or "title says it", is a High finding (REVISE FIRST).
     qa:lint already rejects the mechanical failures (empty sections, steps without Expected,
     unknown technique, undefined [DATA:] token); this checklist is the judgement lint cannot make. -->

| # | Attribute | Pass when | Typical fail |
|---|---|---|---|
| 1 | **Objective single** | `## Objective` states ONE behaviour; every step and Variants row serves it | "creates an order and checks the audit log and emails the customer" |
| 2 | **Traceable** | `@req:` tags and `**AC:**` name real REQ/AC ids; the steps prove the AC text, not a neighbour of it | case tagged REQ-004 but asserting REQ-002's rule |
| 3 | **Independent / isolated** | `## Isolation` names what it creates, cleans and the pool actor; no state from another case; `lock:` only for truly shared state | relies on "the order created in TC-…-003"; cleans nothing |
| 4 | **Deterministic expected** | every Expected is an observable value (status, field = value, row count, exact text, focus target); no timing guess | "page loads fine", "works as expected", a bare sleep |
| 5 | **Technique fits** | the named techniques match what the steps/variants do, and the obvious one is not missing (boundaries on a numeric rule, a state matrix on a status field, a decision table on role × action) | "BVA" claimed with no boundary value; a status field with no forbidden transition |
| 6 | **Priority justified** | derived per CONTRACTS §7 Priority: the REQ's priority adjusted by the scenario's role (main success path of a P0 REQ, authz denial, money/data loss → P0; main negatives → P1; boundaries/alternatives → P2; cosmetic → P3); never above the REQ without a `Priority reason:` | a cross-tenant denial at P3; a layout check at P0 |
| 7 | **Data defined** | every input is in `## Data` or a `[DATA:]` token with a test-data.md row; boundaries cite their constant | "a valid customer"; "some large number" |
| 8 | **Title says it** | the H1 alone names module, screen/operation, actor, scenario and outcome (CONTRACTS §7 Title) and matches the steps; the actor is the role the case signs in as | "[Orders] Orders list — the user creates an order → order is created" (actor and outcome say nothing); a title promising 201 for a case that asserts 400 |

Score row (copy into the review's `## Case scores` table):

| Case ID | Obj | Trace | Isol | Determ | Tech | Prio | Data | Title | Score | Note |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-<TYPE>-<MODULE>-NNN | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 8/8 | — |
