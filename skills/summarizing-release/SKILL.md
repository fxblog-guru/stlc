---
name: summarizing-release
description: Use for release readiness: eleven exit criteria, open defects, GO / NO-GO / CONDITIONAL GO in the §16 sign-off shape (/qa-signoff).
version: 1.0.0
---

# Summarizing Release

> Profile first, by section (`profile.mjs`) — `§Quality gates` defines the exit criteria,
> `§Test types` the applicable scopes. QA root defaults to `<qa-root>/`.

## Prime directive — a verdict you can defend in the release meeting
Every line of the sign-off traces to a feature report, a traceability table, or a defect file.
A gate that cannot be evaluated is CONDITIONAL, never silently GO. The executive summary contains
zero QA jargon — it is written for the person who will not open the appendix.

## Action
Produce `<qa-root>/reports/release/<release-id>/YYYY-MM-DD-signoff.md` aggregating the named feature slugs
into exit-criteria verdicts and one recommendation.

## Inputs — resolve before writing (STOP conditions)
1. `<release-id>` + the feature `<slug>` list (argument, e.g. `/qa-signoff 2026-08 checkout,login`;
   no list given → propose every slug under `<qa-root>/plans/` with run activity and ask).
2. Per slug: the **latest report** `<qa-root>/reports/<slug>/YYYY-MM-DD-report.md` and the plan's
   traceability table. A slug with no report → run `/qa-report` first or mark the feature
   `NOT ASSESSED` (which forces CONDITIONAL at best).
3. Open defects: `<qa-root>/defects/<slug>/DEF-*.md` with `**Status:** OPEN` (Origin noted — ESCAPED first),
   `<qa-root>/defects/ESCAPES.md` (pending backfills), `<qa-root>/regression/quarantine.md` (unreleased rows).

## Step 1: Freshness check — stale reports don't sign releases
Per slug, compare the report date against the newest run-id in the traceability table. Runs newer
than the report → mark the feature's data `STALE (report predates run <run-id>)` and recommend
re-running `/qa-report`. Stale features cannot contribute a GO.

## Step 2: Aggregate per-feature posture
One row per feature: `| Feature | Report date | Fresh? | Overall gate | Failing gates | Open defects (C/H/M/L) | Not-run P0/P1 |`
— transcribed from each report's gate section and the defect files. Nothing recomputed, nothing guessed.

## Step 3: Release exit criteria — the checklist
Evaluate each as one row of the byte-exact table `| # | Exit criterion | Verdict | Evidence |`
(CONTRACTS §16), `Verdict ∈ met | NOT met | not evaluable`, `Evidence` = the report line, defect
file or ledger row that decided it:

| # | Exit criterion | Source |
|---|---|---|
| 1 | Every in-scope feature's overall gate = PASS | Step 2 |
| 2 | 0 OPEN Critical/High defects across in-scope features | defect files |
| 3 | 0 not-run P0/P1 cases | traceability tables |
| 4 | Performance SLOs met wherever the type is enabled | feature reports |
| 5 | 0 unresolved High/Critical security findings | feature reports |
| 6 | All reports fresh (Step 1) | Step 1 |
| 7 | No expired-unreleased quarantine; every quarantined P0/P1 case listed as a condition | quarantine ledger + traceability priorities |
| 8 | 0 unresolved Critical/High accessibility findings wherever the type is enabled | feature reports (Step 5c tables) |
| 9 | Mobile: 0 failing P0/P1 on gate-tier devices per platform, P0 journeys covered on both platforms, 0 crashes/ANRs — wherever `mobile` is enabled | feature reports (Step 5d device matrix) |
| 10 | No `ESCAPES.md` row for an in-scope feature with `Backfill` = `pending` and no OPEN defect older than the release's first run without a Resolution decision | escape ledger + defect files |
| 11 | Every in-scope feature with `re-verify:` rows has its `Re-verify set` gate = pass (a baseline slug's cases the feature touches ran green at/after its shipped SHA) | feature reports (gate row `Re-verify set`) |

Verdicts: `met` / `NOT met (evidence)` / `not evaluable (what's missing)`.

## Step 4: The recommendation — rules, not vibes
- **GO** — every criterion `met`.
- **NO-GO** — any criterion `NOT met` on a Critical/High-impact item (1, 2, 5, 11 with a P0/P1 re-verify row ❌, an expired-unreleased
  quarantine on a P0 case under 7, a Critical accessibility finding under 8, or a crash/ANR under 9),
  with the blocking evidence listed.
- **CONDITIONAL GO** — everything else: name each condition as an actionable item with an owner-shaped
  next step ("close DEF-checkout-003 or accept risk in writing", "run perf suite for login",
  "TC-E2E-ORDERS-001 (P1) quarantined until 2026-09-30 — accept or fix", "backfill DEF-orders-003 via
  /qa-design orders --type unit").

The recommendation is advisory: the report says "QA recommends…"; the accept/override decision and
its owner are recorded by whoever holds release authority.

## Step 5: Executive summary — write it LAST, place it FIRST
≤ 5 bullets at the top of the report, plain language: what was tested (features, scope), the
recommendation, the residual risks in business terms ("refunds over $10k untested"), what would
change the verdict, and the date the data reflects.

## Step 6: Lessons learned — from the failure digests
From each report's failure digest, list the top recurring cause classes across the release
(e.g. "6 of 9 failures were SETUP/ENV → invest in /qa-env preflight"). Facts from the digests only —
this section feeds the next release's planning, not blame.

## Step 7: Write the report + summary to chat — the CONTRACTS §16 shape
Copy `<qa-root>/_templates/signoff.md`. Front matter: `release`, `date`,
`features: [<slugs>]`, `recommendation: GO | NO-GO | CONDITIONAL GO` (the Step 4 result — `GO` only
when every exit criterion is `met`). Headings in order, byte-exact: **Executive summary** →
**Recommendation & conditions** (the `**QA recommends:**` line + the `| # | Condition | Owner | Due |
Evidence |` table — at least one row for CONDITIONAL GO, empty otherwise) → **Feature posture** →
**Exit criteria** (Step 3 table) → **Open defects** (Critical→Low, ESCAPED first) → **Lessons
learned** → **Appendix** (per-feature report paths). Run `npm run qa:lint` before reporting done —
the dev bundle reads `recommendation` at its deploy gate. Then print:
```
✓ Wrote <qa-root>/reports/release/<release-id>/YYYY-MM-DD-signoff.md
Recommendation: {GO | NO-GO | CONDITIONAL GO} — {one-line reason}
Features: {n} assessed, {m} stale, {k} not assessed | Open C/H defects: {count}
Conditions: {list or none}
```

## Done — ALL must be true
- [ ] Every feature in scope appears in the posture table as assessed, stale, or NOT ASSESSED.
- [ ] All eleven exit criteria carry a verdict with cited evidence; none silently skipped; quarantined P0/P1 and pending backfills appear as conditions.
- [ ] Recommendation follows the Step 4 rules; CONDITIONAL lists concrete, actionable conditions.
- [ ] Executive summary is ≤ 5 bullets, jargon-free, and placed first.
- [ ] Nothing recomputed from raw runs — only feature reports, traceability tables, defect files.
