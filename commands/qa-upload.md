---
description: Send a run's results and evidence to the verdict hub for history, flake scores and server-side gates.
argument-hint: <slug> [--type <t>] [--run <dir>] [--env <env>] [--tag <t>] [--gate]
disable-model-invocation: true
---

Follow `qa-phase-protocol` (invoke the skill if it is not already in context); this file holds only what is specific to this command.

> Profile first, by section (`profile.mjs`) — `§Test management` (the verdict project and server),
> `§Environments`, `§Test types`. Runs live at `<qa-root>/runs/<type>/<slug>/<run-id>/` (CONTRACTS §2).

Upload run evidence to [`verdict`](https://gitlab.com/agentic-fx/verdict). Runs after `/qa-run`,
and is the only command in the bundle that talks to the hub.

## Arguments

- **`<slug>`** — the feature slug
- `--type <t>` — one enabled test type, or omit to upload every type that has a run for this slug
- `--run <dir>` — upload one specific run directory instead of the latest
- `--env <env>` — the environment (default: the run's own env, else `§Environments` default).
  **Runs are only compared within the same environment**, so a typo here silently splits a suite's
  history in two.
- `--tag <t>` — repeatable: `nightly`, `smoke`, `regression`, a build id
- `--gate` — after uploading, run `verdict gate --wait` and report the server-side verdict

## Preconditions (check before delegating)

- [ ] `§Test management → Verdict project` is set. Missing → STOP: a run uploaded under the wrong
      project pollutes another suite's history and its flakiness scores
- [ ] the run directory exists and contains `results.json` or `junit.xml`. Neither → STOP and say
      the run produced no machine-readable report — that is a reporter-configuration problem
- [ ] `VERDICT_URL` in `<qa-root>/.env.<env>`. **Absent is not an error**: print the exact upload command,
      report it as skipped, and exit 0

## Execution

Delegate to `qa-reporter` (it invokes `publishing-to-verdict`), which runs:

```bash
node <qa-root>/scripts/shared/verdict-upload.mjs --type <t> --slug <slug> --env <env>
```

Nothing is converted. Every run already writes `junit.xml` and `results.json` into its evidence
folder, and verdict reads both natively. `results.json` is preferred where both exist: it carries
steps, attachments and retries that the JUnit XML flattens away.

The script prefers the `verdict` CLI when it is on PATH, because the CLI also uploads **evidence** —
screenshots, traces, videos — through presigned URLs. Without it, results go up over plain HTTP and
the output says the attachments did not.

## What the hub gives you that the local artifacts cannot

| What | Why it needs a hub |
|---|---|
| flakiness score | needs the same test across many runs; one run cannot tell flaky from failing |
| trend | pass rate over 40 runs, per type — what a sprint review actually wants |
| cross-project comparison | two teams' suites in the same vocabulary |
| gates that outlive a session | evaluated server-side, identically for CI and for a person |

It is also where `stlc` and `ai-eval` meet: functional runs and LLM eval runs land in the same hub,
for the same build, under the same project.

## Done criteria (exit gate)

- Every uploaded run wrote `.verdict-run.json` (`{run_id, url}`) into its own evidence folder, and
  the report for that slug cites it.
- `--type` and `--env` match the run's actual type and environment.
- Tags include the slug, plus the cadence when the run came from one.
- With `--gate`: the server-side verdict is reported as `passed`, `failed` or **`not_evaluable`** —
  the last is a real state and is never converted into one of the other two.
- A failed upload reported the reason **and the retry command**, and did **not** change the run's
  own verdict. Uploading is reporting; a green run does not become red because a hub was
  unreachable.

Report back: per uploaded run — type, env, run id, the verdict URL, whether evidence went with it,
and the server-side gate result when `--gate` was used.
