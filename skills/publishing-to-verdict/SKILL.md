---
name: publishing-to-verdict
description: Use after /qa-run to send results.json or junit.xml and evidence to the verdict hub for history and flake scores (/qa-upload).
version: 1.0.0
---

# Publishing to Verdict

> Profile first, by section (`profile.mjs`) — `§Test management` (the verdict project and server),
> `§Environments`. `.claude/CONTRACTS.md` §2 defines the run evidence layout.
> `verdict` is the agentic-fx report hub: it ingests CTRF, JUnit XML, Playwright JSON, Allure and
> a dozen other formats, keeps the evidence, and scores flakiness and gates across runs.

## Action

Upload `<qa-root>/runs/<type>/<slug>/<run-id>/` to verdict and record the run URL beside the evidence.

## Why this is worth doing at all

The bundle already produces every artifact a release needs. What it does not produce, and cannot,
is **history**. Four things only exist once runs accumulate in one place:

| What | Why the local artifacts cannot give it |
|---|---|
| **Flakiness score** | needs the same test across many runs; a single run cannot tell flaky from failing |
| **Trend** | pass rate over 40 runs, per type — the number a sprint review actually wants |
| **Cross-project comparison** | one team's e2e suite against another's, in the same vocabulary |
| **Gates that outlive a session** | a quality gate evaluated server-side, the same way for CI and for a person |

This is also the seam where `stlc` and `ai-eval` meet: functional runs and LLM eval runs land in
the same hub, for the same build, under the same project.

## Nothing is converted

Every run already writes, into its own evidence folder (`playwright.config.ts` § reporter):

```
<qa-root>/runs/<type>/<slug>/<run-id>/results.json   Playwright JSON — richer per-test detail
<qa-root>/runs/<type>/<slug>/<run-id>/junit.xml      JUnit XML — the universal fallback
```

Verdict reads both natively. Prefer `results.json`: it carries steps, attachments and retries that
the JUnit XML flattens away. For non-Playwright tiers, upload whatever the runner wrote — Allure
results for pytest and WebdriverIO, `go test -json` for Go, the ZAP report for security.

## Inputs — resolve before uploading (STOP conditions)

1. `§Test management → Verdict project` — the project key. Missing → STOP and say so; a run
   uploaded under the wrong project pollutes another suite's history and flakiness scores.
2. `VERDICT_URL` and `VERDICT_API_KEY` in `<qa-root>/.env.<env>`. No `VERDICT_URL` → **do not fail the
   run**. Print the exact upload command and say it was skipped. Reporting is not the run.
3. A run directory containing `results.json` or `junit.xml`. Neither → STOP: the run produced no
   machine-readable report, which is a reporter-configuration problem, not an upload problem.

## Step 1: Upload

```bash
node <qa-root>/scripts/shared/verdict-upload.mjs --type api --slug checkout-discount --env uat
# or, explicitly:
node <qa-root>/scripts/shared/verdict-upload.mjs --run <qa-root>/runs/api/checkout-discount/2026-09-16-1420
```

The script prefers the `verdict` CLI when it is on PATH, because the CLI uploads **evidence** —
screenshots, traces, videos — through presigned URLs. Without the CLI it falls back to plain HTTP,
which sends results only, and says so rather than letting anyone assume the screenshots are there.

## Step 2: Tag so the hub can answer questions

| Tag | Answers |
|---|---|
| `<slug>` | how has this feature's suite behaved over time |
| `nightly` / `smoke` / `regression` | which cadence a run came from |
| `@tms:<id>` where cases carry one | link a hub result back to the TMS item |

`--type` is the test type (`unit`, `api`, `integration`, `e2e`, `security`, `performance`,
`accessibility`, `mobile`) and `--env` the environment. **Runs are only compared within the same
environment**, so an env typo silently splits a suite's history into two.

## Step 3: Record the URL beside the evidence

The script writes `.verdict-run.json` (`{run_id, url}`) into the run folder. The report cites it,
so a scorecard reader can open the run rather than take the summary's word for it.

## Step 4: The gate, when you want one

```bash
verdict gate --wait --timeout 10m    # exit 0 = passed, 1 = failed, 3 = not evaluable
```

Verdict's gate is evaluated server-side, which makes it the same gate for CI and for a person.
It is **not** a replacement for `§Quality gates` in the profile: the profile's gates decide the
report's verdict from this run's evidence; verdict's gate decides against history — new failures,
pass-rate drops, flaky count.

Note that verdict has a `not_evaluable` gate state. Use it rather than forcing a pass or a fail
when the run could not answer the question — a truncated run, a suite that did not execute, an
environment that was not ready.

## Step 5: Failures are reported, never swallowed

An upload failure does not fail the run and does not disappear. The run is valid and its local
evidence is complete; the message says exactly that, and gives the retry command.

Uploading is reporting. Losing a report is annoying; failing a green run because a hub was
unreachable teaches people to stop trusting the pipeline.

## Idempotency

The script derives an idempotency key from `<slug>-<type>-<run-id>`. Re-running the same upload
updates the existing run instead of creating a duplicate — which matters when a CI job retries.

## Quality bar (self-check before reporting done)

- [ ] The project key comes from `§Test management`, not from a guess.
- [ ] `--type` and `--env` match the run's actual type and environment.
- [ ] `results.json` preferred over `junit.xml` when both exist.
- [ ] Evidence directory passed, so attachments travel with the results.
- [ ] `.verdict-run.json` written into the run folder and cited by the report.
- [ ] A missing `VERDICT_URL` skipped the upload and printed the command — it did not fail the run.
- [ ] An upload failure was reported with its retry command, and the run's verdict was unchanged.
