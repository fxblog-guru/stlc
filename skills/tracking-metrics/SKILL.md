---
name: tracking-metrics
description: Use for portfolio KPIs from traceability, reports, defects and ledgers: DDP, coverage, pyramid, pass rate, flake, MTTR (/qa-metrics).
version: 1.1.0
---

# Tracking Metrics

> Profile first, by section (`profile.mjs`) — `§Test types` (which types count), `§Quality gates`
> (the posture definition, pyramid mix target, flake budget). QA root defaults to `<qa-root>/`.

## Prime directive — measure what the artifacts prove, refuse what they can't
Every KPI is computed from traceability tables, feature reports, committed run text evidence
(`summary.md`, `failures.md`), defect files and the two ledgers (`<qa-root>/regression/quarantine.md`,
`<qa-root>/defects/ESCAPES.md`) — the same sources the pipeline already trusts. A metric whose inputs
don't exist in this workspace is listed as **not measurable here**, never approximated.

## Action
Produce `<qa-root>/reports/metrics/YYYY-MM-DD-metrics.md`: per-feature table + portfolio KPIs + trend vs
the previous snapshot.

## Inputs — resolve before computing (STOP conditions)
1. Every plan under `<qa-root>/plans/*/` with a traceability table (0 plans → STOP: nothing to measure).
2. Latest report per slug (optional per feature — a slug without one shows `no report`).
3. All `<qa-root>/defects/*/DEF-*.md` (Status / Origin / Raised / Closed from the file), `<qa-root>/defects/ESCAPES.md`.
4. `<qa-root>/regression/quarantine.md`; `<qa-root>/runs/**/summary.md` + `failures.md` (committed text evidence).
5. `<qa-root>/exploratory/*/XS-*.md` (sessions; `## Debrief` filled = debriefed).
6. Previous snapshot: most recent prior `<qa-root>/reports/metrics/YYYY-MM-DD-metrics.md` (optional).

## Step 1: Per-feature rows — transcribed, not recomputed
`| Feature | REQs | Cases | Scripted % | Manual | Run % | Pass % | Quarantined | Open defects C/H/M/L | Escapes | Sessions | Overall gate | Report date |`
— counts from each traceability table (cases = rows with a Case ID; scripted = ✅; manual = cases
tagged `@manual`; run = has `Last run`; pass = `Status` ✅ of run), quarantined = unreleased ledger
rows for the feature's cases, defects/escapes from the files/ledger, sessions = `n (m debriefed)`,
gate verdict from the feature's latest report (`no report` when absent).

## Step 2: Portfolio KPIs
- **DDP — Defect Detection Percentage (test recall), the headline** = INTERNAL (+ EXPLORATORY)
  defects `Raised` in the window / (those + `ESCAPES.md` rows `Reported` in the window) × 100.
  Print it with its band — escapes < 10 % excellent · 10–20 % good · 20–40 % concerning · > 40 %
  a broken process — and the window. Beneath it, escapes by `Phase missed` and `Type missed`
  (where the process leaks) and, when the dev bundle is installed and `dev/deployment/*/runs/*/
  deploy-run.md` is readable, rollbacks in the window beside the escapes (change-failure view);
  otherwise **not measurable here**. An empty ledger is "0 escapes recorded over n internal
  defects", never "100 %". The defect escape rate below is the complement; this is the number the
  sprint review reads first.
- **Automation coverage** = scripted / (designed − manual) — portfolio-wide and P0/P1-only.
- **Test-pyramid mix** = cases per type as % of all designed cases, against the `§Quality gates`
  pyramid target when set (default reading: unit ≥ 50 % · api + integration ≥ 30 % · e2e ≤ 15 % ·
  the rest security/performance/accessibility); state the deviation, not a verdict.
- **Run pass rate** = pass / run; **gate-effective pass rate** = pass / (run − quarantined).
- **Execution debt** = designed-but-never-run count, P0/P1 called out; `@manual` listed separately.
- **Flake rate** = cases with ≥1 `FLAKY` triage in `failures.md` over the last N run folders per
  feature / cases run (say N); **quarantine load** = unreleased rows (P0/P1 count), oldest `Since`,
  rows expiring within 7 days, expired-unreleased (should be 0 — lint fails otherwise).
