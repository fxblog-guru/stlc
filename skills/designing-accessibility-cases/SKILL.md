---
name: designing-accessibility-cases
description: Use to design WCAG 2.2 AA cases per screen state: axe, keyboard, focus, reflow; @manual for human checks (--type accessibility).
version: 1.0.0
---

# Designing Accessibility Test Cases (WCAG 2.2 AA)

> Profile first, by section (`profile.mjs`) — `§Test types` (is `accessibility` enabled),
> `§Accessibility` (conformance target, in-scope screens, failing impacts, viewports),
> `§Application under test` (element registry), `§Quality gates`, `§Domain knowledge`.
> QA root defaults to `<qa-root>/`.

> **Domain grounding**: personas and business rules resolve through `<qa-root>/wiki/compiled/index.md`
> when it exists (cite page + `sources:`); wiki silence is a gap. **Code grounding**: screen
> routes, component names, and test ids beyond the element registry resolve through
> `grounding-in-code` and are cited `frontend:<path>#<component> @ <sha>` in `## Data`.

## Prime directive — a screen STATE is the unit, and the criterion is the claim
Accessibility defects hide in states, not pages: the empty list, the validation error, the open
modal, the loading skeleton, the 320-px reflow. Every case names the exact screen + state it
proves and the WCAG success criteria (SC) it covers. "Page is accessible" is not a case; "the
order form's validation errors are announced (SC 3.3.1, 4.1.3) and focus moves to the first
invalid field (SC 2.4.3)" is.

## Action
Design accessibility cases for one feature slug — **one file per case** under
`<qa-root>/cases/accessibility/<module>/` — and append their rows to the plan's traceability table.
`generating-a11y-script` automates the `automated` cases with axe-core + Playwright
(`/qa-script --type accessibility`, run by `test:a11y`); `manual` cases stay designed, tagged
`@manual`, and are executed by a human (their evidence is a session sheet or a run note).

## Inputs — resolve before designing (STOP conditions)
1. `<slug>`; latest analysis (UI REQs, personas, screens) and plan with the traceability skeleton — missing → STOP.
2. `accessibility` enabled in `§Test types` and in the plan; `§Accessibility` filled (target defaults
   to `WCAG 2.2 AA`; in-scope screens default to "every screen an e2e case of this slug visits").
3. **Screen inventory sources**, in order: the slug's e2e cases (`**Feature:** <slug>` under
   `<qa-root>/cases/e2e/`), `<qa-root>/docs/element-registry.md` (screens + test ids), the analysis UI REQs,
   `grounding-in-code` for routes/components. No screens resolvable → STOP: nothing to design.

## Step 1: Screen × state inventory
For each in-scope screen list its states: `default` · `empty` · `loading` · `error/validation` ·
`modal/drawer open` · `filtered/sorted` · `success/toast` · `320-px reflow` · `dark/high-contrast`
(when the app ships it). Record which states an existing e2e case already reaches (reuse its
preconditions verbatim) and which need a new setup path.

## Step 2: WCAG 2.2 AA checklist → check kind
Walk `references/wcag22-checklist.md` (SC → axe rule ids → automated | manual method) per
screen state. The split is fixed by what a machine can prove:

| Kind | Proves | How |
|---|---|---|
| `automated` | contrast, names/roles/values, labels, landmarks, headings, lang, duplicate ids, image alt, ARIA validity, link purpose (text), target size (2.5.8, partially), reflow at 320 px (layout does not scroll horizontally), tab order over registry-known stops, focus moves to a named element | axe-core rules + Playwright assertions (`expectNoA11yViolations`, `expectTabOrder`, viewport) |
| `manual` | screen-reader announcement quality, meaningful sequence, focus visibility across themes, motion/animation, timing, consistent help (3.2.6), redundant entry (3.3.7), accessible authentication (3.3.8), dragging alternatives (2.5.7), focus not obscured (2.4.11) | a human with NVDA/VoiceOver + keyboard; the case tells them exactly what to observe |

A criterion nobody can check on this app (no such component) is recorded `N/A — reason` in the summary.

## Step 3: Case seeds (minimums per feature)
- **Per screen state** → 1 `automated` axe case (P1 when the state sits on a P0 journey, else P2)
  covering the SC axe can prove for that state. Cluster: one case per screen listing its states as
  steps, when the states share preconditions; separate cases when a state needs its own setup.
- **Per interactive screen** → 1 keyboard case: tab order over the screen's registry test ids,
  Escape closes overlays, Enter/Space activate, no keyboard trap (2.1.1, 2.1.2, 2.4.3, 2.4.7).
  `automated` when every stop has a registry test id; otherwise `manual` with the stops listed.
