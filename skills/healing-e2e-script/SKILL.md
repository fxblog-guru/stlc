---
name: healing-e2e-script
description: Use to heal a failing Playwright e2e spec: static pre-flight, root cause, scored locators, three attempts; --bulk (/qa-heal).
version: 1.2.0
---

# Checking & Healing an E2E Script (Playwright)

> Profile first, by section (`profile.mjs`): it defines `§Application under test` (element registry,
> frontend source), `§Test types` (is e2e enabled), `§Environments` (base URLs), `§Quality gates`.
> The QA root defaults to `<qa-root>/`; all paths/commands below run from `<qa-root>/`.

## Scope guardrail
Healing applies to the **e2e tier only**. API/integration/performance/security failures are fixed by
regenerating the script (`/qa-script --type <t>`) or by the dev team — not here. Invoked on a single
spec or slug; `--bulk` (below) is the one exception, after a UI refactor breaks ten or more specs,
and it still produces per-spec evidence.

> **Project setup required:** the commands below are `<qa-root>/package.json`'s own scripts —
> `heal:check` (`tsc --noEmit` + the shipped `<qa-root>/eslint.config.mjs`: no sleeps / networkidle /
> skip / only / conditionals / missing asserts — the locator cross-check against
> `<qa-root>/docs/element-registry.md` is performed by THIS skill, Step 1) and
> `test:e2e` (the Playwright runner). If your platform names its
> pre-flight differently, map it 1:1 — the two-stage flow (static gate first, runtime heal second) is
> what this skill enforces.

This skill is **check-first, then heal**:
1. A fast **offline static gate** (`heal:check`) catches the "won't compile / broke the structure / bad
   locator" class — what a merge, a script edit, or a case change introduces. No browser, ~seconds.
2. Only if the spec is structurally sound do we run it and **heal runtime selector/timing drift** —
   never weakening what the test asserts.

## Step 0: Resolve the target spec — by content, never by filename
Specs mirror cases 1:1: `<qa-root>/scripts/e2e/<module>/<TC-basename>.spec.ts`.
1. A spec file path given → use it as-is.
2. A slug/case-id given → find it via the plan's `## Traceability (Requirement ↔ Case)` table (the `e2e`
   rows for that slug) or grep `**Feature:** <slug>` under `<qa-root>/cases/e2e/`, then map the case to its
   mirrored spec. **NEVER glob `<slug>.md`.**
3. No argument → `npm run test:e2e -- --reporter=list` to surface failures, then ask which to heal.

## Step 1: Static pre-flight (catch merge / structure / syntax breakage FIRST)
Run the offline gate on the resolved spec **before** any browser:
```bash
npm run heal:check                 # tsc --noEmit + eslint (compile + rule gate)
```
**Gate:**
- `heal:check` fails on tsc or eslint → the spec **won't compile / breaks a rule**. This is a *structural*
  problem, not a runtime heal. **Report the exact errors and STOP** — fix imports/types/arch (often a
  merge artifact), not a selector. Do not launch the browser.
- **Locator cross-check — performed by THIS skill, not the npm script**: extract the spec's selectors and check each against `<qa-root>/docs/element-registry.md`; unknown selectors → candidate broken locators for Step 3.
- All green → structure sound; proceed.

## Step 2: Read the source of truth (before changing any code)
- The originating case `<qa-root>/cases/e2e/<module>/<TC>.md` — its `## Steps` and `## Expected Result` are the
  behavior anchor.
- The case's `**Plan:**` link — the requirement the test ultimately verifies (the spec's `caseMeta`
  `req: ['<slug>/REQ-NNN']`, the case's `@req:` tag).
- The kit's rules — `<qa-root>/scripts/shared/README.md` — and the golden specs in the bundle repo
  (`tests/golden/qa/scripts/e2e/projects/`): a heal brings an old-pattern spec toward them, never away.
