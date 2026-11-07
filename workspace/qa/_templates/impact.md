---
slug: <slug>
artifact: impact
status: draft
authored_by: maintaining-impact-map
reviewed_by: pending
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# Impact note — <slug> — YYYY-MM-DD

**Story / change:** <ticket key or doc> · **Inputs:** <paths cited> · **Impact map:** <qa-root>/docs/impact-map.md

<!-- Written only by /qa-impact (maintaining-impact-map, Mode B). Copy to
     <qa-root>/analysis/<slug>/YYYY-MM-DD-impact.md. The five headings below are byte-exact and in this
     order (CONTRACTS §10). It is an INPUT to /qa-analyze, /qa-plan and /qa-design — it never edits
     cases, the plan or the traceability table. -->

## 1. Business rules touched

<!-- BR-NNN from the compiled wiki, each with the wiki page it comes from and why the change touches it. -->

| BR | Rule (one line) | Wiki page | Why touched |
|---|---|---|---|

## 2. Modules & code touched

<!-- From impact-map rows and grounding-in-code citations `<layer>:<path>#<symbol> @ <sha>`.
     `?` where the module is not resolved yet — never guessed. -->

| Module | Endpoint / Screen | Citation | Change kind |
|---|---|---|---|

## 3. Existing cases to re-verify

<!-- Case IDs from the impact map's TC column and the traceability table, with the reason each must
     be re-run or re-designed. -->

| Case ID | REQ | Why | Action (re-run / re-design / retire) |
|---|---|---|---|

## 4. Gaps & questions

<!-- BRs or modules with no case (a coverage gap), and anything unclear (→ Q-NNN on the
     clarifications sheet). -->

## 5. Impact map delta

<!-- Rows this note added or updated in <qa-root>/docs/impact-map.md, by (BR, Module). -->