- **Per form** → 1 validation case: errors identified in text (3.3.1), suggestions (3.3.3), labels
  (3.3.2, 1.3.1), status announced (4.1.3), focus to first invalid field (2.4.3). Usually `automated`
  for 1.3.1/3.3.2/4.1.3 (axe + `aria-live` assertion) + `manual` twin for announcement quality.
- **Per screen with overlays** → 1 focus-management case: focus enters the dialog, returns to the
  trigger on close, background inert (2.4.3, 4.1.2).
- **Per data-heavy screen** → 1 reflow case at 320 px CSS width (1.4.10) + zoom 200 % (1.4.4).
- **WCAG 2.2 additions** → target size 2.5.8 on dense toolbars (`automated`, axe `target-size`),
  focus not obscured 2.4.11 on sticky headers (`manual`), accessible authentication 3.3.8 on login
  (`manual`), redundant entry 3.3.7 on multi-step forms (`manual`).

## Step 4: Placement, naming, reconcile
- Path (contract): `<qa-root>/cases/accessibility/<module>/TC-A11Y-<MODULE>-<NNN>-<short-desc>.md`;
  `<module>` = the plan's business module of the screen (via `resolving-test-placement`).
- Identity = screen + state set + SC set + check kind — never the `<NNN>`. Check-then-upsert
  (glob the module folder, read `**Feature:**`, `## Scope`, `## WCAG ref`); match → update in
  place, no match → create at the next `<NNN>`; orphans flagged, never deleted. Report
  **created N · updated M · unchanged K · orphaned P**.

## Step 5: Write each case file (never print cases to chat)

```markdown
# TC-A11Y-<MODULE>-<NNN> — [<Module>] <Screen or dialog> — <Actor> <action> [<condition>] → <expected>
**Feature:** <slug>  **Plan:** <qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md
**Type:** accessibility  **Module:** <module>  **Priority:** P0–P3
**AC:** <AC-NNN, … from the analysis AC register | —>
**Tags:** @accessibility @<module> @P<n> [@manual] [@req:<id>] @agentic:gen

## Objective
<ONE sentence — the single intent this case proves; a second intent is a second case>

## Technique
- checklist                          <!-- WCAG 2.2 AA -->

## Isolation
- creates: <entities this case creates — run-unique keys>
- cleans: <teardown: what is deleted, reverse order, idempotent>
- actor: pool `<role>` (from <qa-root>/docs/test-data.md § Pool accounts)
- lock: none   <!-- or the shared state that cannot be isolated -->

## WCAG ref
- WCAG 2.2 AA — 1.4.3, 4.1.2, 2.4.7   <!-- bare SC ids; the conformance target first -->

## Scope
- Screen: <route from the registry / e2e case> · State(s): <default | empty | validation error | modal open …>
- Viewport: <1280×800 | 320 CSS px reflow | both> · Check kind: automated | manual
- Excluded regions: <selector + reason, e.g. `#third-party-chat` — vendor widget, not ours> (or none)

## Preconditions
- <state setup — API-seeded where an e2e case seeds it; [DATA:<entity>-<state>] tokens>

## Steps
1. Action: open <route>, reach state <default>; run axe with WCAG 2.2 A/AA tags
   Expected: 0 violations of impact critical/serious; moderate/minor listed as findings
2. Action: Tab from the page start through <stop-1 test id>, <stop-2>, <stop-3>
   Expected: focus lands on each in that order; focus ring visible on every stop (2.4.7)
3. Action: submit the form empty
   Expected: each required field's error is in text and linked via aria-describedby (3.3.1, 1.3.1); the first invalid field receives focus (2.4.3); the error summary is announced via aria-live (4.1.3)
<!-- manual cases: each step states WHAT the tester does and WHAT they must observe/hear -->

## Expected Result
- <the SC set holds on every listed state; failing impacts = 0; findings recorded>

## Data
- Test ids used: <from <qa-root>/docs/element-registry.md, verbatim>
- Code citations: <frontend:<path>#<component> @ <sha> for components the registry lacks>
- COVERAGE-GAPs: <SC that cannot be checked here — reason> (or none)
```

**Title** (CONTRACTS §7 Title; lint-checked): `[<Module>]` = the module folder in Title Case · <Screen or dialog> · the actor as a role (never "the user") + action + condition · `→` an observable outcome. No "Verify that"/"Ensure"/bare "successfully"/"works"; one outcome; ≤ 120 chars. Example: `TC-A11Y-CUSTOMERS-001 — [Customers] Customers list — Keyboard user tabs through filters and table → focus order matches visual order`.

**Priority** (CONTRACTS §7 Priority): start from the REQ's priority (analysis §6 hint); P0 only for the main success path of a P0 REQ, an authz/security denial or data loss/money/irreversible state; main negatives and error contracts → P1; boundaries, alternative paths, rarer roles → P2; cosmetic/copy/rare edges → P3. Never above the REQ unless a denial or data-integrity case, with a one-line `Priority reason:` under the header. Header, `@P<n>` and the traceability Priority are one value.

**Grounding first** (CONTRACTS §7): before writing a case, open the sources it rests on (the wiki pages for its BRs, the impact note, the code citation) and list them under `## Grounding`; a source you did not open is not cited.

