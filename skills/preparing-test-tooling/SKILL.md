---
name: preparing-test-tooling
description: Use before the first test on a machine: tools per enabled type and platform, install commands, installs on a yes (/qa-setup).
version: 1.0.0
---

# Preparing Test Tooling

> Profile first, by section (`profile.mjs`) — `§Test types` (what is enabled), `§Platforms` (each
> platform's Runner), `§Unit testing` (the app repo's framework). QA root defaults to `<qa-root>/`.

## Prime directive — the machine, not the environment
This skill answers "can this machine run the tests the profile enables?": runtimes, CLIs, browsers,
drivers, an emulator, the optional agent servers. `/qa-env` answers the other question — is the
target environment reachable, filled and authorized — and runs after this one. Nothing here reads
a secret value, probes a URL or touches the app under test.

## Action
`/qa-setup [<env>] [--install]` — print the plan for this machine, then (only with `--install`, and
only after the user says yes to the listed commands) install what is missing, then check again.

## Step 1: Build the plan from the profile (never from guesses)
Run from the QA root:
```bash
npm run qa:setup -- --env <env>          # node scripts/shared/setup-check.mjs — read-only probes
npm run qa:setup -- --env <env> --json   # the same, as data
```
It derives the tools from the profile (`scripts/shared/lib/tooling.mjs`) and probes each one with a
`--version`-style command, a file check or the MCP config. Each row is `ok`, `MISSING` (required)
or `optional`, with **why** (which type/platform needs it) and the install command for this OS.

| Profile says | Required | Optional |
|---|---|---|
| always | Node ≥ 20, `npm install` in the QA root, `.env.<env>` | Allure CLI |
| api · integration · security · accessibility · ui · e2e | the QA root's `node_modules` (Playwright) | — |
| e2e · accessibility · ui | Playwright browsers, or `PW_CHANNEL=msedge\|chrome` | `playwright-cli` (live locator checks, `/qa-explore --agent` on web) |
| performance | `k6` | — |
| security | Docker (ZAP baseline) | — |
| mobile, platform Runner `maestro` | Maestro CLI, Java 17+, `adb` (android) / Xcode `simctl` (ios) | mobile-mcp server (`/qa-explore --agent` on a device) |
| mobile, platform Runner `appium-wdio` | Appium 2 + drivers (installed by the framework repo's own setup), `adb` / `simctl` | — |
| unit | the app repo's toolchain from `§Unit testing` (`dotnet` · `python -m pytest` · `mvn`/`gradle` · node) | — |
| `<qa-root>/wiki/inbox/` exists | — | Python 3 (`/qa-knowledge` converter) |

A disabled type adds nothing. iOS on Windows/Linux is reported as "needs macOS", never as a
command to run.

## Step 2: Show the plan, ask before any install
Report the `MISSING` rows first, then the optional ones, each with its command. Without `--install`
STOP here: the plan is the deliverable.

With `--install`, list the exact commands you will run and ask once; run only the ones the user
accepts. Rules for running them:
- **Inside the QA root only:** `npm install`, `npx playwright install <browser>` (only the browsers
  `PW_PROJECTS` names; none when `PW_CHANNEL` is set). Copy `.env.example` → `.env.<env>` only when
  `.env.<env>` does not exist — never overwrite it, never fill a value.
- **Machine-wide installers** (`winget`, `brew`, `apt-get`, `curl … | bash`, `npm install -g`) change
  the user's machine: each one is shown and confirmed on its own, never batched silently. `sudo` is
  never run — print the command for the user to run.
- **MCP servers** (`claude mcp add mobile-mcp …`) change the user's Claude configuration: ask
  separately, default scope `local`; never `--scope project` without the user saying so (it writes
  `.mcp.json` into the repo).
- **Never** inside the app repo or the mobile framework repo (no `npm install`, `dotnet restore`,
  `appium driver install` there) — those are that repo's own setup; print the command and the folder.
- A failed install is reported with its output's last lines; the next tool still runs.

## Step 3: Devices (mobile only) — guide, never create
`adb devices` / `xcrun simctl list devices booted`. None attached → say how to get one (Android
Studio › Device Manager › start an AVD, or a device with USB debugging; Xcode › Simulator). This skill
does not create or boot an emulator, install the app build, or grant permissions — the first time is
the user's, and `/qa-env` then checks the app id is installed.

## Step 4: Check again and hand over
Re-run `npm run qa:setup -- --env <env>`. Report ONLY:
```
✓ Tooling for <types> on <os>: {ok} ok · {missing} missing · {optional} optional skipped
Installed now: {tools} | Still missing: {tool → command} | Devices: {n | n/a}
Next: fill <qa-root>/.env.<env> → /qa-env <env>
```

## Done — ALL must be true
- [ ] The plan came from `npm run qa:setup` (the profile), not from memory of what a project "usually" needs.
- [ ] Nothing installed without `--install` and the user's yes; machine-wide and MCP changes confirmed one by one; no `sudo`, nothing in the app or framework repo.
- [ ] `.env.<env>` created only if absent, no value written; no secret read or printed.
- [ ] Re-checked after installing; every still-missing tool reported with its command.
