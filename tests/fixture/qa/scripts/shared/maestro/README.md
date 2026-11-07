# shared/maestro — the Maestro kit every mobile flow reuses

The `maestro` runner (PROJECT-PROFILE §Platforms, CONTRACTS §15 and §20) runs mobile flows from
inside `<qa-root>/`: no second repo, no handoff. The kit is shaped like `scripts/shared` for Playwright,
one layer per job, and a case flow only *composes* the layers:

```
scripts/mobile/<module>/TC-MOB-<MODULE>-<NNN>-<desc>.yaml    one case = one flow (the spec)
        │ runScript  ../../shared/maestro/scripts/run-context.js      timeouts, run id, platform
        │ runScript  ../../shared/maestro/elements/<module>.js         the module's ids (page object)
        │ runFlow    ../../shared/maestro/flows/<action>.yaml          reusable actions (flows layer)
        │ runFlow    ../../shared/maestro/flows/<module>/create-<entity>.yaml   test data (factory layer)
        ▼ onFlowComplete: runFlow ../../shared/maestro/flows/cleanup.yaml   always, even on failure
```

| Path | Job | Playwright twin |
|---|---|---|
| `config.yaml` | the workspace: which files are flows, tag defaults, execution order | `playwright.config.ts` |
| `scripts/run-context.js` | `output.T.*` (every duration), `output.run` (run id, worker, platform) | `constants/timeouts.ts`, `config/env.ts` |
| `elements/app.js` · `elements/<module>.js` | `output.<module> = { list: 'orders-list', … }` — the ONLY place an id is written | `pages/<module>/*.page.ts` locators |
| `flows/launch-clean.yaml` | launch with cleared state and the case's permissions | `beforeEach` restart |
| `flows/sign-in.yaml` + `scripts/actor.js` | sign in as a pool actor (`ACTOR` env), arrival asserted | `as(actor)` / `pageAs(actor)` |
| `flows/network.yaml` | offline / online (`STATE` env); Android only, a labelled skip on iOS | `Network.goOffline/goOnline` |
| `flows/<module>/create-<entity>.yaml` | builds a unique name, creates the record through `api.js`, registers its undo | `data/<module>.factory.ts` |
| `flows/cleanup.yaml` + `scripts/cleanup.js` | restore the network, undo every registered record | `data/cleanup.ts` ledger |
| `scripts/unique.js` | `uniqueName(label)` → `qa-<run id>-<platform>-<shard>-<n>-<label>` | `data/unique.ts` |
| `scripts/api.js` | the one place HTTP is issued — a request described by env (`METHOD`, `PATH`, `BODY`, `SAVE_AS`, `UNDO`) | `http/api.client.ts` |
| `../../mobile/run-maestro.mjs` | the runner: `.env.<env>` → `-e` vars, tags, device, JUnit, evidence | `run-plan.mjs` + reporters |

Maestro runs each `runScript` in its own JavaScript context and keeps only the `output` object
between them, so no script here relies on a function defined by another: each one is a complete
step driven by its `env:` inputs.

## Rules every flow follows (`npm run qa:lint` checks the ones marked *lint*)

1. **One case = one flow file**, at the case's path with `cases/` → `scripts/` and `.md` → `.yaml`.
   A flow with no case is an error (*lint*).
2. **`name:` is `<Case ID> — <case title>`** — Maestro uses it as the JUnit test name, which is how
   a result maps back to the traceability row (*lint*: the id is required, the title text a warning).
3. **`appId: ${APP_ID}`** — never a literal: the runner sets it per platform from `.env.<env>`
   (*lint*).
4. **`tags:`** carry `mobile`, the module, the priority and the case's suite tags (`smoke`,
   `regression`) as bare words, so `--include-tags` selects exactly what a suite means (*lint*).
5. **Every case step is one labelled block** — `- runFlow: { label: "Step N: <action> → <expected>",
   commands: [...] }` — numbered 1..n in order (*lint*). A step the flow cannot run keeps its label
   and a `# COVERAGE-GAP: <reason>` comment; it is never renumbered away.
6. **No raw selectors.** `id:` values come from the element map: `id: ${output.orders.list}`
   (*lint*). Visible-text selectors are allowed only for text the case quotes as its Expected.
7. **No fixed waits, no literal timeouts.** Wait for a condition (`extendedWaitUntil`) with
   `timeout: ${output.T.<name>}` (*lint*).
8. **Every Expected is an assertion** with its value — `assertVisible: { id: …, text: "Open" }`,
   not a tap that happens to succeed.
9. **Data comes from a factory and is cleaned up.** Names from `uniqueName()`; every create registers
   its undo; `onFlowComplete: - runFlow: ../../shared/maestro/flows/cleanup.yaml` (*lint*: warning
   when missing). Parallel devices never collide.
10. **Secrets never sit in a flow.** Credentials come from `.env.<env>` through the runner as `-e`
    variables (`TEST_PASSWORD` …); a flow names the variable, never the value.
11. **Platform differences live in one flow**, behind `when: { platform: Android }` blocks — never
    two twin flows. A device condition the platform cannot produce (airplane mode on iOS) is a
    labelled skip line in the evidence, never a silent pass.

## Bootstrapping a module

The first case of a module creates `elements/<module>.js` and, when it creates data,
`scripts/<module>.data.js`; later cases extend them. A new reusable action becomes
`flows/<action>.yaml` with its inputs documented in a header comment. Nothing here is edited to
make one case pass: a missing id in the app is a `FRAMEWORK-GAP` for the mobile developers (a
`testID` / `resource-id` the app must expose), recorded in the case's report line.
