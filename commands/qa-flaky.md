---
description: Measure flaky cases with repeated runs (no retries), find each cause, fix it, prove 0 failures in n runs.
argument-hint: <slug> [<TC-id>…] [--repeat 10] [--env <env>] [--all]
disable-model-invocation: true
---

Follow `qa-phase-protocol` (invoke the skill if it is not already in context); this file holds only what is specific to this command.

> Profile first, by section (`profile.mjs`) — `§Test types`, `§Environments`, `§Quality gates`.
> QA root defaults to `<qa-root>/`. Contract: CONTRACTS §5, §12, §23.

Hunt the flaky cases of `$ARGUMENTS`: measure, find the cause, fix, prove. Quarantine hides a flake
for a bounded time; this removes it.

## Preconditions (check before delegating)

- [ ] The suspects resolve (Case IDs given, or `FLAKY` triages / quarantine rows / `qa:learn harvest`
      signals for the slug). None → STOP: "no flaky case on record for <slug>; pass Case IDs or --all"
- [ ] Every suspect is a Playwright type (e2e · api · integration · accessibility · ui). A unit or
      performance case → STOP with its route (`/qa-unit-audit`; a performance finding)
- [ ] The environment's `§Environments` row allows a repeated run (n × the suspects' requests)

## Hard rules

- `--retries=0` on every measuring run; the rate is always failures / n from `stability.md`.
- No retry, timeout, wait, `serial`, `workers: 1`, skip or looser assertion as a fix —
  `npm run qa:heal-guard` exits 0 on the final diff, or the hunt is not done.
- A case that fails every run is **broken**, not flaky: triage it, never "stabilise" it.

## Execution

Delegate to the `automation-engineer` agent to invoke `hunting-flaky-tests`: measure
(`qa:flaky`), root cause per case, fix in the spec or the kit, re-measure. It hands app-side races
to `/qa-defect` and offers `/qa-quarantine` for a case still flaky after two rounds.

## Done criteria

Report back: per case the rate before → after (both `stability.md` paths), the `flake-kind` and the
fix, the heal-guard verdict, broken or blocked cases with their next command, and a lesson proposed
through `/qa-learn` when the cause would recur.
