# Maestro flows (reference for generating-mobile-script, Runner `maestro`)

Use this path when PROJECT-PROFILE §Platforms gives a mobile platform the Runner `maestro`. The flow
runs from `<qa-root>/` itself: no framework repo, no HANDOFF row, no Write mode. The kit is
`<qa-root>/scripts/shared/maestro/` and its README is the contract. This file shows the shapes.

## Layers (a case flow composes them, it never re-implements them)

| Layer | File | A flow writes |
|---|---|---|
| run context | `shared/maestro/scripts/run-context.js` | `${output.T.screen}`, `${output.run.id}` |
| element map | `shared/maestro/elements/<module>.js` | `id: ${output.orders.list}` |
| actions | `shared/maestro/flows/<action>.yaml` | `- runFlow: ../../shared/maestro/flows/sign-in.yaml` |
| factory | `shared/maestro/flows/<module>/create-<entity>.yaml` | `- runFlow: { file: …, env: { STATUS: Draft } }` |
| HTTP | `shared/maestro/scripts/api.js` | only inside a factory or cleanup, never in a step |
| cleanup | `shared/maestro/flows/cleanup.yaml` | `onFlowComplete: - runFlow: …/cleanup.yaml` |

Paths in a flow are relative to the flow's own folder. Maestro resolves them that way, and
`qa:lint` checks that each one exists. A case flow sits at `scripts/mobile/<module>/`, so the kit is
`../../shared/maestro/`.

## 1. A case flow

```yaml
appId: ${APP_ID}
name: TC-MOB-ORDERS-002 — [Orders · Android, iOS] Orders screen — Standard user restarts the app → the seeded draft is listed as Draft
tags:
  - mobile
  - orders
  - P1
  - smoke
onFlowStart:
  - runScript: ../../shared/maestro/scripts/run-context.js
  - runScript: ../../shared/maestro/elements/app.js
  - runScript: ../../shared/maestro/elements/orders.js
  - runFlow:
      file: ../../shared/maestro/flows/orders/create-order.yaml
      env:
        STATUS: Draft
onFlowComplete:
  - runFlow: ../../shared/maestro/flows/cleanup.yaml
---
- runFlow:
    label: "Step 1: launch with cleared state and sign in as standard → home screen visible"
    commands:
      - runFlow: ../../shared/maestro/flows/launch-clean.yaml
      - runFlow:
          file: ../../shared/maestro/flows/sign-in.yaml
          env:
            ACTOR: standard
- runFlow:
    label: "Step 2: open Orders → the seeded draft is listed"
    commands:
      - tapOn:
          id: ${output.orders.tab}
      - extendedWaitUntil:
          visible:
            text: ${output.unique.order}
          timeout: ${output.T.screen}
- runFlow:
    label: "Step 3: open the seeded draft → status shows Draft"
    commands:
      - tapOn:
          text: ${output.unique.order}
      - assertVisible:
          id: ${output.orders.status}
          text: Draft
```

How the case maps to the flow:
- `name:` is the Case ID, then ` — `, then the case H1 title. It becomes the JUnit test name.
- `tags:` hold `mobile`, the module, the priority and the suite tags, as bare words.
- Each `## Steps` item becomes one `label: "Step N: <action> → <expected>"` block, in order.
- Each Expected becomes an `assertVisible` or `extendedWaitUntil` carrying its value.
- `## Isolation creates` becomes a factory in `onFlowStart`. `cleans` becomes the cleanup hook.
- `## Preconditions` become the launch and sign-in in Step 1, or in `onFlowStart` when the case does
  not list them as steps.

## 2. A device condition

```yaml
- runFlow:
    label: "Step 2: submit the draft while offline → offline banner; draft kept"
    commands:
      - runFlow:
          file: ../../shared/maestro/flows/network.yaml
          env:
            STATE: offline
      - tapOn:
          id: ${output.orders.draftSubmit}
      - assertVisible:
          id: ${output.orders.offlineBanner}
```

`network.yaml` puts Android into airplane mode. iOS simulators have no airplane mode, so on iOS the
step leaves a labelled screenshot and the case's `## Device profile` must say how iOS is covered.
Write that as a `# COVERAGE-GAP: iOS offline needs a real device` comment above the step. Never drop
the step.

## 3. One flow, two platforms

```yaml
- runFlow:
    when:
      platform: Android
    label: "Step 3 (android): system back → Home"
    commands:
      - back
      - assertVisible:
          id: ${output.app.home}
```

Use this only when the case states a platform-specific Expected (`Expected (android): …`). Never
write twin flows per platform.

## 4. Bootstrapping a module

The first case of a module writes `shared/maestro/elements/<module>.js`:

```js
output.orders = {
  tab: 'orders-tab',
  list: 'orders-list',
  status: 'order-status',
};
```

When the case creates data, it also writes `shared/maestro/flows/<module>/create-<entity>.yaml`,
shaped like the shipped `create-order.yaml` example in the bundle fixture: `unique.js`, then
`api.js` with `METHOD` / `PATH` / `BODY` / `SAVE_AS` / `UNDO`.

Later cases EXTEND these files. They never copy them. An id the app does not expose is a
**FRAMEWORK-GAP** for the mobile developers: the app must add a `resource-id`,
`accessibilityIdentifier` or `testID`. Record it in the report, and write the flow against the key
you asked for, so the flow passes once the id ships. Never fall back to a text, index or coordinate
selector to get around it.

## Static gate (before flipping `Scripted` ✅)

Run `npm run qa:lint`. It must report no errors on the flow:
- `name:` starts with the Case ID
- `appId: ${APP_ID}`
- the tags are present
- the step labels run 1..n
- no raw `id:`
- no literal `timeout:`
- every referenced file exists

Then run `npm run test:mobile:maestro -- --platform android --cases <id> --dry-run`. It must list the
flow. Do not run the flow on a device here: `/qa-run --type mobile` owns devices and evidence.
