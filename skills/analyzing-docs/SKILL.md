---
name: analyzing-docs
description: Use first on any feature: specs, stories, OpenAPI, tickets or the dev handoff → REQ-numbered, risk-scored analysis (/qa-analyze).
version: 1.0.0
---

# Analyzing Requirement Documents

> Profile first, by section (`profile.mjs`) — §Project, §Application under test, §Test types,
> §Environments, and §Domain knowledge drive every judgement below. The QA root defaults to
> `<qa-root>/` (profile-overridable); all paths in this skill are relative to the repository root.

Turn raw requirement inputs into ONE deterministic analysis artifact:
`<qa-root>/analysis/<slug>/YYYY-MM-DD-analysis.md`. Everything downstream — `/qa-plan`, `/qa-design`,
the traceability table — keys off the REQ ids minted here, so this skill is where testing rigor
is won or lost. This is a **testing-only** workflow: analyze and document; never implement or
modify application code.

---

## Entry criteria (do not start without these)

1. **`change_type`** — exactly one of `new_project | update_existing | add_feature`.
   If the user did not state it, infer it from workspace detection (Step 0) and confirm the
   inference in one sentence; if it cannot be inferred, ask — this is the one question that may
   be asked up front.
2. **Raw inputs** — at least one of:

   | Input kind | Typical form | How to ingest |
   |---|---|---|
   | Functional spec / BRD | `.md`, `.docx`-export, `.pdf` | Read fully; note file path + line numbers |
   | User stories / acceptance criteria | Markdown lists, ticket exports | One story = one or more REQs |
   | OpenAPI / Swagger spec | `.yaml` / `.json` | Resolve `$ref`s; run Step 4 inventory |
   | UI designs | Figma export files, screenshots, frame links | Cite frame/screen names |
   | Live URLs / staging pages | `https://…` | Fetch if reachable; cite URL + heading |
   | Tracker ticket | Jira key `PROJ-123`, ADO id `#4821` | Fetch READ-ONLY (Atlassian MCP `getJiraIssue`; ADO REST) → save `<qa-root>/analysis/<slug>/sources/<KEY>.md` (summary, description, acceptance criteria, status, links, attachment names); analyze the snapshot, never memory; the ticket is never edited |
   | Existing `<qa-root>/` artifacts | prior analysis/plans/cases | Brownfield delta input (Step 0) |

> **Project setup required:** tell the skill where requirement docs live (a `docs/` folder, a
> ticket export, an attachments directory) and where the OpenAPI spec is, if one exists — there
> is no default location for either. Figma content must be supplied as exported files or
> screenshots placed in the repo; a bare Figma URL that cannot be fetched is logged as an open
> question, not silently skipped.

If neither `change_type` nor any raw input can be established, stop and report what is missing.
Do not fabricate requirements from the product name alone.

---

## Step 0 — Resolve the slug and detect the workspace

### 0.1 Slug

Derive `<slug>` (kebab-case, stable for the life of the initiative) from the feature or
initiative name — e.g. "Invoice late-payment reminders" → `invoice-late-reminders`. For
`new_project` baselines use the product/module name (e.g. `orders-api-baseline`). The slug is
reused verbatim by every later phase (`<qa-root>/plans/<slug>/…`, `**Feature:** <slug>` in case files),
so confirm it with the user if more than one reasonable slug exists.

### 0.2 Workspace detection (ALWAYS — log the result)

Scan for prior QA artifacts before reading a single requirement:

1. `<qa-root>/analysis/<slug>/` — earlier analyses for this slug.
2. `<qa-root>/plans/<slug>/` — an existing strategy/test plan (and its traceability table).
3. Existing cases — grep for `**Feature:** <slug>` under `<qa-root>/cases/`
   (NEVER glob `<slug>.md` filenames; case files are named `TC-<TYPE>-<MODULE>-<NNN>-….md`).
4. Any `<qa-root>/analysis/`, `<qa-root>/plans/` content for *other* slugs that overlaps the same modules.

