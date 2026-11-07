---
slug: <slug>
artifact: strategy
status: draft
authored_by: planning-tests
reviewed_by: pending
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# Test Strategy — <slug> — YYYY-MM-DD
**Change type:** new_project | update_existing | add_feature  **Analysis:** <qa-root>/analysis/<slug>/YYYY-MM-DD-analysis.md
**Enabled types planned:** <list>  **Excluded types:** <type — reason>

<!-- Written by /qa-plan (planning-tests skill, Step 1). One `## <type> strategy` section per
     enabled type (unit / api / integration / e2e / security / performance / accessibility / mobile); every section answers
     the same six questions — a section missing any of them is incomplete. -->

## <type> strategy

<!-- Repeat this whole section per enabled type. -->

- **Approach:** <techniques driven by the analysis — CRUD lifecycle, boundary analysis, state transitions, authz matrix, workload models…>
- **Tooling:** <from profile §Test types; where silent, use the bundle default and say "(bundle default)">
- **Scope — in:** <modules + REQ ids, e.g. "orders: REQ-001, REQ-005; invoices: REQ-002–REQ-003">
- **Scope — out:** <what this type deliberately does NOT cover, and which type covers it instead>
- **Data strategy:** <seed data, builders/factories, parallel-safe isolation, cleanup policy, synthetic PII only>
- **Environment needs:** <§Environments env + the exact <qa-root>/.env.example variables consumed>

<!-- security section only — this guardrail must appear verbatim:
     security tests target ONLY the team's own application in authorized test environments
     (§Application under test); standard practice only — no exploit development, no testing
     of third-party systems. -->

## Exploratory charters (planned)

<!-- Charters /qa-explore will write before sign-off: top risks without a scripted proof, BRs
     with no TC, escape areas, @manual accessibility cases. One 90-min session each. -->

| Charter (mission) | Targets (R-/BR-/REQ-/TC-…@manual) | Timebox |
|---|---|---|

## Risks & mitigations

<!-- Carry the analysis §6 High/Medium risks forward; each mitigation is owned by a type,
     e.g. "R-001 idempotent-job risk → integration re-run case, P0". -->

| Risk | Mitigation | Owning type | Priority |
|---|---|---|---|
| R-001 | | | |

## Change log

<!-- One line per update; created empty. -->
