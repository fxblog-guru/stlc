---
slug: <slug>
artifact: analysis
status: draft
authored_by: analyzing-docs
reviewed_by: pending
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# QA Analysis — <slug> — YYYY-MM-DD

**Change type:** new_project | update_existing | add_feature
**Mode:** greenfield | brownfield
**Enabled test types (profile §Test types):** <list>
**Inputs analyzed:**
- <path/URL/ticket with citation anchor, e.g. docs/invoicing-brd.md · PROJ-123 (snapshot: sources/PROJ-123.md)>

<!-- Written by /qa-analyze (analyzing-docs skill, Step 8). Feeds /qa-plan.
     Section headings and order are the contract — downstream skills parse them by heading.
     Copy this file to <qa-root>/analysis/<slug>/YYYY-MM-DD-analysis.md (today's date) and fill it. -->

## 1. Workspace detection

<!-- The pipeline's audit log: paths scanned, prior artifacts found, mode, REQ id watermark. -->

- Scanned: `<qa-root>/analysis/<slug>/`, `<qa-root>/plans/<slug>/`, grep `**Feature:** <slug>` under `<qa-root>/cases/`
- Mode: greenfield | brownfield — <why>
- REQ id source: <dev handoff packet (ids verbatim) | QA-authored: none (start at REQ-001) | QA-authored: this slug's highest id> — never another slug's

## 2. Requirement register (REQ ↔ source)

<!-- One REQ = one atomic, verifiable behaviour (subject, trigger, observable outcome).
     Ids are permanent — never renumber, reuse, or backfill gaps. -->

| REQ | Requirement (verifiable statement) | Module | Kind | Source | Notes |
|---|---|---|---|---|---|
| REQ-001 | <statement> | <module> | functional / api-contract / ui / security / performance / accessibility / mobile / data / integration | <path:L##> | — |

### AC register (AC ↔ REQ)

<!-- One row per acceptance criterion. When a dev handoff packet or ticket carries acceptance
     criteria, copy their text VERBATIM (keep the packet's AC ids when it has them) — never
     paraphrase. Ids are permanent, like REQ ids. Every AC maps to exactly one REQ. Cases cite these
     ids on their `**AC:**` line; the plan's `## AC coverage` table accounts for every row
     (CONTRACTS §7). Write "No acceptance criteria supplied" when there are none. -->

| AC | REQ | Acceptance criterion (verbatim) | Source |
|---|---|---|---|
| AC-001 | REQ-001 | <criterion text, verbatim> | <qa-handoff.md § Acceptance criteria | ticket snapshot § field> |

## 3. Delta analysis

<!-- Brownfield only; otherwise "Not applicable (greenfield)". Classify 100% of prior REQs. -->

| REQ | Delta (New/Changed/Removed/Unchanged) | What changed | Impacted cases (from traceability) |
|---|---|---|---|

## 4. OpenAPI endpoint inventory

<!-- Or "No API spec supplied". Every endpoint maps to ≥1 REQ; undocumented ones get ⚠. -->

| Method + Path | operationId | Auth (scheme/scope) | Request schema | Success | Errors documented | Linked REQs |
|---|---|---|---|---|---|---|

## 5. Testability matrix & REQ × type coverage map

<!-- Enabled types only; list disabled types once as "disabled by profile". -->

| Type | Applicable? | Why / why not | Entry points | Blockers |
|---|---|---|---|---|
| api | ✅ / ⚠ / — | | | |
| integration | | | | |
| e2e | | | | |
| security | | | | |
| performance | | | | |
| unit | | <logic-bearing rules resolvable to a symbol via grounding-in-code> | `<layer>:<path>#<symbol>` | |
| accessibility | | <user-facing screens/states; conformance target from §Accessibility> | routes + states + registry test ids | |
| mobile | | <native-app journeys or device-dependent behaviour; platforms + matrix from §Mobile testing> | framework screen objects + deep-link paths | |

<!-- Every REQ row ends ✅ (≥1 type) OR ⚠ with an explicit flag linked to a question/risk. -->

| REQ | unit | api | integration | e2e | security | performance | accessibility | mobile | Testable? |
|---|---|---|---|---|---|---|---|---|---|
| REQ-001 | | | | | | | | | ✅ / ⚠ flagged: <reason — see Q-###> |

## 6. Risk assessment

<!-- Score = Likelihood × Impact (1–3 each). High 6–9 → P0–P1 hint · Medium 3–4 → P2 · Low 1–2 → P3. -->

| Risk | Description | REQs | L | I | Score | Level | Priority hint |
|---|---|---|---|---|---|---|---|
| R-001 | | | | | | | |

## 7. Ambiguities & conflicts

<!-- AMB-### = cannot be made verifiable as written; CON-### = two sources disagree.
     Resolve via docs → §Domain knowledge → documented assumption before it becomes a question. -->

| ID | Kind | Description | Sources | Resolution | Status |
|---|---|---|---|---|---|
| AMB-001 | Ambiguity | | | | Resolved / Assumed / → Q-### |

## 8. Assumptions

<!-- Every assumption made anywhere above, in one place — planning treats these as facts-until-corrected. -->

- <assumption> (from AMB-###)

## 9. Open questions

<!-- Asked in ONE batch at the end, each with a proposed default. Blocking questions stop /qa-plan. -->

| Q | Question | Linked | Proposed default | Blocking? |
|---|---|---|---|---|
| Q-001 | | | | Yes / No |

## 10. Recommended scope for planning

- Modules: <list>
- Priority-ordered REQs: <High-risk first>
- Suggested type emphasis: <e.g. api-heavy; e2e lean — P0 journeys only>
- Deploy impact: <none | db | api | db, api> — <evidence: handoff § Interfaces changed (endpoints, MIG ids), data rewritten (backfill, transform, split-merge, type-change, delete, import)> (CONTRACTS §30; planning-tests copies it into ## Sizing)
