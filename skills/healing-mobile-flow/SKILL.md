---
name: healing-mobile-flow
description: Use to heal a failing Maestro flow: lint first, cause from run evidence, element-map fixes checked live; three attempts (/qa-heal).
version: 1.0.0
---

# Healing a Maestro Flow

> Profile first, by section (`profile.mjs`) — `§Platforms` (which mobile platforms run on `maestro`),
> `§Application under test` (the app source that owns the accessibility ids), `§Quality gates`.
> The QA root defaults to `<qa-root>/`; commands below run from it. Contract: CONTRACTS §15 Maestro.

> The locator score, root-cause-first and the three-attempt stop are `healing-e2e-script`'s.

## Scope guardrail
Only flows under `<qa-root>/scripts/mobile/**/TC-MOB-*.yaml` and the kit they compose
(`<qa-root>/scripts/shared/maestro/`). A WebdriverIO spec on an `appium-wdio` platform lives in the
mobile framework repo: it is never healed here — the fix is a `FRAMEWORK-GAP` or a regenerated staged
spec (`/qa-script --type mobile`), handed over through `HANDOFF.md`.

## Prime directive — the flow follows the app, never the other way
A heal changes HOW a flow reaches the screen the case means, never WHAT the case proves. Expected
text, an `assertVisible`/`assertNotVisible`, a step label or a step are not healed: if one must
change, the case changed, and that is `/qa-design`.

## Step 0: Resolve the flow — by content, never by filename
1. A flow path given → use it.
2. A slug or Case ID → the plan's traceability rows with Type `mobile`, or grep `**Feature:** <slug>`
   under `<qa-root>/cases/mobile/`; the flow is the case's basename with `.yaml`. **Never glob `<slug>`.**
3. A run id → the cases `results.json` lists as `fail` under `runs/mobile/<slug>/<run-id>/<platform>/`.

## Step 1: Static gate — before any device
`npm run qa:lint`, then `npm run test:mobile:maestro -- --platform <p> --cases <id> --dry-run`.
An error here (name without the Case ID, a raw `id:`, a literal `timeout:`, a missing `runFlow`
target, labels out of 1..n) is structural: fix it, or STOP and report it. No device is started for a
flow that does not lint.

## Step 2: Read the evidence of the failing run first
From `runs/mobile/<slug>/<run-id>/<platform>/`:
- `results.json` — the failing case's message, and **`crashes`**. A crash or ANR of the app during the
  flow is `FUNCTIONAL`: STOP the heal, quote the `device.log` excerpt, route to `/qa-defect`. A flow is
  never edited around a crash.
- `artifacts/` — the failing command's screenshot and Maestro's command log: the first wrong step.
- `maestro-output.log` — `Element not found: id: …` (selector drift), a timeout (timing), an
  assertion on text (behaviour — see the prime directive).

State the cause in one line before editing: `cause: <class> — <evidence path:line>`.

| Class | Signal | Heal |
|---|---|---|
| selector drift | `Element not found` on an `${output.<module>.<key>}` id; the screenshot shows the element | the element map entry (Step 3) |
| timing | the element appears in the screenshot after the timeout | the `run-context.js` timeout the step names, or an `extendedWaitUntil` on the condition — never `sleep`/`wait` |
| navigation | a screen added or removed before the target | the kit action flow (`flows/*.yaml`) the step composes |
| data | the factory's record is missing or not unique | the factory flow / `unique.js`, never a literal name |
| platform | passes on one platform, fails on the other at a known delta | a `when: { platform: … }` branch inside the step, never a twin flow |
| crash / behaviour | `crashes` non-empty, or the app shows a different result | none — STOP (`FUNCTIONAL`) |

## Step 3: Re-resolve an element — through the element map, checked live
Ids live only in `shared/maestro/elements/<module>.js`. A heal edits that entry (one line), never a
flow line into a raw `id:` — `qa:lint` rejects that.

Resolve the new id in this order: the app source (`grounding-in-code` → the screen component that owns
it, `git log -n 10 -- <path>` for the rename; cite `app:<path>#<symbol> @ <sha>`) → the live element
tree. With a device booted, take the tree at the failing step:

```bash
maestro hierarchy                                         # the whole tree, JSON
adb shell uiautomator dump /sdcard/ui.xml && adb pull /sdcard/ui.xml   # Android, when maestro is busy
```

or, when the mobile-mcp server is connected, `mobile_list_elements_on_screen`. Score the candidate:

| Score | Candidate | Write it? |
|---|---|---|
| 5 | resource-id / accessibilityIdentifier from the app source, unique in the tree | yes |
| 4 | the same id found only in the live tree, unique | yes — and a `FRAMEWORK-GAP`-style note that the source was not found |
| 3 | content-description / accessibilityLabel, unique on the screen | yes |
| 2 | visible text | **no** — report as a candidate (text changes with copy and locale) |
| 0–1 | index, coordinates, a point | never |

Nothing below 3 is written. The tree dump (or a screenshot) is saved beside the heal report as
evidence that the id points at the element the case step means.

## Step 4: Verify on the device, three attempts at most
```bash
npm run test:mobile:maestro -- --platform <p> --cases <id> [--device <id>]
```
Green, and `crashes` empty → done. Still red after three heals → not a flow problem: re-triage
`FUNCTIONAL` (`/qa-defect`) or `SETUP/ENV` (`/qa-env`) with the three attempts listed; no fourth heal.
A flow that passes on a re-run unchanged is `FLAKY` → `/qa-quarantine` with both run ids, never a retry.

## Allowed vs never
**Allowed:** an element-map entry · a named timeout in `run-context.js` · an `extendedWaitUntil` on a
condition · a kit action flow when navigation changed · a factory fix · a `when: { platform }` branch.
**Never:** a raw `id:`/literal `timeout:` in a flow · `sleep`/`wait` · `optional: true` on a step the
case requires · removing or weakening an assertion · `retry` blocks to hide timing · the case file,
the traceability table, or app source. Before any heal, check the run's `target.json`: a flow that
broke because the device runs a different app build than the plan named is `NOT_DEPLOYED`, not a
selector problem — install the right build, do not re-map the element to the old one (CONTRACTS §31.1).

## Step 5: Report ONLY this to chat
```
✓ healed {n}/{m} flow(s) — {Case ID}: cause {class} · {file}:{line} {old} → {new} (score {s}, evidence {path}) · run {run-id} ✅
✗ not healed — {Case ID}: {crash | behaviour | 3 attempts} → {/qa-defect … | /qa-env | /qa-design …}
Next: /qa-run <slug> --type mobile to record the healed state
```

## Done — ALL must be true
- [ ] Flow resolved by traceability or `**Feature:**`; Maestro platform only; `qa:lint` clean first.
- [ ] The run's `crashes` read before any edit; a crash stopped the heal and went to `/qa-defect`.
- [ ] Cause stated with evidence before the fix; every written id scores ≥ 3, lives in the element map, and is backed by source or a saved tree dump.
- [ ] No assertion, step or label changed; no raw id, literal timeout, sleep, `optional` or retry added.
- [ ] Verified on a device, or reported unverified; at most three attempts.