| Findings | Mode | Consequence |
|---|---|---|
| No `<qa-root>/` artifacts for the slug or its modules | **Greenfield** | Full analysis; REQ numbering starts at `REQ-001` |
| Prior analysis/plan/cases exist | **Brownfield** | Delta analysis (0.3); REQ numbering per Step 2.3 (handoff ids verbatim; otherwise the slug's own watermark) |

Cross-check `change_type` against the mode: `update_existing`/`add_feature` with a greenfield
workspace (or `new_project` with a brownfield one) is a contradiction — surface it and let the
user pick before continuing.

Record the whole detection result (paths found, mode, id watermark) in section 1 of the
analysis artifact — that section is this pipeline's audit log; do not create a separate audit
file.

### 0.3 Brownfield delta rules

- Read the most recent `<qa-root>/analysis/<slug>/YYYY-MM-DD-analysis.md` and the plan's
  `## Traceability (Requirement ↔ Case)` table first.
- Classify every requirement in the new inputs against the old register: **New** (mint the next
  REQ id), **Changed** (keep the id, describe the change, list impacted Case IDs from the
  traceability table), **Removed** (keep the id, mark `Deprecated` — never delete or renumber),
  **Unchanged** (carry forward untouched).
- Read `<qa-root>/docs/impact-map.md` and the latest `<qa-root>/analysis/<slug>/YYYY-MM-DD-impact.md` when present:
  their TC ids for the impacted modules are the floor of "impacted Case IDs" — traceability adds,
  never removes.
- The new analysis file contains the FULL register (carried + new), not just the delta — it must
  stand alone for `/qa-plan`.

---

## Step 1 — Ingest and index the inputs

Read every input end-to-end before extracting anything. Build a source index with a stable
**citation anchor** per input so every REQ can point back to its origin:

| Source type | Anchor format | Example |
|---|---|---|
| Markdown/text file | `<path>:L<line>` | `docs/invoicing-brd.md:L87` |
| OpenAPI spec | `<path> § <METHOD> <path>` | `openapi.yaml § POST /invoices` |
| Figma export / screenshot | `figma: <frame/screen name>` | `figma: Invoice list — overdue filter` |
| URL | `<url> § <nearest heading>` | `https://staging.example.com/orders § Bulk actions` |
| Tracker snapshot | `<KEY> § <field or heading>` | `PROJ-123 § Acceptance criteria` |
| Dev handoff packet | `dev/release/<slug>/qa-handoff.md § <heading>` | `dev/release/job-export/qa-handoff.md § Automation-tier criteria` |

While reading, mark (do not yet resolve): normative statements ("must", "shall", "only",
"never"), numeric limits, role names, state words (draft/approved/paid/cancelled), and anything
two sources describe differently.

---

## Step 2 — Requirement extraction → the REQ register

**Procedure (per input, in reading order):**

1. Split the text into atomic, independently verifiable statements. One REQ = one testable
   behaviour. "Users can create and cancel orders" = two REQs.
2. Rewrite each statement into verifiable form — subject, trigger, observable outcome. Vague
   input ("invoicing should be fast and reliable") does NOT become a REQ; it becomes an
   ambiguity (Step 6) until quantified.
3. Assign ids (CONTRACTS §1 — REQ numbers are unique **per slug**, never across slugs). **Ids are
   permanent — never renumber, reuse, or backfill gaps.**
   - **A dev handoff packet is an input** → its `REQ-NNN` (and `AC-NNN`) ids are **kept as they
     are** — the dev bundle minted them per slug at its G1 gate and every artifact on that side cites
     them. Do NOT continue from any other slug's watermark; a requirement found only in other
     inputs takes the next id after the packet's highest.
   - **No packet (QA-authored REQs)** → greenfield starts at `REQ-001`; a brownfield re-analysis of
     the SAME slug continues from that slug's highest id. Another slug's register is never the
     watermark — `orders/REQ-004` and `billing/REQ-004` are different requirements.
   - Outside this slug's own analysis and plan, a REQ is written `<slug>/REQ-NNN` (case tags
     `@req:<slug>/REQ-NNN`, spec annotations).
4. Attach the citation anchor(s), a `Module` (kebab-case — e.g. `orders`, `invoices` — reused
   later in `TC-<TYPE>-<MODULE>-<NNN>` ids and `@<module>` tags), and a Kind
   (`functional | api-contract | ui | security | performance | accessibility | mobile | data | integration`).

