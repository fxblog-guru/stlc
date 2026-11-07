---
name: reviewing-cases
description: Use between /qa-design and /qa-script: read-only review of gaps, depth, duplicates, BR grounding, vague steps → READY / REVISE FIRST.
version: 1.0.0
---

# Reviewing Cases

> Profile first, by section (`profile.mjs`) — `§Test types`, `§Quality gates` (coverage targets),
> `§Domain knowledge` (wiki for BR-### checks). QA root defaults to `<qa-root>/`.

## Prime directive — critique with evidence, touch nothing
Every finding cites the artifact lines that prove it and prescribes an action for the case-designer
(or planner). This skill edits NO case, NO plan row, NO script — a review that fixes things
silently destroys the audit trail.

## Action
Produce `<qa-root>/reviews/<slug>/YYYY-MM-DD-case-review.md` with severity-ranked findings and a
review verdict (`READY FOR /qa-script` / `REVISE FIRST`).

## Inputs — resolve before reviewing (STOP conditions)
1. `<slug>` + analysis + plan (traceability with designed rows). No designed cases → STOP:
   "nothing to review — run /qa-design".
2. The case files for every traceability row with a Case ID (located by table, never filename glob).
3. Compiled wiki `<qa-root>/wiki/compiled/index.md` (optional — BR checks skipped without it, and the
   review says so).

## Step 1: Coverage audit — the REQ × type matrix
From the traceability table: every REQ-id × applicable enabled type. Empty cell = **GAP** finding
(severity High for P0/P1 REQs). One thin case where the analysis lists multiple ACs = **THIN**
finding with the uncovered ACs named.

## Step 2: Depth audit — against the design skills' own minimums
**This table is an INDEX, not the source** — each design skill's own rules section is authoritative;
re-read it at review time, and when this index and the skill disagree, **the skill wins**.

| Type | Minimums checked (from the design skill's own rules) |
|---|---|
| api | per RESOURCE: the CRUD contract case (create → independent GET read-back → update with unchanged-fields check → delete read-back 404 → idempotent re-PUT/re-DELETE) · per FIELD ≥1 negative + boundary rule-of-3 (min−1/boundary/max+1) · enums: one positive per value + invalid + case-mismatch · per ENDPOINT the authz case (401 unauth / 401 expired / 403 role / cross-tenant IDOR) · schema + no-leakage fields · every Expected states a concrete status + body claim · **Step 3b endpoint classes applied** (`references/api-test-heuristics.md`): collection endpoints have the query-matrix case (pagination edges, unknown filter, sort stability); PATCH endpoints the partial-update semantics; status fields the full state-transition matrix (allowed + forbidden cells, read-back); create/charge endpoints an idempotency/concurrency probe; 202 endpoints the async lifecycle; every API the shared error-contract + contract-drift case |
| integration | seam pattern (A/B/C) bound · action→state assertion · negative twin (rejected request leaves NO row) · async seams state a polling window (never a bare sleep) · idempotency twin where redelivery is declared · SQL read-only and scoped by the returned id · one seam behaviour per case |
| e2e | SIX categories with per-slug counts (Happy 5–7 · Validation 3–4 · Edge 3–4 · Negative 3–4 · Impact 1–2 · Integration touchpoints 3–4) · every REQ in ≥1 case's `@req:` tags · Restrictive REQ ⇒ a negative case · exact UI element names + navigation paths · one journey per case |
| security | every DENIED matrix cell asserted (401 / 403 / cross-tenant) · vertical AND horizontal escalation covered · undocumented cells flagged UNKNOWN (never assumed) · injection cases assert safe rejection (defense-oriented) · session/token + sensitive-data cases present · `## OWASP ref` + `## Authorization` on every case |
| performance | every critical transaction has smoke + load (stress/spike/soak where the rubric signals) · each scenario has `## Workload` + `## SLOs` · SLO source order: plan `## Performance SLOs` → analysis SLA → `§Quality gates` default, gaps marked `SLO-GAP` never invented · data pool varies per iteration · target env authorized in `§Environments` |
| accessibility | every in-scope screen STATE has an automated axe case (or a ⚠ note) · per interactive screen a keyboard/focus case · per form a validation-announcement case · reflow at 320 px on data screens · `## WCAG ref` names the target + bare SC ids · `## Scope` names screen · states · viewport · check kind · every exclusion with a reason · `@manual` only on manual check kind with observable steps |
| mobile | `## Platforms` (both unless a written reason) + `## Device profile` (devices/tier + conditions, `real device required` where an emulator would fake it) on every case · P0 journeys covered on both platforms · the heuristics floor per feature: interrupt, background/foreground, offline + flaky network, permission denied→granted, orientation, deep link, kill/relaunch (or a recorded `N/A`) · no locator-only twin cases · every accessibility id cited from the framework/app source or a `FRAMEWORK-GAP` · isolation stated (fresh app state) · suite tag present |
| unit | per SUBJECT: `## Subject` cites `<layer>:<path>#<symbol> @ <sha>` (or a `TESTABILITY-GAP` with the seam named) · `## Test matrix` with byte-exact columns · ≥1 row per equivalence partition · boundary triple per numeric/length/date rule · every state transition, allowed AND forbidden · every documented exception with no-partial-mutation · null/empty per reference input · ≥1 mutation guard per relational operator/constant in the `Guards` column · every Then a concrete value/exception/interaction · `## Doubles` names ports only — the subject faked = DEPTH High · Given hermetic (no I/O/clock/random) · Steps mirror rows 1:1 |

**Heuristic-coverage index** — the bug-hunting layer, checked per slug (each source skill is authoritative):

| Heuristic set | Applies when | Covered by | Missing = |
|---|---|---|---|
| UI risk classes (`designing-functional-cases` Step 1b: double-submit · back/refresh/deep link · two tabs · role change while open · session expiry · zero/one/many + hostile data · slow/failed network · unsaved-changes guard · list state · timezone/locale · cross-project leak · one pass per role · AI answer or retrieval · keyboard-only) | the screen has the trigger in the class's first column | an e2e case whose `## UI risk classes` names the class, or a `COVERAGE-GAP` with a `/qa-clarify` question | **GAP** (High when the class guards data integrity or access: double-submit, two tabs, role change, session expiry, cross-project leak, one pass per role) |
| API endpoint classes (`designing-api-cases` Step 3b) | as the depth row above | the class case/rows | **GAP** |
| Deploy checks (CONTRACTS §30) | the plan's `## Sizing` declares `deploy_impact: db` or `api` | a case per required check naming it on `**Deploy check:**`, or a `deploy_skipped` reason | **GAP** (High for backup, rollback and N-1 checks) |
| Schema fuzzing (`designing-api-cases` Step 3c) | the API has an OpenAPI document | the project's `TC-API-FUZZ-*` case allows the slug's new operations (`fuzz-allow`), or each excluded one has a `fuzz-deny` reason | **GAP** (Medium) |
| Model test (`designing-api-cases` Step 3c) | the slug adds or changes a state machine, counters, memberships or uniqueness rules | an api case with Technique `state-transition` and a `## Model` naming the invariants | **THIN** (High when money or permissions are invariants) |

Write the index into the review as `## Heuristic coverage` — `| Heuristic | Applies to | Case IDs | Verdict |` — before `## Coverage`.

Missing minimum = **DEPTH** finding citing the case file and the absent element. Malformed
Case IDs, a Type/folder/`@<type>`-tag mismatch, or an H1 disagreeing with the filename are also
**DEPTH** findings — the casing/format contract is part of the minimums.

## Step 3: Duplicate & overlap audit
Cases proving the same REQ+behavior with the same inputs (compare titles, steps, expected):
**DUP** finding — prescribe merge/delete target. Near-duplicates across types are fine when each
proves a different layer; say so explicitly when examined and kept.

## Step 4: Grounding audit — was the knowledge read before the case was written?
Each case's `## Grounding` (CONTRACTS §7) names the sources it was designed from. Audit all three:
1. **Per case.** For every cited BR, open its atomic wiki page and check the case's Expected
   against it. A contradiction is a **BR-CONFLICT** finding (High), quoting both sides verbatim.
   A P0/P1 case whose Grounding is missing, or only `none`, is **UNGROUNDED** (High): it fails the
   review. For P2/P3 it is Medium.
2. **BR coverage, the other direction.** List every BR the analysis or the latest impact note §1
   names for this slug. A BR that no case's `## Grounding` cites is a **GAP** finding: High when a
   P0/P1 REQ depends on it, else Medium. Write the list as the review's `## BR coverage` table:
   `| BR | Named by | Cited by cases |`.
3. **Freshness.** A cited wiki page changed after the case's last edit (`git log -1` on both) is a
   Medium **UNGROUNDED** finding: the rule moved, so re-read it.
No compiled wiki means steps 1 and 2 run against the impact note and analysis alone, and the review
says so.

## Step 5: Executability audit
Steps a script generator cannot act on: no expected result, "verify it works"-grade assertions,
data placeholders never defined (`[DATA:x]` with no glossary entry), UI steps naming elements that
have no registry/testid hint. **VAGUE** finding per case with the exact line quoted.

## Step 5b: Score every case — the per-case checklist
Before judging coverage in aggregate, score each case against
`<qa-root>/_templates/case-review-checklist.md`: objective single · traceable (REQ + AC) ·
independent/isolated · deterministic expected · technique fits · priority justified (derived per
CONTRACTS §7 Priority from the REQ's priority and the scenario's role) · data defined · title says it
(CONTRACTS §7 Title: module, screen/operation, actor role, scenario and outcome readable from the H1
alone, and true to the steps) —
pass (1) / fail (0) each, a fail quoting the line that proves it. One row per case in the review's
`## Case scores` table. A score < 7/8, or a 0 on *objective single*, *deterministic expected* or *title says it*, is a
**High** finding. Run `npm run qa:lint` and `npm run qa:score -- <slug>` first and cite their output:
lint failures are DEPTH/VAGUE findings as they stand, and every `qa:score` GAP line is a **High**
GAP finding (a P0/P1 REQ without negative — or, for api, authz / error-contract — coverage).
Also check the plan's `## AC coverage`: an AC with `not covered` and no `deferred (<reason>)` is a
GAP finding.

## Step 6: Write the review + verdict
`<qa-root>/reviews/<slug>/YYYY-MM-DD-case-review.md`, from `<qa-root>/_templates/case-review.md`. Front matter first
(`CONTRACTS §18`): `slug`, `date`, `verdict`, and `reviewed:` — one `path` + `sha256` entry for
**every case this verdict covers**, in path order, hashed with
`node <qa-root>/scripts/shared/build-state.mjs --hash <path>` (body only, so re-tagging a case later does
not invalidate the review). That list is what lets the board say the review went STALE when a case
changes afterwards; a review that lists nothing claims nothing. Then the body (with the Step 5b `## Case scores` table before `## Coverage`):
`| # | Severity | Class (GAP/THIN/DEPTH/DUP/BR-CONFLICT/UNGROUNDED/VAGUE) | Where | Evidence | Prescribed action |`
ranked High→Low, then the verdict: **REVISE FIRST** when any High exists, else **READY FOR
/qa-script** (Medium/Low findings listed as should-fix). Then print:
```
✓ Wrote <qa-root>/reviews/<slug>/YYYY-MM-DD-case-review.md
Verdict: {READY FOR /qa-script | REVISE FIRST}
Findings: {h} High / {m} Medium / {l} Low — top: {one-line worst finding}
Coverage: {n} REQ×type cells, {g} gaps | Next: {/qa-design --fix list | /qa-script}
```

## Done — ALL must be true
- [ ] Every REQ × enabled-type cell audited; every finding cites evidence and prescribes an action.
- [ ] Depth checked against each design skill's OWN minimums — not invented standards.
- [ ] `## Heuristic coverage` written: every applicable UI risk class, API class, fuzz scope and model candidate has a case or a finding.
- [ ] Grounding audited both ways: every case's citations checked, and every BR the analysis or impact
      note names has a case (`## BR coverage`); P0/P1 UNGROUNDED is High.
- [ ] Verdict follows the High-findings rule, and the front-matter `verdict` matches the body's.
- [ ] `reviewed:` lists every audited case with its body hash — no case audited but unlisted.
- [ ] Every audited case scored on the eight checklist attributes; `qa:lint` and `qa:score` output cited.
- [ ] Zero edits to cases, plan, traceability, or scripts.
