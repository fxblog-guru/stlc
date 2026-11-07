---
name: hunting-flaky-tests
description: Use to fix flaky Playwright cases: repeat with no retries, rank by failure rate, find the cause, fix, prove 0/n (/qa-flaky).
version: 1.0.0
---

# Hunting Flaky Tests

> Profile first, by section (`profile.mjs`) — `§Test types`, `§Environments` (where the repeat run is
> allowed), `§Quality gates` (flake budget). QA root defaults to `<qa-root>/`. Contract: CONTRACTS §5
> (`FLAKY`, `flake-kind`), §12 (quarantine), §23 (lessons).

## Prime directive — a flake is a bug with a cause
Quarantine (`/qa-quarantine`) makes a flake visible and bounded; this skill makes it go away. A flake
is fixed in the test or the kit, or it is a product race. It is never fixed with a retry, a timeout,
`waitForTimeout`, `serial`, `workers: 1`, a skip or a looser assertion — `qa:heal-guard` blocks each.

## Scope
Playwright types only (e2e · api · integration · accessibility · ui). A flaky unit test is a
`NON-DETERMINISTIC` test defect (`/qa-unit-audit` + regen); a flaky SLO is a performance finding;
a flaky Maestro flow goes to `healing-mobile-flow`.

## Step 1: Suspects
In order, the first that gives any: the Case IDs given · cases triaged `FLAKY` in the slug's runs
(`failures.md`) · unreleased rows of `regression/quarantine.md` · `qa:learn harvest` "recurring flake"
signals. Nothing → say so and stop; a whole-suite hunt needs an explicit `--all`.

## Step 2: Measure
From `<qa-root>/`, on an environment `§Environments` allows:
```
RUN_DIR=runs/flaky/<slug>/<run-id> npx playwright test --grep "<id>|<id>" --repeat-each=<n> --retries=0 --workers=4
npm run qa:flaky -- runs/flaky/<slug>/<run-id>
```
`n` defaults to 10. `stability.md` ranks every case: `stable` · `flaky` · `broken`. A **broken** case
failed every run: it is not a flake — triage it (CONTRACTS §5) and stop for that case.

## Step 3: Root cause — confirm before fixing
| Symptom | Usual cause | Confirm by |
|---|---|---|
| passes with `--workers=1`, fails at 4 | shared data, actor or ordering | rerun at `--workers=1`: stable → isolation |
| assertion runs before the screen settles | an action that does not wait for its response | the trace: the request still pending at the assertion |
| depends on which test ran first | leaked state | `--shuffle` changes the failing set |
| near midnight, month end, a timezone | time | `page.clock` at the boundary reproduces it |
| one browser or project only | timing or a browser difference | `--project=<p>` alone |
| a third party is slow or down | external | the trace's failing request host |
| fails in some runs, passes in others, with no change in the test | the system changed under it (a flag, a config, seed data, a half-rolled deploy) | `qa:delta` between a red and a green run: a `changed` component in the identity diff is the cause, not flakiness (CONTRACTS §31.6) |
The error lines in `stability.md` say whether there is one cause or several. Name the `flake-kind`
(§5) per case. Read `npm run qa:learn -- recall --type <t> --module <m>` first (then `show <id>` for a matching probe): a known lesson is the
first hypothesis, never the conclusion.

## Step 4: Fix
`automation-engineer` fixes the spec or the kit with the isolation moves of `healing-e2e-script`
Step 4 (factories + `uniqueName()`, the actor pool, the cleanup ledger, web-first assertions, named
timeouts, `page.clock`). An app-side race — the product misbehaves under concurrency — is
`FUNCTIONAL`: `/qa-defect`, the spec untouched. `npm run qa:heal-guard` must exit 0.

## Step 5: Prove
The same command as Step 2, on the fixed cases: **0 failures in n runs**. Still flaky after two fix
rounds → `BLOCKED` with both stability tables; offer `/qa-quarantine` with the evidence. A
quarantined case proven stable in 3 runs → `/qa-quarantine --release`.

## Step 6: Lesson
A cause that would recur elsewhere (a kit gap, a data pattern, an environment trait) is a candidate
for `/qa-learn` — at most one per hunt, with the two stability files as evidence.

## Summary (chat)
```
✓ Hunted <k> case(s) — n=<n> repeats, retries 0
  <Case ID>  <before>/<n> → <after>/<n>  <flake-kind>  <fix: file>
  broken (not flaky): <ids → triage>   blocked: <ids → /qa-quarantine>
  heal-guard: OK   lesson: <LRN-… proposed | none>
Next: <one command>
```

## Done — ALL must be true
- [ ] Every rate comes from a `stability.md` of this hunt, before and after, with `--retries=0`.
- [ ] Broken cases were triaged, not stabilised; app-side races went to `/qa-defect`.
- [ ] No retry, timeout, wait, serial, skip or looser assertion added; `qa:heal-guard` OK quoted.
- [ ] Each fixed case shows 0/n after; anything else is BLOCKED with evidence.