- **Defect load** = OPEN defects by severity and Origin; **defect age** = days since `Raised:` (oldest 5).
- **MTTR** = mean/median `Closed − Raised` in days over defects `CLOSED` with `Resolution: fixed`
  in the window (last 90 days by default; say the window); Critical/High separately.
- **Defect escape rate** = `ESCAPES.md` rows Reported in the window / (those + INTERNAL defects Raised
  in the window); plus escapes by `Phase missed` and `Type missed` (where the process leaks).
- **Backfill debt** = `ESCAPES.md` rows with `Backfill` = `pending`, oldest age.
- **Exploratory coverage** = features with ≥1 debriefed session in the window; bug candidates raised
  vs open.
- **Gate posture** = features PASS / FAIL / not evaluable / no report.
- **Unit posture** (when any plan has unit rows) = unit cases designed / scripted / run; HANDOFF
  backlog by Status (`proposed` count and oldest age); branch/line % per feature transcribed from the
  latest report's **Unit coverage** section (`not evaluable` where absent).
- **Accessibility posture** (when enabled) = open Critical/High findings from the latest accessibility
  runs' `findings.md`, per feature.
- **Mobile posture** (when enabled) = per platform: pass rate on gate-tier devices from the latest
  `device-matrix.md` per feature, crash/ANR count, `<qa-root>/scripts/mobile/HANDOFF.md` backlog by Status
  (`proposed` count and oldest age) — the same shape as the unit HANDOFF backlog.
- **Not measurable here** (state plainly when true): MTTR when no defect has closed in the window;
  escape rate when the ledger is empty (say "0 escapes recorded" — not "0 %"); flake rate when run
  folders were not committed; anything needing production telemetry.

## Step 3: Trend vs previous snapshot
Delta per KPI (coverage Δ, pyramid Δ, pass-rate Δ, flake Δ, quarantine Δ, defect load Δ, MTTR Δ,
escape-rate Δ, features whose gate flipped). First snapshot → "First snapshot — no trend."

## Step 4: Reading — three observations max
Up to three factual observations that follow from the numbers ("automation coverage fell 8 % while
case count grew — scripting is the bottleneck"; "3 of 4 escapes missed at DESIGN in orders — the
api heuristics were not applied there"), each citing its rows. Observations describe;
recommendations belong to humans and `/qa-signoff`.

## Step 5: Write the snapshot + summary to chat
Sections: **Portfolio KPIs** → **Per-feature table** → **Pyramid mix** → **Flake & quarantine** →
**Defects (load · MTTR · escapes · backfill debt)** → **Exploratory** → **Trend** → **Observations**
→ **Not measurable here**. Then print:
```
✓ Wrote <qa-root>/reports/metrics/YYYY-MM-DD-metrics.md
Coverage {x}% (P0/P1 {y}%) | Pyramid unit {u}% · api+int {a}% · e2e {e}% | Pass {z}% (gate-effective {g}%) | Flaky {f} · quarantined {q} ({p} P0/P1, {x} expiring ≤7d)
Defects open C:{c} H:{h} M:{m} L:{l} | MTTR {d}d (C/H {d2}d) | Escapes {n} ({rate}%) · backfill pending {b} | Sessions {s} ({sd} debriefed)
Gates: {p} pass / {f} fail / {n} not evaluable / {r} no report | Trend: {headline Δ or "first"}
```

## Done — ALL must be true
- [ ] Every feature with a plan appears exactly once; every figure traces to a named artifact.
- [ ] KPIs computed only from traceability / report / run text evidence / defect files / ledgers; nothing re-run or extrapolated.
- [ ] Windows (MTTR, escape rate, flake rate) stated; unmeasurable metrics declared as such — never approximated silently.
- [ ] Trend present when a previous snapshot exists.
- [ ] Observations ≤ 3, factual, each citing its evidence.