**Register format (section 2 of the artifact):**

```markdown
| REQ | Requirement (verifiable statement) | Module | Kind | Source | Notes |
|---|---|---|---|---|---|
| REQ-001 | Submitting a valid order with ≥1 line item creates it in status `pending` and returns its id | orders | api-contract | openapi.yaml § POST /orders; docs/orders-spec.md:L34 | — |
| REQ-002 | An invoice unpaid 30 days after issue is auto-marked `overdue` at the next daily job run | invoices | functional | docs/invoicing-brd.md:L87 | timing rule — see Q-002 |
| REQ-003 | Only users with the `finance` role can void an invoice; others receive 403 | invoices | security | docs/invoicing-brd.md:L102 | authz matrix candidate |
```

**AC register (a `### AC register (AC ↔ REQ)` sub-table directly under the REQ register):** one row
per acceptance criterion, columns byte-exact `| AC | REQ | Acceptance criterion (verbatim) | Source |`.
When the dev handoff packet or a ticket snapshot carries acceptance criteria, copy each criterion's
text **verbatim** (keep the packet's `AC-NNN` ids when it has them; otherwise mint `AC-NNN` in reading
order) — an AC is the stakeholder's words, never a paraphrase; the REQ is QA's verifiable restatement.
Every AC maps to exactly one REQ; an AC that maps to none is an ambiguity (Step 6). Ids are permanent.
No criteria in the inputs → write "No acceptance criteria supplied". Cases cite these ids on their
`**AC:**` line and the plan accounts for every one in `## AC coverage` (CONTRACTS §4, §7).

```markdown
### AC register (AC ↔ REQ)
| AC | REQ | Acceptance criterion (verbatim) | Source |
|---|---|---|---|
| AC-001 | REQ-001 | Given an active customer, when an order with one line is submitted, then it is created as pending | dev/release/orders/qa-handoff.md § Acceptance criteria |
```

Brownfield: add section 3 with the delta table
`| REQ | Delta (New/Changed/Removed/Unchanged) | What changed | Impacted cases (from traceability) |`.

---

## Step 3 — OpenAPI endpoint inventory (when a spec is present)

Skip this step (and say so in the artifact) if no OpenAPI/Swagger spec was supplied.

1. Resolve all `$ref` / `allOf` / `anyOf` / `oneOf` chains.
2. Inventory EVERY endpoint — undocumented ones referenced in examples get a ⚠ flag:

   ```markdown
   | Method + Path | operationId | Auth (scheme/scope) | Request schema | Success | Errors documented | Linked REQs |
   |---|---|---|---|---|---|---|
   | POST /orders | createOrder | Bearer, `write:orders` | OrderCreate | 201 | 400, 401, 409 | REQ-001 |
   | GET /invoices/{id} | getInvoice | Bearer, `read:invoices` | — | 200 | 401, 403, 404 | REQ-003 |
   ```

3. Extract `securitySchemes` and list the auth states that will need coverage
   (valid / expired / invalid / missing / wrong-scope).
4. Note field-level constraints worth boundary testing (min/max, enums, formats, nullability) —
   summarize the notable ones; the exhaustive per-field expansion belongs to `designing-api-cases`,
   not here.
5. Every endpoint must map to ≥1 REQ. An endpoint no requirement mentions is itself a finding:
   mint a REQ for its documented contract or log a conflict/question.

---

## Step 4 — Per-type testability matrix

Only assess the types ENABLED in PROJECT-PROFILE §Test types; list disabled types once as
"disabled by profile" and move on.

For each enabled type answer three things — applicable to THIS initiative? why? and through
which concrete entry points would tests reach the system?