Skeleton: `<qa-root>/_templates/case-accessibility.md` (CONTRACTS §7). `## Objective` is one sentence; `## Technique` uses the §7
vocabulary and names the axes it buys (`npm run qa:score` counts them per REQ and fails a P0/P1 REQ
without negative — and, for api, authz and error-contract — coverage); `## Isolation` says what the case
creates, cleans and which pool actor it uses so cases run in parallel; `**AC:**` lists the AC ids it
proves (add the Case ID to the plan's `## AC coverage` row for each). Techniques:
[`test-design-techniques.md`](../qa-phase-protocol/references/test-design-techniques.md).

Priority: P0 = a11y blocker on a P0 journey (cannot complete the task by keyboard/screen reader,
or contrast/labels fail on the primary form); P1 = serious violations on P0/P1 screens; P2 =
moderate / secondary screens; P3 = minor.

### Tags — derived, never invented
Order per `<qa-root>/docs/tag-taxonomy.md`: `@accessibility @<module> @P<n> [@manual] [@req:<id>]
[@tms:<id>] @agentic:gen`. `@manual` ONLY on `manual` check-kind cases; `@tms:` only when it
already exists; `@agentic:gen` always.

## Step 6: Append traceability rows to the plan
ONE row per Req ↔ Case pair, `Scripted` ❌, run columns `—`:
`| REQ-005 | TC-A11Y-ORDERS-001 | accessibility | orders | P1 | ❌ | — | — | — |`.
A `@manual` case's `Scripted` stays ❌ for life (reports count it under `manual`). Any in-scope
screen state or SC with no case → `⚠️ No case covers <screen/state | SC>` note under the table.
Append Case IDs to impact-map `TC` cells for every BR cited (`maintaining-impact-map` Mode A).

### Escape backfill (CONTRACTS §13)
If `<qa-root>/defects/ESCAPES.md` has a row for this slug with `Backfill` = `pending` whose defect's
`### Backfill` names the subject / endpoint / screen this case covers, set that row's `Backfill` cell to
the new Case ID (comma-append when several) — the ledger is how `/qa-metrics` proves the hole closed.

## Step 7: Report ONLY this summary to chat
```
✓ Reconciled <qa-root>/cases/accessibility/: created {N} · updated {M} · unchanged {K} · orphaned {P}  (automated {a} · manual {m})
✓ Appended traceability rows to <qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md
Screens × states: {n} inventoried, {c} covered | SC covered: {list} | N/A: {SC + reason}
REQs covered: {ids} | Uncovered: {ids or "none"} | COVERAGE-GAPs: {n}
Next: /qa-script <slug> --type accessibility  (axe + Playwright → <qa-root>/scripts/accessibility/, run by `test:a11y`; manual cases → a session sheet via /qa-explore)
```

## Common pitfalls
1. One "run axe on the home page" case — states and flows are where violations live.
2. Automating announcement quality — axe cannot hear; that is a `manual` case with an exact observation.
3. Excluding a region without a reason — every `exclude` names the vendor/ownership reason in `## Scope`.
4. Copying WCAG text as the Expected — the Expected is observable on THIS screen (which element, which attribute, which order).
5. Guessing test ids — stops come from the registry or a `frontend:` citation; unknown → `COVERAGE-GAP`.

## Done — ALL must be true
- [ ] Screen × state inventory built from e2e cases / registry / analysis; every in-scope state has a case or a ⚠️ note.
- [ ] Every case has `## WCAG ref` (target + bare SC ids) and `## Scope` (screen · states · viewport · check kind · exclusions with reasons).
- [ ] Keyboard, form-validation, focus-management, reflow and WCAG 2.2 additions covered per the Step 3 minimums; manual cases tagged `@manual` with observable steps.
- [ ] Files at `<qa-root>/cases/accessibility/<module>/TC-A11Y-<MODULE>-<NNN>-<short-desc>.md`, `**Feature:**`/`**Plan:**` headers, tags in order; reconciled by identity.
- [ ] Traceability rows appended (`Scripted` ❌); impact-map TC cells appended; only the Step 7 summary printed.
