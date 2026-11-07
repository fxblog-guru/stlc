---
description: Prepare this machine to test: tools per enabled type and platform, install commands; --install asks then installs.
argument-hint: [<env>] [--install]
disable-model-invocation: true
---

Follow `qa-phase-protocol` (invoke the skill if it is not already in context); this file holds only what is specific to this command.

> Profile first, by section (`profile.mjs`) — `§Test types`, `§Platforms`, `§Unit testing`. QA root
> defaults to `<qa-root>/` (profile-overridable).

Prepare the machine for environment `$ARGUMENTS` (default: the `§Environments` default env). Run it
once per machine, after `afx install`, and again whenever a type or platform is enabled. `/qa-env`
comes after it: this command checks the machine, `/qa-env` checks the environment.

## Preconditions (check before delegating)

- [ ] `<qa-root>/scripts/shared/setup-check.mjs` exists (bundle installed); missing → STOP: `afx install` / `afx update`
- [ ] `.claude/PROJECT-PROFILE.md` exists with `§Test types` filled

## Hard rules

- Without `--install` nothing is installed: the output is the plan.
- With `--install`: every machine-wide installer and every `claude mcp add` is shown and confirmed on
  its own; `sudo` is never run; nothing is installed inside the app repo or the mobile framework repo.
- `.env.<env>` is created from `.env.example` only when absent; no value is written or printed.

## Execution

Delegate to the `qa-reporter` agent to invoke the `preparing-test-tooling` skill. It runs
`npm run qa:setup -- --env <env>` from `<qa-root>/`, reports MISSING / optional rows with their install
commands, installs on the user's yes when `--install` is given, and re-checks.

## Done criteria

Report: tools ok / missing / optional per enabled type and platform, what was installed, every
still-missing tool with its command, attached devices for mobile, and `Next: /qa-env <env>`.
