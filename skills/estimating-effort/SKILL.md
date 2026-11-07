---
name: estimating-effort
description: Use to forecast QA effort: case counts from the design minimums, hours via §Estimation baselines, calibrated to history (/qa-estimate).
version: 1.0.0
---

# Estimating Effort

> Profile first, by section (`profile.mjs`) — `§Test types` (what will be built), `§Estimation
> baselines` (throughput rates; defaults apply when the section is absent). QA root defaults to `<qa-root>/`.

## Prime directive — an estimate is a model, shown as one
Every number carries its derivation: case counts trace to analysis items × the design skills' own
minimum rules; hours trace to counts × a named baseline rate; the buffer traces to the risk score.
No history to calibrate against → the estimate says **LOW confidence** in bold, not silently.

## Action
Produce `<qa-root>/plans/<slug>/YYYY-MM-DD-estimate.md`: case-count forecast per enabled type, effort in
hours per phase (design / script / run+triage), assumptions, and confidence.

## Inputs — resolve before estimating (STOP conditions)
1. `<slug>` with `<qa-root>/analysis/<slug>/YYYY-MM-DD-analysis.md` — REQ-ids, risk scores, endpoint
   inventory, per-type testability matrix. No analysis → STOP: "run `/qa-analyze` first"; never
   estimate from raw docs.
2. `§Test types` — estimate ONLY enabled types.
3. History (optional): completed features under `<qa-root>/plans/*/` with filled traceability tables.

## Step 1: Forecast case counts — from the bundle's own design rules
Count the analysis's testable items per type and apply the same minimums the design skills enforce.
**The design skills are the source of truth** — when a rule below and the skill disagree, the skill
wins; update this table, don't argue with it.

