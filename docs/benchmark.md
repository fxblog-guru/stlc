# Benchmark

Written for: whoever releases this bundle and needs to know whether the new version made a project's
QA better or worse. It also explains what the numbers can and cannot say.

A release note that says "the designer is better now" is an impression. `qa:bench` turns it into a
number. It reads a QA root that has used the bundle for a while and scores what the bundle produced
there. It then compares two scores and refuses a worse one unless someone writes down why.

## How to run it

```bash
cd <qa-root>
npm run qa:bench -- score --label 2.3.0 --out ../bench-2.3.0.json   # before the upgrade
# … upgrade the bundle, run a few features through it …
npm run qa:bench -- score --label 2.4.0 --out ../bench-2.4.0.json
npm run qa:bench -- compare ../bench-2.3.0.json ../bench-2.4.0.json
```

`compare` exits 1 when the later score is worse on a gated measure. To ship anyway, re-run it with
`--reason "<why worse is acceptable>"`. The reason is printed with the result, so the decision is on
record. Keep the JSON files outside the QA root, or commit them under `reports/`.

## What it measures

Every number comes from a file the bundle already writes. No model judges anything.

| Measure | Read from | Better is | Gated |
|---|---|---|---|
| `first_pass` | the **earliest** `reviews/<slug>/*-case-review.md` of each feature: the share whose verdict was `READY FOR /qa-script` | higher | yes, by interval |
| `flaky` | `runs/**/failures.md` entries classified `FLAKY`, over all classified entries. Also reported: the cases measured flaky in a `stability.md`, and the unreleased rows of `regression/quarantine.md` | lower | yes, by interval |
| `escapes` | rows of `defects/ESCAPES.md`, and how many still have Backfill `pending` | fewer without backfill | yes |
| `repeated` | `qa:learn harvest` signals, and how many no active lesson covers yet | fewer uncovered | yes |
| `lessons` | active lessons in `learnings/`, and how many are `established` | — | no, reported only |

`first_pass` asks whether a designer gets it right the first time. A later review never changes it,
because re-review after a fix is supposed to pass. `repeated` with `uncovered` is the number the
learning loop (`/qa-learn`, CONTRACTS §23) exists to lower. A signal that keeps recurring with no
lesson means the suite is not learning.

## Why an interval, and not a percentage

Twenty features is a small sample. A first-pass rate that moves from 80 % to 75 % on twenty reviews
is one review, which is noise. Each rate therefore carries a 95 % **Wilson** score interval. That
interval stays sensible at small n and at 0 % or 100 %, where the normal approximation breaks.
`compare` calls a rate worse only when the later interval lies wholly on the bad side of the earlier
one. When the intervals overlap, it says "not measurable at this sample size" and passes. A side with
no data is "not evaluable", never "worse".

## What it does not measure

- **Defect detection.** No file in a QA root says how many bugs the product had, so the bundle
  cannot score how many it found. `escapes` is the honest proxy: a bug that got past the suite.
- **Cost, unless you pass it.** Token spend per phase lives in the harness, not in the QA root.
  `score --costs <phase-costs.json>` (`{ "plan": { "tokens": n, "duration_s": n }, … }`) records it
  next to the plans' sized `estimate_tokens`; a phase you did not measure stays `null`.
- **Repeat errors.** `repeat_errors` counts failures that came back after a lesson about them
  (`qa:learn ladder`); `compare` fails when it rises. `--condition lessons|no-lessons` labels an A/B arm.
- **Another project.** A score describes one QA root. Comparing two projects compares two products.

## Against other tools

Test-management hubs (Testmo, ReportPortal, Allure TestOps) store and chart results. They are a
different category, and this bundle can feed one (`/qa-upload`). Agentic QA kits generate tests, but
none of the ones surveyed (`docs/skill-sources.md`) gates its own release on a measured score. The
lock-in cost is real: the bundle runs inside Claude Code, and its measures depend on its own
artifacts. A project that leaves keeps the files, but not the scorer.