```markdown
| Type | Applicable? | Why / why not | Entry points | Blockers |
|---|---|---|---|---|
| api | ✅ | Order + invoice contracts in openapi.yaml | `API_BASE_URL` → POST /orders, GET/POST /invoices | — |
| integration | ✅ | Overdue job writes invoice status directly to DB | daily job trigger + `DB_CONNECTION` assertions | job not triggerable on demand — Q-003 |
| e2e | ✅ | Finance UI: invoice list, void dialog | `BASE_URL` → /invoices list + detail pages | Figma frames only; no staging URL yet |
| security | ✅ | Role-gated voiding (REQ-003), payment data | authz matrix over /invoices endpoints; ZAP baseline vs `ZAP_TARGET_URL` | — |
| performance | ⚠ partial | No NFRs stated for orders; invoice list has a 2s target | k6 vs `PERF_TARGET_URL` /invoices?status=overdue | no throughput NFR — Q-004 |
| unit | ✅ | Overdue rule (BR-012) and invoice totals are in-process logic | `backend:src/Invoicing/OverduePolicy.cs#IsOverdue @ 3e4f5a6`, `…PriceCalculator.cs#Total @ 3e4f5a6` | `IsOverdue` reads the wall clock directly — TESTABILITY-GAP (seam: IClock) |
| accessibility | ✅ | Finance UI screens (list, void dialog) are user-facing; UK public-sector customers | `BASE_URL` → /invoices list + void dialog states; registry test ids | no element registry rows for the dialog yet |
| mobile | ⚠ partial | Technician app shows the invoice; voiding is web-only | framework `src/screens/invoices/*` (android + ios), deep link `invoices/{id}` | no iOS build in the artifact feed — Q-006 |
```

Applicability rubric per type:

- **api** — a machine contract exists (OpenAPI, documented endpoints). Entry points = base URL + endpoints.
- **integration** — behaviour spans services, jobs, queues, or the DB, and is observable below the UI. Entry points = the seam (DB, queue, webhook, job trigger).
- **e2e** — a user-facing journey with observable UI outcomes. Entry points = pages/routes and the personas that use them.
- **security** — authn/authz rules, roles, PII, money movement, or user-supplied input surfaces. **Scope guardrail:** security testing targets ONLY the team's own application in the authorized test environments named in §Application under test / §Environments — standard practice only (OWASP-Top-10-derived cases, authn/authz matrices, input validation, ZAP baseline scan); no exploit development, no testing of third-party systems.
- **performance** — stated NFRs/SLOs, known load patterns, or latency-sensitive journeys. No NFR ≠ not applicable — mark ⚠ and raise a question proposing default SLOs.
- **accessibility** — the feature has user-facing screens/states (forms, tables, dialogs, notifications). Entry points = routes + states + registry test ids; conformance target from `§Accessibility` (default WCAG 2.2 AA). Pure API/back-office jobs → `—`.
- **mobile** — the feature is reachable in the native app (screens in the mobile framework's `src/screens/**` or the app repo), or its behaviour depends on device conditions (offline capture, camera, push, deep links, biometrics). Entry points = screen objects + deep-link paths + the platforms; the app build source and device matrix come from `§Mobile testing`. Web-only features → `—`.
- **unit** — the REQ encodes a computation, validation, transformation, or state rule that lives in
  in-process code (a calculator, validator, mapper, policy, state machine) resolvable through
  `grounding-in-code` to a symbol. Entry points = the symbol citations. Symbol not resolvable →
  ⚠ with `TESTABILITY-GAP` (still designable from the spec); logic that only exists across a DB/
  service seam → `—` here and ✅ under integration. Pure UI/presentation → `—`.

Then close the loop with the **REQ × type coverage map** — the exit gate reads this table:

```markdown
| REQ | unit | api | integration | e2e | security | performance | accessibility | mobile | Testable? |
|---|---|---|---|---|---|---|---|---|---|
| REQ-001 | ✅ | ✅ | — | ✅ | — | ✅ | — | ✅ (offline create) | ✅ |
| REQ-002 | ✅ (TESTABILITY-GAP: IClock) | — | ✅ | ✅ | — | — | — | — | ✅ |
| REQ-003 | ✅ (permission predicate) | ✅ | — | ✅ | ✅ | — | ✅ (void dialog) | — | ✅ |
| REQ-004 | — | — | — | — | — | — | — | — | ⚠ flagged: not testable — see Q-005 |
```

Every REQ row must end ✅ (≥1 type marked) **or** ⚠ with an explicit flag
(`not testable — <reason>`, `blocked — <blocker>`, `manual-only — <reason>`) linked to a
question or risk. Silent gaps are a defect of this skill.

---

## Step 5 — Risk assessment (likelihood × impact)

Score each distinct failure mode implied by the register — not each REQ mechanically; cluster
where sensible.

| Scale | 1 | 2 | 3 |
|---|---|---|---|
| **Likelihood** | stable, simple, well-specified | moderate complexity or churn | new/complex logic, tight timing, integration seams, known-vague spec |
| **Impact** | cosmetic / recoverable | degraded workflow, support load | money, data loss/corruption, security breach, legal/compliance |

`Score = Likelihood × Impact` → **High 6–9** (priority hint P0–P1), **Medium 3–4** (P2),
**Low 1–2** (P3). Priority hints inform `/qa-plan` and case `Priority` fields; they are hints,
not final priorities.

```markdown
| Risk | Description | REQs | L | I | Score | Level | Priority hint |
|---|---|---|---|---|---|---|---|
| R-001 | Overdue job double-flags invoices on re-run (not idempotent) | REQ-002 | 3 | 3 | 9 | High | P0 |
| R-002 | Non-finance role voids an invoice via direct API call | REQ-003 | 2 | 3 | 6 | High | P0 |
| R-003 | Order list pagination drops rows at page boundaries | REQ-005 | 2 | 2 | 4 | Medium | P2 |
```

---

## Step 6 — Ambiguity & conflict log

Log — do not paper over — every place the inputs are unclear or disagree:

- **Ambiguity (`AMB-NNN`)** — a statement that cannot be made verifiable as written: missing
  limits, undefined terms, unspecified error behaviour, "should be fast".
- **Conflict (`CON-NNN`)** — two sources that disagree: BRD says invoices go overdue at 30
  days, OpenAPI example shows `overdueAfterDays: 45`.

For each entry, attempt resolution **in this order** before it may become a user question:
(1) elsewhere in the supplied docs; (2) PROJECT-PROFILE §Domain knowledge — when
`<qa-root>/wiki/compiled/index.md` exists, resolve via the index → atomic page and cite it
(e.g. "30 days per BR-012, `<qa-root>/wiki/compiled/business-rules/br-012-….md`"), else the plain
corpus folder; (2b) `§Code knowledge` via `grounding-in-code` when the question is what the system
*does* today (an enum, a bound, an example value) — cite `<layer>:<path>#<symbol> @ <sha>`; code is
behaviour, not intent, so a code/BRD disagreement stays a CON-### for the PM; (3) a documented
assumption with a stated default. Only what survives all
three becomes an open question.

```markdown
| ID | Kind | Description | Sources | Resolution | Status |
|---|---|---|---|---|---|
| AMB-001 | Ambiguity | "Invoice list loads quickly" — no numeric target | docs/invoicing-brd.md:L140 | Assumed p95 < 2s (industry default) — confirm via Q-004 | Assumed |
| CON-001 | Conflict | Overdue threshold: 30 days (BRD) vs 45 (spec example) | docs/invoicing-brd.md:L87; openapi.yaml § POST /invoices | Unresolvable from inputs | → Q-002 (blocking) |
```

---

## Step 7 — Open questions (ask-user-last discipline)

Questions are the LAST resort, asked in ONE batch at the END of the analysis — never
mid-analysis one at a time, and never for anything Steps 1–6 could resolve. Each question
carries a proposed default so work can proceed if the user accepts it.

- **Blocking** — planning would be built on a guess about scope, money, security, or contract
  behaviour (e.g. CON-001). `/qa-plan` must not start while any blocking question is open.
- **Non-blocking** — a documented assumption covers it; planning may proceed, the answer
  refines later phases.

```markdown
| Q | Question | Linked | Proposed default | Blocking? |
|---|---|---|---|---|
| Q-002 | Is the overdue threshold 30 or 45 days? | CON-001, REQ-002 | 30 (BRD is the newer document) | Yes |
| Q-004 | What is the latency SLO for the invoice list? | AMB-001 | p95 < 2s, error rate < 1% | No |
```

After writing the artifact, present the blocking questions to the user verbatim and record
answers back into the artifact (update Status columns; convert answers into REQ edits, never
into renumbering).

---

## Step 8 — Write the artifact

Write `<qa-root>/analysis/<slug>/YYYY-MM-DD-analysis.md` (today's date) with EXACTLY these sections,
in this order — downstream skills parse them by heading:

```markdown
# QA Analysis — <slug> — YYYY-MM-DD

**Change type:** new_project | update_existing | add_feature
**Mode:** greenfield | brownfield
**Enabled test types (profile §Test types):** <list>
**Inputs analyzed:** <bulleted list with citation anchors>

## 1. Workspace detection
## 2. Requirement register (REQ ↔ source)   <!-- + ### AC register (AC ↔ REQ) -->
## 3. Delta analysis            <!-- brownfield only; otherwise "Not applicable (greenfield)" -->
## 4. OpenAPI endpoint inventory <!-- or "No API spec supplied" -->
## 5. Testability matrix & REQ × type coverage map
## 6. Risk assessment
## 7. Ambiguities & conflicts
## 8. Assumptions
## 9. Open questions
## 10. Recommended scope for planning   <!-- modules, priority-ordered REQs, suggested type emphasis -->
```

Section 10 ends with a `Deploy impact:` line: `db` when the handoff's `## Interfaces changed` names a schema change or MIG id, or existing rows are rewritten (say which: backfill, transform, split-merge, type-change, delete, import); `api` when a request or response contract changes; otherwise `none`. Cite the evidence. `/qa-plan` turns it into the §30 keys.

Section 8 lists every assumption made anywhere above in one place — planning treats these as
facts-until-corrected.

A ready-to-fill skeleton of this artifact ships at `<qa-root>/_templates/analysis.md`
(copy it into `<qa-root>/analysis/<slug>/`, renamed with today's date). The headings above remain the
contract — if the template and this skill ever disagree, this skill wins.

---

## Exit criteria (measurable — verify before handoff)

**All change types:**
- [ ] Every extracted requirement has a permanent REQ id and ≥1 source citation.
- [ ] Every acceptance criterion in the inputs is in the AC register, verbatim, mapped to one REQ (or the register says none were supplied).
- [ ] REQ × type coverage map complete: every REQ is ✅ testable in ≥1 enabled type OR ⚠ flagged with a linked question/risk. Zero unmarked rows.
- [ ] Testability matrix covers every enabled §Test types entry with Applicable?/Why/Entry points filled.
- [ ] Every risk has L, I, and Score; every High risk names its REQs and a P0/P1 hint.
- [ ] Every ambiguity/conflict is Resolved, Assumed (listed in §8), or escalated to §9.
- [ ] Artifact exists at `<qa-root>/analysis/<slug>/YYYY-MM-DD-analysis.md` with the fixed sections.

**Per change type, additionally:**
- **`new_project`** — every endpoint in the OpenAPI inventory (if present) maps to ≥1 REQ; every module named in the inputs appears in the register; §10 proposes a baseline scope for every enabled type.
- **`update_existing`** — delta table classifies 100% of prior REQs (New/Changed/Removed/Unchanged); every Changed/Removed REQ lists its impacted Case IDs from the plan's traceability table; no REQ renumbered or deleted.
- **`add_feature`** — the new slug's REQs follow Step 2.3 (handoff ids verbatim, else `REQ-001` up for this slug — never another slug's sequence); impacted existing cases (from the impact note's `## 3. Existing cases to re-verify`, or the traceability tables of the touched modules) are listed by Case ID with their owning slug, as `/qa-plan`'s re-verify input; integration points between the new feature and existing modules are captured as REQs or risks; unchanged prior REQs carried forward untouched.

## Done checklist

- [ ] Slug confirmed and workspace detection logged in §1.
- [ ] Blocking questions asked in one batch; answers written back (or explicitly deferred by the user).
- [ ] Chat summary given: REQ count (new/changed for brownfield), High-risk count, per-type applicability one-liner, open-question count (blocking vs not).
- [ ] Handoff offered: "Analysis complete at `<qa-root>/analysis/<slug>/YYYY-MM-DD-analysis.md`. Run `/qa-plan` to generate the strategy and test plan (skill: `planning-tests`)."

Do NOT design test cases, write scripts, or touch `<qa-root>/plans/` here — that is `/qa-plan`
(`planning-tests`) and `/qa-design` territory.