| Type | Driver in the analysis | Forecast rule (mirrors the design skill's own minimums) |
|---|---|---|
| api | resources + endpoints + payload fields + endpoint classes | per RESOURCE: 1 CRUD contract case · per ENDPOINT: 1 authz case · per FIELD: ≥1 negative (boundary fields ×3, enums per value) ≈ a CRUD resource with a 6–10-field payload ≈ **12–20 cases** · plus Step 3b classes (`designing-api-cases/references/api-test-heuristics.md` sizing table): +1 query-matrix case per collection endpoint · +1 per PATCH endpoint · +1 state-transition matrix per status field · +1 idempotency/concurrency per create/charge endpoint · +1 async lifecycle per 202 job · +2 shared per API (error contract, contract drift) |
| integration | declared seams | 1 case per seam (failure path + idempotency twin are STEPS inside it, not extra cases); +1 where redelivery/async is declared ≈ **1–2 per seam** |
| e2e | the feature slug (category counts are per-slug, not per-flow) | Happy 5–7 + Validation 3–4 + Edge 3–4 + Negative 3–4 + Impact 1–2 + Integration touchpoints 3–4 ≈ **18–25 per slug** |
| security | role×resource matrix + checklist hits | 1 case per role×resource cluster (this IS A01 — never double-counted) + injection/session/sensitive-data per checklist hit ≈ **matrix rows + 4–8** |
| performance | key transactions | smoke + load ALWAYS; stress/spike/soak where the rubric signals ≈ **2–3 per transaction** |
| accessibility | in-scope screens × states (from e2e journeys + registry) | 1 automated axe case per screen (states as steps) + 1 keyboard/focus case per interactive screen + 1 validation case per form + 1 reflow case per data screen ≈ **2–4 per screen**; manual (`@manual`) cases ≈ 1 per interactive screen, executed in exploratory sessions |
| mobile | app journeys × platforms + device conditions the feature touches | per P0 journey 1 happy case (both platforms) + 1 negative where input exists + the device-reality floor (interrupt, background, offline, flaky network, permission, orientation, deep link, kill/relaunch ≈ **6–8 per feature**, shared across journeys) ≈ **8–14 per feature**; FRAMEWORK-GAPs add mobile-developer time, not QA time |
| exploratory (no traceability rows) | High risks · BRs without TC · escapes · manual cases | 1 charter per top-3 ranked target per feature; each = 1 session (90 min) + debrief |
| unit | logic-bearing symbols behind P0/P1 REQs and cited BRs (analysis §5 unit column + testability entry points; `/qa-unit-audit` §5 when it ran) | 1 case per subject × behaviour cluster (typically 1–2 per symbol), each 5–15 matrix rows; a state machine = 1 case for the whole grid; symbols scoring < 4 deferred ≈ **1–2 cases per logic-bearing symbol** (a feature touching 6–10 such symbols ≈ **8–16 cases**); `TESTABILITY-GAP` symbols count but carry a dev-seam dependency in Assumptions |

Show the arithmetic per type (e.g. "orders API: 2 resources / 7 endpoints / ~8 fields each →
2 CRUD + 7 authz + ~24 field-negatives ≈ 33 api cases"). Ranges stay ranges.

## Step 2: Calibrate against history — when it exists
From completed features: actual cases per endpoint/flow/seam (traceability rows vs their analysis),
and actual scripted %. Where history contradicts Step 1's rule (e.g. the team really produces 9
cases/endpoint), **the historical rate wins** — say which features calibrated it. No history →
skip, and set confidence LOW.

## Step 3: Convert to hours — via §Estimation baselines
Use `§Estimation baselines` rates; when the profile is silent, apply these defaults and mark them
`(default — tune in PROJECT-PROFILE)`:
design **4 cases/h** · design unit **6 cases/h** (matrix-driven) · design accessibility **5 cases/h** ·
script e2e **1.5 cases/h** · script api/integration **3 cases/h** · script unit **4 cases/h**
(table-driven) · script accessibility **3 cases/h** · design mobile **3 cases/h** · script mobile **1.5 cases/h**
(+1 h per missing screen object for the mobile developers, listed under Not included) · perf/security
script **2 h/scenario** ·
unit-test audit **25 existing tests/h** (when `/qa-unit-audit` is in scope) · exploratory
**2 h/charter** (session + debrief) · run+triage **15% of design+script** · defect writing
**0.5 h/defect** (forecast defects ≈ 10% of case count for a new feature) · escape intake
**1 h/escape** (when `ESCAPES.md` shows a rate for the area).

## Step 4: Risk buffer
From the analysis risk scores: high-risk feature (majority REQs high) → +30%; medium → +15%;
low → +5%. State which band fired and why.

## Step 5: Write the estimate
`<qa-root>/plans/<slug>/YYYY-MM-DD-estimate.md`:
**Summary table** `| Type | Cases (range) | Design h | Script h | Run h | Total h |` + buffered
grand total → **Derivation** (Steps 1–4 arithmetic) → **Assumptions** (numbered; e.g. "OpenAPI spec
is current", "env ready — /qa-env passes", "unit Write mode = propose → developer apply time not
included") → **Not included** (env setup, dev fix wait time, UAT, developer time to apply/merge
HANDOFF rows and to add testability seams) →
**Confidence: HIGH/MEDIUM/LOW** with the reason → **What would change this** (the 2–3 inputs that
move the number most).

## Step 6: Report ONLY this summary to chat
```
✓ Wrote <qa-root>/plans/<slug>/YYYY-MM-DD-estimate.md
Forecast: ~{n} cases across {types} → {X}h ({Y} days) incl. {z}% risk buffer
Confidence: {level} ({calibrated on: features | no history})
Top assumption to verify: {the one that moves the number most}
```

## Done — ALL must be true
- [ ] Every case count shows its driver × rule arithmetic; every hour figure names its baseline rate.
- [ ] Historical calibration applied when history exists — or confidence is LOW and says so.
- [ ] Buffer cites the risk band; assumptions and exclusions are explicit.
- [ ] Only enabled types estimated; disabled types listed as out-of-scope.
- [ ] No fabricated precision — ranges remain ranges; this is a forecast, not a promise.
