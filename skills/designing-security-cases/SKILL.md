---
name: designing-security-cases
description: Use to design OWASP-derived security cases: authz matrix, injection, session, sensitive data; own app only (/qa-design --type security).
version: 1.2.0
---

# Designing Security Test Cases

> Profile first, by section (`profile.mjs`): it defines `§Project`, `§Application under test`,
> `§Test types`, `§Environments`, `§Quality gates`, `§Domain knowledge`, and `§Test management`.
> The QA root defaults to `<qa-root>/` (profile-overridable).


> **Domain grounding**: when `<qa-root>/wiki/compiled/index.md` exists, resolve every domain term,
> business rule (BR-###), and persona through it — open the index, follow the scoping link, read
> the atomic page WHOLE, cite the page + its `sources:` entry. Wiki silence is a reported gap,
> never a guess. No compiled wiki → the plain `§Domain knowledge` folder.

## Authorization guardrail — read before designing anything

Security tests target **ONLY the team's own application**, in **authorized test environments** (the app
named in `§Application under test`, the environments named in `§Environments` whose "Security testing
authorized" column is `yes`). Standard practice only: OWASP-Top-10-derived cases, authn/authz matrices,
input-validation checks, and a ZAP baseline (passive) scan. **No exploit development. No testing of
third-party systems** — external identity providers, payment gateways, and any host not named in the
profile are out of scope even when the app links to them. Every case records this scope in its
`## Authorization` section (environment + scope statement). A case that cannot be run inside that scope
is not designed — it is flagged for a human.

## Action
Design security test cases for one feature slug — **one file per case** under
`<qa-root>/cases/security/<module>/` — and append their rows to the plan's traceability table. This skill
designs cases only; `generating-security-script` turns them into runnable artifacts under
`<qa-root>/scripts/security/` — a ZAP baseline config for the scan-type cases plus authz spec files (mirroring
case paths 1:1) for the matrix cases (`/qa-script --type security`, run by `test:security`).

## Inputs — resolve before designing (STOP conditions)
1. `<slug>` — the feature slug (argument; else the most recently dated folder under `<qa-root>/plans/`; ask if ambiguous).
2. **Analysis**: latest `<qa-root>/analysis/<slug>/YYYY-MM-DD-analysis.md` — requirements (`REQ-<id>`), endpoint
   inventory, **roles/permissions**, data sensitivity notes. Missing → STOP: run `/qa-analyze` first.
3. **Plan**: latest `<qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md` with its `## Traceability (Requirement ↔ Case)`
   skeleton. Missing → STOP: run `/qa-plan` first.
4. `security` enabled in `§Test types` and the plan. Disabled → STOP and report.
5. Roles must come from the analysis or `§Domain knowledge` — never invented. No roles documented →
   design only the unauthenticated axis and flag the missing role model in the summary.

---

## Step 1: Map the app's surfaces

From `§Application under test` and the analysis, enumerate the surfaces this feature exposes — each case
targets a named surface: web UI forms/inputs · API endpoints (the analysis inventory) · authentication
endpoints (login/logout/refresh/reset) · file upload/download · admin/config screens · error pages.

## Step 2: OWASP-Top-10-derived checklist — mapped to those surfaces

Walk every row; for each, design cases for the surfaces it applies to, or record `N/A — <reason>` in the
summary. Coverage is judged against this table.

| OWASP ref | Risk | Case seeds (this feature's surfaces) |
|---|---|---|
| A01 | Broken Access Control | the full authn/authz matrix (Step 3); IDOR — another user's/tenant's object id on every id-carrying endpoint; forced browsing to admin routes |
| A02 | Cryptographic Failures | sensitive fields (from data-sensitivity notes) never in URLs, logs, or plain responses; TLS-only endpoints; password/PII never echoed |
| A03 | Injection | Step 4 input-validation cases — SQLi/XSS/command payloads into the app's OWN inputs |
| A04 | Insecure Design | business-logic abuse from `§Domain knowledge` rules — negative flows (approve own order, pay a negative invoice total) |
| A05 | Security Misconfiguration | security headers, verbose errors, directory listing, default creds — covered by the ZAP baseline scan case |
| A06 | Vulnerable Components | note as a pipeline concern for the report — no per-feature case unless the analysis names a component |
| A07 | Identification & Auth Failures | Step 5 session/token cases; brute-force lockout; password-reset flow abuse |
| A08 | Software & Data Integrity | unsigned/tampered payloads where the app consumes them (webhooks declared in the seam map) |
| A09 | Logging & Monitoring Failures | security-relevant action produces an audit record (verify via the app's own audit surface, if declared) |
| A10 | SSRF | any user-supplied URL field (callbacks, imports) — internal address → rejected |

## Step 2b: Surface classes beyond the Top 10

Classify each surface from Step 1 with the table in
[`references/security-heuristics.md`](references/security-heuristics.md) (read it once per session)
and apply every matching class: access-control depth, session lifecycle, token/key binding,
recovery and assurance, browser trust, data isolation, messages/callbacks, AI features (with their
adversarial variants), app entry points, bounded resources. Record each class as applied or
`N/A — <reason>` beside the OWASP rows.

## Step 3: Authn/authz matrix — role × resource × action

1. Rows = roles (analysis/`§Domain knowledge`) **plus `unauthenticated`**; columns = this feature's
   resources × actions (create/read/update/delete/approve…).
2. Fill each cell **allowed / denied** from the documented permission model; a cell nobody documented is
   `UNKNOWN` — flag it, never assume.
3. Design cases: **every denied cell** is asserted (401 for unauthenticated, 403 for wrong role, and
   cross-tenant/other-user id → blocked); allowed cells get representative positives (the deny side is
   the security case). Cluster one case per role per resource rather than one per cell.
4. Include vertical (user → admin action) and horizontal (user A → user B's data) escalation cases.

## Step 4: Input-validation / injection cases — on the team's OWN app only

For each user input surface (form fields, query/body params, upload filenames, headers the app reads):
- SQLi probe strings (`' OR 1=1--`, `'; DROP…`), XSS payloads (`<script>`, event-handler attrs),
  command/template-injection markers, oversized/binary/unicode inputs, path-traversal (`../`) in file names.
- **Expected = the app safely rejects or neutralizes**: 4xx with the standard error shape, payload stored
  inert/escaped (verified on read-back), no 500, no reflected script execution, no stack trace. Never
  assert "the exploit succeeds" — the case proves the defense holds.
- Only the app's own inputs; never probe an upstream/third-party host the app calls.

## Step 5: Session / token & sensitive-data cases

- **Session/token (A07):** expired token → 401; tampered/forged signature → 401; token reuse after
  logout → 401; missing CSRF token on state-changing form (if the app uses cookie auth) → rejected;
  brute-force → lockout/throttle after N attempts (if the analysis states the policy).
- **Sensitive-data (A02):** password/PII fields never returned in responses, never in URL query strings,
  never logged; secure/httpOnly flags on auth cookies; HTTPS enforced on auth endpoints.

## Step 6: Placement, naming, reconcile

- Path (contract — exact): `<qa-root>/cases/security/<module>/TC-SEC-<MODULE>-<NNN>-<short-desc>.md` —
  `<module>` lower-kebab, `<MODULE>` UPPER, `<NNN>` sequential per module folder, `<short-desc>`
  lowercase-kebab (matches the script generators' mirror examples). **Case ID = `TC-SEC-<MODULE>-<NNN>`.** Not derivable → `resolving-test-placement`; never guess.
- **Feature linkage = the `**Feature:** <slug>` header, never the filename.** Consumers use the plan's
  traceability table or grep `**Feature:** <slug>` under `<qa-root>/cases/` — NEVER glob `<slug>.md` filenames.
- **Check-then-upsert, never blind-append:**
  1. Glob `<qa-root>/cases/security/<module>/TC-SEC-*.md`; read each `**Feature:**`, title, `@req:`/OWASP ref.
  2. Identity = covered REQ set + OWASP ref + normalized title — never the `<NNN>`.
  3. Match → UPDATE in place (keep filename/`<NNN>`, preserve `@tms:` tags). No match → CREATE at next `<NNN>`.
     Orphans (REQ dropped) → flag, don't delete.
  4. Report **created N · updated M · unchanged K · orphaned P**.

## Step 7: Write each case file (never print cases to chat)

```markdown
# TC-SEC-<MODULE>-<NNN> — [<Module>] <METHOD /path | operationId> — <Actor> <action> [<condition>] → <expected>
**Feature:** <slug>  **Plan:** <qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md
**Type:** security  **Module:** <module>  **Priority:** P0–P3
**AC:** <AC-NNN, … from the analysis AC register | —>
**Tags:** @security @<module> @P<n> [@req:<id>] @agentic:gen

## Objective
<ONE sentence — the single intent this case proves; a second intent is a second case>

## Technique
- decision-table → authz, negative   <!-- role × resource × action -->

## Isolation
- creates: <entities this case creates — run-unique keys>
- cleans: <teardown: what is deleted, reverse order, idempotent>
- actor: pool `<role>` (from <qa-root>/docs/test-data.md § Pool accounts)
- lock: none   <!-- or the shared state that cannot be isolated -->

## OWASP ref
- A01 Broken Access Control  <!-- one or more rows from the Step 2 table this case exercises -->

## Authorization
- Target: <app name from §Application under test> — surface: <named surface>
- Environment: <env from §Environments with Security testing authorized = yes>
- Scope: own application only; standard security testing (no exploit development, no third-party systems)

## Preconditions
- <role accounts available (creds from <qa-root>/.env.<env>); test data created via API/builder, never ambient>

## Steps
1. Action: GET /orders/{other-users-id} authenticated as role=user
   Expected: 403 (or 404 per contract); never the other user's body
2. Action: POST /admin/settings authenticated as role=user
   Expected: 403; no state change (verify via read-back)

## Expected Result
- <overall: the control holds — access denied / input neutralized / secret not exposed — as stepped above>

## Data
<!-- Reusable data preconditions as [DATA:<entity>-<state>] tokens — resolved by managing-test-data -->
- Payloads / probe strings used; role accounts exercised; matrix cells covered; UNKNOWN cells flagged
- COVERAGE-GAPs (undocumented policy → cannot assert): <list or "none">
```

**Title** (CONTRACTS §7 Title; lint-checked): `[<Module>]` = the module folder in Title Case · <METHOD /path | operationId> · the actor as a role (never "the user") + action + condition · `→` an observable outcome. No "Verify that"/"Ensure"/bare "successfully"/"works"; one outcome; ≤ 120 chars. Example: `TC-SEC-PROJECTS-001 — [Projects] DELETE /projects/{id} — Viewer deletes a project → 403, project still readable`.

**Priority** (CONTRACTS §7 Priority): start from the REQ's priority (analysis §6 hint); P0 only for the main success path of a P0 REQ, an authz/security denial or data loss/money/irreversible state; main negatives and error contracts → P1; boundaries, alternative paths, rarer roles → P2; cosmetic/copy/rare edges → P3. Never above the REQ unless a denial or data-integrity case, with a one-line `Priority reason:` under the header. Header, `@P<n>` and the traceability Priority are one value.

**Grounding first** (CONTRACTS §7): before writing a case, open the sources it rests on (the wiki pages for its BRs, the impact note, the code citation) and list them under `## Grounding`; a source you did not open is not cited.

Skeleton: `<qa-root>/_templates/case-security.md` (CONTRACTS §7). `## Objective` is one sentence; `## Technique` uses the §7
vocabulary and names the axes it buys (`npm run qa:score` counts them per REQ and fails a P0/P1 REQ
without negative — and, for api, authz and error-contract — coverage); `## Isolation` says what the case
creates, cleans and which pool actor it uses so cases run in parallel; `**AC:**` lists the AC ids it
proves (add the Case ID to the plan's `## AC coverage` row for each). Techniques:
[`test-design-techniques.md`](../qa-phase-protocol/references/test-design-techniques.md).

Priority: P0 = access-control / auth bypass on sensitive resources (gate: 0 unresolved High/Critical per
`§Quality gates`), P1 = injection/session on primary surfaces, P2 = headers/verbose-errors, P3 = rare.
Calibrate by what a failed defense would show — the anchor table at the end of
`references/security-heuristics.md`; a case that crosses no boundary (bare missing header) is P3.

### Tags — derived, never invented
Vocabulary at exact path `<qa-root>/docs/tag-taxonomy.md`. Fixed order:
`@security @<module> @P0|@P1|@P2|@P3 [@req:<id>] [@tms:<id>] @agentic:gen` — `@req:` one per covered
requirement; `@tms:<id>` ONLY when a real work-item id exists (written by `publishing-test-cases`
post-publish, never fabricated from `<NNN>`); `@agentic:gen` always.

> **Project setup required:** `<qa-root>/docs/tag-taxonomy.md` must exist at that exact path; if missing, seed
> it with the ordered scheme above before tagging.

## Step 8: Append traceability rows to the plan

ONE row per Req ↔ Case pair in the plan's `## Traceability (Requirement ↔ Case)` table — exactly these columns:

| Req | Case ID | Type | Module | Priority | Scripted | Last run | Status | Report |
|---|---|---|---|---|---|---|---|---|
| REQ-003 | TC-SEC-ORDERS-001 | security | orders | P0 | ❌ | — | — | — |

Designing appends with `Scripted` ❌, run columns `—` (`generating-security-script` flips ✅;
`executing-tests` fills the rest). On UPDATE, refresh existing rows — no duplicates. Any in-scope REQ or
OWASP row with no case → `⚠️ No case covers <REQ/OWASP-ref>` note below the table.

### Escape backfill (CONTRACTS §13)
If `<qa-root>/defects/ESCAPES.md` has a row for this slug with `Backfill` = `pending` whose defect's
`### Backfill` names the subject / endpoint / screen this case covers, set that row's `Backfill` cell to
the new Case ID (comma-append when several) — the ledger is how `/qa-metrics` proves the hole closed.

## Step 9: Report ONLY this summary to chat

```
✓ Reconciled <qa-root>/cases/security/: created {N} · updated {M} · unchanged {K} · orphaned {P}
✓ Appended traceability rows to <qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md
OWASP coverage: {refs covered} | N/A: {refs + reason} | UNKNOWN authz cells: {n, flagged}
Surface classes: {applied} | N/A: {classes + reason}
REQs covered: {ids} | Uncovered: {ids or "none"} | COVERAGE-GAPs: {n}
Scope confirmed: {app} on {authorized env} — own app only
Next: /qa-script --type security  (ZAP baseline config + authz specs → <qa-root>/scripts/security/, run by `test:security`)
```

---

## Common pitfalls
1. Designing a case that targets a third-party host the app integrates with — out of scope; flag, don't design.
2. Asserting an exploit succeeds — the case must prove the defense holds (rejects/neutralizes/denies).
3. Sampling authz on one endpoint "as representative" — every denied cell and every id-carrying endpoint (IDOR) is checked.
4. Inventing a role or permission the docs don't state — mark the cell UNKNOWN and flag it.
5. Running against an environment whose §Environments row forbids security testing.
6. Blind-appending on re-run, renumbering on update, or fabricating `@tms:` ids.
7. Testing one route to a state change and calling it covered — bulk, import, legacy and GraphQL twins
   get the same denial.
8. Asserting a control that lives outside the repo and the profile (proxy, IdP, CDN) — `COVERAGE-GAP`.

## Done — ALL must be true
- [ ] `## Authorization` scope recorded on every case; no case targets a third-party host or an unauthorized env.
- [ ] OWASP Top 10 walked; each row has cases or a recorded `N/A — reason`.
- [ ] Every surface classified against `references/security-heuristics.md`; each class applied or `N/A — reason`.
- [ ] Authn/authz matrix built; every denied cell asserted; escalation (vertical+horizontal) + IDOR covered; UNKNOWN cells flagged.
- [ ] Input-validation cases assert the defense holds, never the exploit; on the app's own inputs only.
- [ ] Session/token + sensitive-data cases designed for the surfaces that apply.
- [ ] One file per case at `<qa-root>/cases/security/<module>/TC-SEC-<MODULE>-<NNN>-<short-desc>.md` with `**Feature:**`/`**Plan:**` headers and `## OWASP ref` + `## Authorization` sections.
- [ ] Reconciled by identity; orphans flagged, not deleted; tags in fixed order; traceability rows appended (`Scripted` ❌); gaps ⚠️-flagged.
- [ ] Only the Step 9 summary printed to chat.