- `<qa-root>/docs/element-registry.md` — the authoritative locator source.
- `grounding-in-code` — when the registry entry no longer matches, locate the component that owns the
  element in the frontend source (renamed `data-testid`) and the commit that changed it
  (`git log -n 10 -- <path>`); cite `frontend:<path>#<component> @ <sha>` in the heal report.

## Step 3: Run the spec to observe the runtime failure
```bash
QA_ENV=<env> npm run test:e2e -- scripts/e2e/<module>/<TC>.spec.ts --reporter=list
```
Read the failure output and the retained trace/screenshot (`<qa-root>/runs/.../` or the Playwright report).
Classify the failure: selector drift (element moved/renamed), timing (element not ready), navigation
change, **isolation** (passes alone, fails in the suite or under `--shuffle`/`--repeat-each` — shared
data, a hard-coded name, a named actor's account mutated by another test), **session/setup**
(`no session "…"` / sign-in errors from the `setup` project — an env problem, `/qa-env`, not a heal),
or a genuine app-behavior change. Isolation is proven, not guessed: re-run the spec alone
(`--repeat-each=5 --workers=5`) and then with the suite shuffled. **Root cause before any fix**: reproduce it once, read the
trace to the first wrong step, and state the hypothesis in one line before editing. A fix without a
stated cause is a guess, and a guess that goes green hides the next failure.

## Step 3b: Score every candidate locator before writing it
Resolve the broken element through the hierarchy (registry → `data-testid` via `grounding-in-code`
→ role/label) and score each candidate:

| Score | Locator | Auto-apply? |
|---|---|---|
| 5 | registry entry / `data-testid` unique on the page | yes |
| 4 | `getByRole` + accessible name, unique on the page | yes |
| 3 | role + name scoped to one region (`within`) with exactly one match | yes |
| 2 | text match, or role + name with several matches disambiguated by `nth` | **no** — report as candidate |
| 0–1 | CSS class, structural `nth-child`, XPath | never |

Nothing below 3 is written. When **`playwright-cli` is installed** (`playwright-cli --version`),
open the failing step's page, take a `snapshot` and confirm the chosen locator resolves to exactly
one ref before editing; attach the snapshot (or a screenshot) beside the heal report as evidence
that the new locator points at the element the case means — a score-4 locator can still name the
wrong button. Absent the CLI, the registry and the frontend source are the evidence, and the report
says so.

**Three attempts, then stop.** A spec that is still red after three heals is not a selector
problem: re-triage it as `FUNCTIONAL` (→ `/qa-defect`) or `SETUP/ENV` (→ `/qa-env`) with the three
attempts listed, and do not heal a fourth time.

## Step 4: Heal — allowed vs not allowed
**Allowed fixes:**
- Locators/selectors that no longer match — re-resolve via the element registry → `data-testid` (located through
  `grounding-in-code`) → role/label hierarchy (never brittle CSS/XPath, never a live-DOM guess pasted in blindly).
- Timing (waits/timeouts/polling) — via the named timeout constants or web-first assertions, never a
  fixed `sleep`; time-dependent UI via `page.clock`, never a longer wait.
- Navigation paths that changed.
- Isolation, by moving the spec onto the kit — never by adding `test.describe.serial`, `workers: 1`,
  retries or a `lock` to hide it: shared/hard-coded data → `<module>Factory.create()` + `uniqueName()`;
  a role on a shared login → `withMember(role, pool[0])` + `<module>PageAs(account)`; `new XPage(page)`
  → the injected fixture; `afterEach`/`finally` teardown → the `cleanup` ledger; a raw CSS locator
  inside a dialog/table → the `Dialog`/`DataTable` component. A `lock:` is allowed only for state the
  product makes impossible to isolate, with the reason in a comment.

**Not allowed without re-validation against the case:**
- Changing an assertion's expected value, weakening/removing an assertion, or skipping/commenting a step.
- If an assertion truly must change, verify it against the case's `## Expected Result` and its `@req:`
  first. If the fix would contradict what the case proves, **STOP and report** — the case (or the app)
  changed; that is a `/qa-design` + dev decision, not a silent heal.
- Editing the case's `## Steps` / `## Expected Result` / `## Variants` / `## Data` in the same change as
  the spec. The heal guard judges the spec against the case **as it was before the change** and
  reports `oracle` (CONTRACTS §31.3): a test that moves its own judge proves nothing. A genuinely
  wrong case goes through `/qa-design` and a READY case review first, then the heal.
- Healing at all before the failure is attributed: a heal assumes `SCRIPT`. If the precondition did
  not hold at the assertion, or the check gives the same answer with the state inverted, or the read
  itself failed (UNKNOWN), the fix is in setup or in the reader — not in the locator or the wait
  (`qa-phase-protocol/references/verdict-integrity.md` §2, §4).

Edit only the spec and the shared page-objects/helpers under `<qa-root>/scripts/` — **never** application source,
the case file, or the traceability table.

## Bulk mode (`/qa-heal --bulk <slug>`) — after a UI refactor, ten or more specs
1. Snapshot the old DOM (CI artifact, Storybook or the previous build) and the new one, per screen,
   after hydration — never before.
2. Parse every failure, extract the broken locator, infer the element's intent from the case step.
3. Score replacements (Step 3b); apply **only ≥ 3**, one line-anchored edit per locator — never a
   bulk string replace, because the reporter's rendered locator rarely equals the source text.
4. One screenshot per changed locator; a spec whose feature was removed is **pruned**, not
   regenerated, and listed for `/qa-design`.
5. Re-run the suite; iterate; report per spec exactly as Step 5 does. Fewer than ten failures →
   heal one by one.

## Step 5: Confirm & report
Re-run `heal:check` (still compiles), the spec (green), then `npm run qa:heal-guard`: it reads every
assertion before and after from the syntax tree and exits 1 on an assertion removed or weakened
(exact → partial → presence, or moved under try/catch, an `if`, `&&`, after a `return`), a skip,
hard wait, timeout or retry added, or an expected value / test datum the mirrored case does not state.
A block is never argued with: revert that hunk and re-triage (the failure was not a selector). Only a
human, quoted with `--human "<who: what changed>"`, unblocks an expected-value change the case does
not yet say. Report, in order:
1. **Static pre-flight** — `heal:check` pass/fail + any structural errors found & fixed; locator flags.
2. **Heal result** — selector rewrites (old → new, with the registry entry used); timing/navigation fixes.
3. **Any assertion change** and the `## Expected Result`/`@req:` line it was validated against; or the
   STOP reason if a required change would contradict the case.
4. The heal-guard verdict (`OK`, or the blocked rows and what was reverted) and the report path.
5. Whether the spec is now green; if a genuine application bug was found (FUNCTIONAL), say so and route it to `/qa-defect`
   (do not patch the test to hide it).

## Done — ALL must be true
- [ ] Target resolved via traceability/`**Feature:**`, not a `<slug>.md` glob; e2e tier only.
- [ ] `heal:check` run first; structural failures reported and STOPed (not healed as selectors).
- [ ] Heals limited to locators/timing/navigation/isolation via the registry, named timeouts and the kit (factories, pool, fixtures, components); no brittle selectors, no fixed sleeps, no `serial`/`workers: 1`/retries to hide an isolation bug.
- [ ] Root cause stated before the fix; every written locator scores ≥ 3, verified live when `playwright-cli` is present; a spec still red after three heals is re-triaged, not healed again.
- [ ] No assertion weakened/removed without validation against the case's Expected Result + `@req:`; contradictions STOP.
- [ ] `npm run qa:heal-guard` exits 0 on the final diff (its last line quoted), or the blocked change was reverted.
- [ ] Only `<qa-root>/scripts/` edited — never app source, cases, or traceability.
- [ ] Re-verified green; result reported in the Step 5 order.
