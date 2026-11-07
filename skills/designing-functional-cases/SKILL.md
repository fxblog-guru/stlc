---
name: designing-functional-cases
description: Use to design e2e UI cases in six categories (happy, validation, edge, negative, impact, touchpoints), REQ-traced (/qa-design --type e2e).
version: 1.0.0
---

# Designing Functional (e2e) Test Cases

> Profile first, by section (`profile.mjs`): it defines `§Project`, `§Application under test`,
> `§Test types`, `§Environments`, `§Quality gates`, `§Domain knowledge`, and `§Test management`.
> The QA root defaults to `<qa-root>/` (profile-overridable); all paths below are relative to it being `<qa-root>/`.


> **Domain grounding**: when `<qa-root>/wiki/compiled/index.md` exists, resolve every domain term,
> business rule (BR-###), and persona through it — open the index, follow the scoping link, read
> the atomic page WHOLE, cite the page + its `sources:` entry. Wiki silence is a reported gap,
> never a guess. No compiled wiki → the plain `§Domain knowledge` folder.
>
> **Code grounding**: endpoint paths, payload/validation rules, and screen/locator facts the analysis
> does not state resolve through `grounding-in-code` (PROJECT-PROFILE `§Code knowledge` → read-only
> source grep) and are cited `<layer>:<path>#<symbol> @ <short-sha>` in `## Data`. Not resolvable →
> `COVERAGE-GAP`, never a guess.

## Action
Design comprehensive functional UI test cases for one feature slug — **one file per case** under
`<qa-root>/cases/e2e/<module>/` — and append their rows to the plan's traceability table. This skill designs
cases only; `generating-e2e-script` turns them into Playwright specs later (`/qa-script --type e2e`).

## Inputs — resolve before designing (STOP conditions)
1. `<slug>` — the feature slug (argument; else the most recently dated folder under `<qa-root>/plans/`; ask if ambiguous).
2. **Analysis**: the latest `<qa-root>/analysis/<slug>/YYYY-MM-DD-analysis.md` — the requirement inventory
   (`REQ-<id>` entries), user flows, and module map. Missing → STOP: run `/qa-analyze` first.
3. **Plan**: the latest `<qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md` — scope, priorities, and the
   `## Traceability (Requirement ↔ Case)` skeleton. Missing → STOP: run `/qa-plan` first.
4. `e2e` must be enabled in `§Test types` and in the plan's scope. Disabled → STOP and report; never design a disabled type.

---

## Step 0: Build the REQ map (MANDATORY before writing anything)

From the analysis file's requirement inventory (plus `§Domain knowledge` rules that touch the feature's modules):

1. Build a **REQ map**: `{ "REQ-<id>": "<one-line behaviour summary>" }` for every in-scope requirement.
2. Classify each requirement's **enforcement direction**:
   - **Permissive** — "allow / enable X when Y" → needs at least one positive (happy-path or edge) case.
   - **Restrictive** — "reject / block / prevent X when Y" → needs at least one **negative** case exercising the rejection branch.
3. Keep the map in working memory — it drives `@req:` tags, the traceability rows, and the gap check in Step 5.

If the analysis lists no requirement ids for a module, note "no REQ entries for <module>" in the summary and cite none — never invent a REQ id.

## Step 1: Generate cases across ALL SIX categories

| Category | Description | Typical count |
|----------|-------------|---------------|
| Happy Path | The main workflow succeeds end to end | 5–7 |
| Validation | Input validation, required fields, format rules | 3–4 |
| Edge Cases | Boundaries, empty states, maximum lengths, zero/one/many | 3–4 |
| Negative | Error handling, invalid input — **plus one per Restrictive requirement** | 3–4 minimum |
| Impact | Adjacent existing features still work after this change | 1–2 |
| Integration touchpoints | Cross-module journeys driven through the UI (order → invoice → payment) | 3–4 |

**Coverage rule:** every REQ in the map appears in at least one case's `@req:` tags. A Restrictive
requirement with no negative case → add one before finishing. (Integration-touchpoint cases here stay
UI-driven; API→DB seam verification belongs to `designing-integration-cases`, not this skill.)

