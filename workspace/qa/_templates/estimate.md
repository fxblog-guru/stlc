---
slug: <slug>
artifact: estimate
status: draft
authored_by: estimating-effort
reviewed_by: pending
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# Estimate — <slug> — YYYY-MM-DD

**Analysis:** <qa-root>/analysis/<slug>/YYYY-MM-DD-analysis.md · **Confidence:** HIGH | MEDIUM | LOW

<!-- Written by /qa-estimate (estimating-effort). Copy to <qa-root>/plans/<slug>/YYYY-MM-DD-estimate.md.
     Every number carries its derivation: case counts = analysis driver × the design skills' own
     minimums; hours = counts × a named baseline rate (PROJECT-PROFILE §Estimation baselines, or the
     skill's defaults marked "(default)"); buffer = the risk band. Ranges stay ranges. -->

## Summary

| Type | Cases (range) | Design h | Script h | Run h | Total h |
|---|---|---|---|---|---|

**Total:** <X> h (<Y> days) incl. <z>% risk buffer (<band> — <why>)

## Derivation

<!-- Per type: "orders api: 2 resources / 7 endpoints / ~8 fields → 2 CRUD + 7 authz + ~24
     field-negatives ≈ 33 cases × 4/h design (default) …". Calibration features named when history
     was used. -->

## Assumptions

1. <e.g. the OpenAPI spec is current>

## Not included

- <env setup, developer fix time, UAT, developer time to apply HANDOFF rows>

## Confidence

<HIGH | MEDIUM | LOW — the reason; LOW when there is no history to calibrate against>

## What would change this

- <the 2–3 inputs that move the number most>