**Appearance is not a journey.** A requirement about how a screen LOOKS or holds its shape — a
layout at 320 px, a long name that must not clip, an empty or error state's visual, brand colors,
dark mode — is a `ui` case (`designing-ui-cases`, `/qa-design --type ui`), not an e2e step. Here the
journey asserts what the user can DO; the `ui` type asserts what they SEE. Name the hand-off in the summary.

## Step 1b: UI risk classes — the bugs scripted journeys miss (mandatory when the class applies)

Step 1 designs the journeys the spec describes. A human exploring the same screen finds more,
because they vary **order, timing, data, roles and tabs** and look at everything on screen. Classify
every in-scope screen/flow against this table and design the case seeds of each class that applies.
Each class's case carries a `## UI risk classes` section naming it (one line per class), so
`/qa-review` can index coverage.

| Class (applies when the screen…) | Case seeds | Playwright tools |
|---|---|---|
| **double-submit / rapid clicks** (submits a create, pay, send) | double-click the submit → exactly ONE request and ONE entity; Enter + click together; submit then Back + resubmit | `dblclick()`, `trackRequests()` (`shared/pages/network.ts`), API read-back count |
| **back / refresh / deep link mid-flow** (multi-step form, wizard, detail page) | refresh on step 2 keeps or clearly resets state; Back after submit does not resubmit; a deep link to step 3 or to a deleted id shows the documented page, never a blank | `page.goBack()`, `page.reload()`, `page.goto(<deep link>)` |
| **two tabs on one record** (edits a record others can edit) | save in tab A, then save a stale copy in tab B → conflict message (or the documented last-write-wins), never a silent overwrite; delete in A, edit in B | two pages of one context (`context.newPage()`), API read-back |
| **role / permission change while open** (role-gated actions) | revoke the role over the API while the page is open, then act → refused with a message, no partial write; grant while open → appears on reload | `pageAs(actor)` + a service call as admin mid-test |
| **session expiry mid-form** (long forms) | clear cookies / expire the session, then submit → sign-in prompt, typed data kept or a clear loss warning; never a raw 401 page | `context.clearCookies()`, Clock API `fastForward` past the session TTL |
| **zero / one / many and hostile data** (lists, names, free text) | empty state; exactly one; page-size + 1; max-length name truncation; unicode, RTL, emoji, zero-width, `<b>` markup shown as text | factories with `build({ name })`, `toMatchAriaSnapshot` |
| **slow or failed network** (any call the screen makes) | delay → loading state visible, controls disabled; abort / 500 → the documented error state and a working retry; no stuck spinner | `page.route(url, r => r.abort())`, `route.fulfill({ status: 500 })`, delayed `route.continue()` |
| **unsaved-changes guard** (editable forms) | edit then navigate away → guard shown; Cancel keeps data; save then navigate → no guard | `page.on('dialog')`, navigation |
| **pagination / sort / filter state** (tables) | set page 2 + sort + filter, open a row, come Back → the same state; state in the URL survives a reload | URL assertions, `goBack()` |
| **timezone / locale display** (dates, money, numbers) | the same instant shown in two `timezoneId`s; DST boundary; `locale` decimal separators; a date near midnight UTC | `test.use({ timezoneId, locale })`, `page.clock.setFixedTime()` |
| **cross-project leak** (shows data scoped to a project, workspace or tenant) | as a member of A and B, open B's record by URL id while in A → not found or denied, never B's data; A's list, search, counts, exports and notifications never contain B's rows, even with a filter that matches them; switch project and Back → no B content cached on screen | two seeded projects (factories), `page.goto(<B's deep link>)`, API read-back of A's list |
| **one pass per role** (the requirements carry a role × screen × action table) | one case per role, its `## Variants` a row per (screen, action) cell: allowed → done and read back; denied → control hidden or disabled **and** the direct URL / API call refused | `pageAs(role)`, the table copied into `## Variants`, a service call per denied cell |
| **AI answer or retrieval** (answers, summarises or searches with a model) | an out-of-scope question set (≥ 5) whose Expected is the documented "not found", never an answer; an in-scope set scored hit@5 (the right source in the top five) at the threshold the spec states; every answer carries a citation that opens its source | a fixed question file in `## Data`, the API's raw response, a citation-link click |
| **keyboard-only path** (every primary journey) | complete the journey with Tab/Enter/Escape only; focus returns after a dialog closes | `page.keyboard`, `expectTabOrder` (`shared/a11y/axe.ts`) |

Rules: a class that applies with **no case** is a **GAP** for `/qa-review` (reviewing-cases indexes
it). A class whose Expected the spec does not settle (conflict message or last-write-wins? keep the
draft or drop it?) becomes ONE `COVERAGE-GAP` + a `/qa-clarify` question — never a guessed message.
Seeds are ordinary e2e cases (Negative or Edge category), one intent each; the class's tool column is
the hint `generating-e2e-script` follows. Golden: `TC-E2E-PROJECTS-005` (two tabs) and `-006`
(double-submit) in the bundle's `tests/golden/qa/`.

## Step 2: Resolve placement and identity PER CASE — never once for the whole slug

- Path (contract — exact): `<qa-root>/cases/e2e/<module>/TC-E2E-<MODULE>-<NNN>-<short-desc>.md`
  - `<module>` = lower-kebab business area the case's steps act on (`orders`, `invoices`, `credit-notes`) —
    one slug can produce cases in several module folders; that is correct and expected.
  - `<MODULE>` = the same token UPPERCASE; `<NNN>` = sequential per module folder (001, 002, …, leading zeros);
    `<short-desc>` = a few lowercase-kebab words from the title (matches the script generators' mirror examples).
  - **Case ID = `TC-E2E-<MODULE>-<NNN>`** — the H1 heading, traceability rows, and the mirrored script name all use it.
- Most cases inherit the analysis file's primary module; override when a case clearly exercises a different
  module. Not derivable from the analysis or the profile → run `resolving-test-placement` and use its answer. **Never guess a path.**
- **Feature linkage travels in the header, never the filename:** every case carries `**Feature:** <slug>`.
  Consumers locate cases via the plan's traceability table or by grepping `**Feature:** <slug>` under
  `<qa-root>/cases/` — NEVER by globbing `<slug>.md` filenames, and the slug is never encoded into the TC filename.

## Step 3: Reconcile with existing cases — check-then-upsert, never blind-append

Re-running `/qa-design` must NOT duplicate scenarios (sequential `<NNN>` would otherwise mint a
`TC-E2E-ORDERS-023` that repeats `TC-E2E-ORDERS-010`). For each designed scenario:

1. **Glob** the target `<qa-root>/cases/e2e/<module>/TC-E2E-*.md`; read each existing case's `**Feature:**`, title, and `@req:` tags.
2. **Identity = covered REQ set (the `@req:` tags) + normalized title** (lowercase, collapse whitespace/punctuation) — NEVER the `<NNN>`.
3. **Match → UPDATE in place.** Keep the existing filename and `<NNN>`; preserve any `@tms:<id>` tag and
   any notes you did not re-derive; rewrite only the body that actually changed. Don't renumber, don't re-title.
4. **No match → CREATE** at the next sequential `<NNN>` for that module folder.
5. **Orphans** — an existing case (matched by `**Feature:** <slug>`) whose REQs no longer exist in the
   analysis: do NOT delete; flag `orphaned: <Case ID> — REQ-<id> no longer in scope; confirm removal`.
6. Count **created N · updated M · unchanged K · orphaned P** for the summary.

## Step 4: Write each case file (never print cases to chat)

One `Write` per case, exactly this format — all downstream skills parse it:

```markdown
# TC-E2E-<MODULE>-<NNN> — [<Module> · <Platform label>] <Screen or dialog> — <Actor> <action> [<condition>] → <expected>
**Feature:** <slug>  **Plan:** <qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md
**Type:** e2e  **Module:** <module>  **Priority:** P0–P3
**Platform:** <web | windows | macos | other:<id> — an enabled §Platforms row (CONTRACTS §20)>
**AC:** <AC-NNN, … from the analysis AC register | —>
**Tags:** @e2e @<module> @P<n> @platform:<id> [@req:<id>] @agentic:gen

## Objective
<ONE sentence — the single intent this case proves; a second intent is a second case>

## Technique
- use-case → journey, positive
- error-guessing → negative

## Isolation
- creates: <entities this case creates — run-unique keys>
- cleans: <teardown: what is deleted, reverse order, idempotent>
- actor: pool `<role>` (from <qa-root>/docs/test-data.md § Pool accounts)
- lock: none   <!-- or the shared state that cannot be isolated -->

## Preconditions
- <setup state — user role, seeded records, environment assumptions>

## Steps
1. Action: <one exact UI action>
   Expected: <verifiable outcome>
2. Action: …
   Expected: …

## Expected Result
- <overall final outcome, verifiable>

## Data
- <test data values or builder reference>
```

**Title** (CONTRACTS §7 Title; lint-checked): `[<Module>]` = the module folder in Title Case · <Screen or dialog> · the actor as a role (never "the user") + action + condition · `→` an observable outcome. No "Verify that"/"Ensure"/bare "successfully"/"works"; one outcome; ≤ 120 chars. Example: `TC-E2E-ORDERS-003 — [Orders] New order dialog — Owner saves without lines → "Add at least one line", nothing saved`.

**Priority** (CONTRACTS §7 Priority): start from the REQ's priority (analysis §6 hint); P0 only for the main success path of a P0 REQ, an authz/security denial or data loss/money/irreversible state; main negatives and error contracts → P1; boundaries, alternative paths, rarer roles → P2; cosmetic/copy/rare edges → P3. Never above the REQ unless a denial or data-integrity case, with a one-line `Priority reason:` under the header. Header, `@P<n>` and the traceability Priority are one value.

**Grounding first** (CONTRACTS §7): before writing a case, open the sources it rests on (the wiki pages for its BRs, the impact note, the code citation) and list them under `## Grounding`; a source you did not open is not cited.

Skeleton: `<qa-root>/_templates/case-e2e.md` (CONTRACTS §7). `## Objective` is one sentence; `## Technique` uses the §7
vocabulary and names the axes it buys (`npm run qa:score` counts them per REQ and fails a P0/P1 REQ
without negative — and, for api, authz and error-contract — coverage); `## Isolation` says what the case
creates, cleans and which pool actor it uses so cases run in parallel; `**AC:**` lists the AC ids it
proves (add the Case ID to the plan's `## AC coverage` row for each). Techniques:
[`test-design-techniques.md`](../qa-phase-protocol/references/test-design-techniques.md).

**Format rules (apply to every case):**
- **Data tokens**: reusable data preconditions are written as `[DATA:<entity>-<state>]` (e.g. `[DATA:user-active]`) — resolved by `managing-test-data` into `<qa-root>/docs/test-data.md`; an undefined token is a review finding.
1. Every step has an `Expected` — no step is complete without verification.
2. One specific UI action per step — click, type, select, navigate, verify; never combined.
3. Exact UI element names — button text, field labels, menu names as shown, with location
   ("Click the 'Save' button at the bottom right of the New Order form").
4. Full navigation paths — "Orders > New Order", "Settings > Users > Add User".
5. One intent per case (`## Objective`); as many steps as the journey needs — a journey is rarely under 3 —
   and no vague instructions ("save the order" is not a step). Extra inputs for the same journey are
   `## Variants` rows, not repeated steps.
6. Priority: P0 = critical business path (gate-blocking per `§Quality gates` — 0 failing P0/P1 before
   sign-off), P1 = every-release, P2 = edge, P3 = rare/cosmetic.

**Step example (orders):**
```
1. Action: Navigate to Orders > New Order
   Expected: the "New Order" form opens with empty Order ID, Customer, and Line Items fields
2. Action: Enter "ORD-001" in the Order ID field
   Expected: "ORD-001" appears in the field with no validation error shown
```

### Tags — derived, never invented
Vocabulary and rules live at the exact path `<qa-root>/docs/tag-taxonomy.md`. Fixed order:

```
@e2e  @<module>  @P0|@P1|@P2|@P3  [@req:<id>]  [@tms:<id>]  @agentic:gen
```

| Slot | Source |
|---|---|
| `@e2e` | this skill's type — always first |
| `@<module>` | the module folder segment, singular-normalised, one tag only |
| `@P<n>` | the case's Priority |
| `@req:<id>` | one per requirement the case covers (from the Step 0 REQ map) |
| `@tms:<id>` | ONLY when a real work-item id exists — written by `publishing-test-cases` after publish, **never fabricated from `<NNN>`**; designing only preserves it on update |
| `@agentic:gen` | always on agent-authored cases |

> **Project setup required:** `<qa-root>/docs/tag-taxonomy.md` must exist at that exact path (single tag
> vocabulary for all test types). If it is missing, seed it with the ordered scheme above before tagging.

## Step 5: Append traceability rows to the plan

In the plan's `## Traceability (Requirement ↔ Case)` table (created empty by `planning-tests` — if the
section is somehow absent, append it with exactly these columns), add ONE row per Req ↔ Case pair:

| Req | Case ID | Type | Module | Priority | Scripted | Last run | Status | Report |
|---|---|---|---|---|---|---|---|---|
| REQ-004 | TC-E2E-ORDERS-001 | e2e | orders | P0 | ❌ | — | — | — |

- Designing appends with `Scripted` ❌ and `Last run`/`Status`/`Report` as `—`. `generating-e2e-script`
  flips `Scripted` to ✅; `executing-tests` fills the run columns. Never add a second table, rename
  columns, or pre-fill run results.
- On an UPDATE (Step 3), refresh that Case ID's existing rows instead of appending duplicates.
- **Impact map:** for each `BR-###` the case cites, `maintaining-impact-map` Mode A appends the Case ID to
  that BR's row for this module in `<qa-root>/docs/impact-map.md` — `TC` cell only; a case citing no BR writes nothing.
- **Gap check:** any REQ from the Step 0 map with no row → add below the table:
  `⚠️ No case covers REQ-<id> — "<summary>". Add a case or confirm intentionally untested.`

### Escape backfill (CONTRACTS §13)
If `<qa-root>/defects/ESCAPES.md` has a row for this slug with `Backfill` = `pending` whose defect's
`### Backfill` names the subject / endpoint / screen this case covers, set that row's `Backfill` cell to
the new Case ID (comma-append when several) — the ledger is how `/qa-metrics` proves the hole closed.

## Step 6: Report ONLY this summary to chat

```
✓ Reconciled <qa-root>/cases/e2e/: created {N} · updated {M} · unchanged {K} · orphaned {P}
✓ Appended traceability rows to <qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md
Categories: Happy Path ({n}) · Validation ({n}) · Edge ({n}) · Negative ({n}) · Impact ({n}) · Integration touchpoints ({n})
UI risk classes: {class → Case IDs, or "n/a: <why>"} | Unsettled (COVERAGE-GAP): {classes or "none"}
REQs covered: {ids} | Uncovered: {ids or "none"}
Orphaned (confirm removal): {Case IDs or "none"}
Next: /qa-script --type e2e  (specs mirror 1:1 → <qa-root>/scripts/e2e/<module>/<same-TC-name>.spec.ts, run by `test:e2e`)
```

---

## Common pitfalls
1. Steps too coarse for automation ("create the order") — one exact UI action per step.
2. Vague expectations — "verify the form works" is not verifiable; state the value and the absence/presence of the error.
3. All cases forced into one module folder — resolve placement per case.
4. Blind-appending on a re-run — always reconcile by identity first.
5. Encoding the slug into filenames or globbing `<slug>.md` — linkage is the `**Feature:**` header only.
6. Designing API/DB-tier assertions here — hand those requirements to `designing-api-cases` / `designing-integration-cases` and say so in the summary.

## Done — ALL must be true
- [ ] REQ map built from the analysis file; every Restrictive requirement has a negative case.
- [ ] All 6 categories covered; each case has one Objective and every step has an observable Expected.
- [ ] Step 1b: every screen classified; every applicable UI risk class has a case naming it in `## UI risk classes`, or a COVERAGE-GAP.
- [ ] One file per case at `<qa-root>/cases/e2e/<module>/TC-E2E-<MODULE>-<NNN>-<short-desc>.md`; heading =
      `# TC-E2E-<MODULE>-<NNN> — [<Module>] <Screen or dialog> — <Actor> <action> → <expected>` (§7 Title); placement resolved per case (via `resolving-test-placement` when not derivable).
- [ ] Every case carries `**Feature:** <slug>` + `**Plan:**` header lines and the exact contract format above.
- [ ] Reconciled, not blind-appended — identity = REQ set + normalized title; updates keep `<NNN>` and `@tms:` tags; orphans flagged, not deleted.
- [ ] Tags in the fixed order, per `<qa-root>/docs/tag-taxonomy.md`; no invented tags; no fabricated `@tms:`.
- [ ] Traceability rows appended (`Scripted` ❌, run columns `—`); uncovered REQs flagged with ⚠️.
- [ ] Only the Step 6 summary printed to chat; no aggregate case file anywhere.
