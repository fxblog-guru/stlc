---
description: Step 1 · analyze docs, URLs, Jira keys or the dev handoff packet into REQ ids, risks and a testability matrix.
argument-hint: <slug> <doc-paths | urls | JIRA-KEYS…>
disable-model-invocation: true
---

Follow `qa-phase-protocol` (invoke the skill if it is not already in context); this file holds only what is specific to this command.

> Profile first, by section (`profile.mjs`): it defines the product (§Project, §Application under
> test), the enabled test types (§Test types), and the QA root used below (default `<qa-root>/`,
> profile-overridable).

Analyze the source material for feature `<slug>` and produce
`<qa-root>/analysis/<slug>/YYYY-MM-DD-analysis.md` (today's date). This is step 1 of the pipeline:
`/qa-analyze` → `/qa-plan` → `/qa-design` → `/qa-script` → `/qa-run` → `/qa-report`.

## Arguments

- **First token of `$ARGUMENTS`** = `<slug>` — the feature identifier every later phase keys on.
- **Remaining tokens** = one or more raw inputs: local document paths, OpenAPI spec files, URLs, or
  tracker keys (Jira `PROJ-123` — fetched read-only through the Atlassian MCP and snapshotted to
  `<qa-root>/analysis/<slug>/sources/<KEY>.md`; the analysis cites the snapshot, the ticket is never edited).
- **A dev handoff packet** — `dev/release/<slug>/qa-handoff.md`, written by the agentic-fx-dev bundle
  at its G9 gate. When present it is the primary input: its `REQ-NNN` ids are reused **verbatim**
  (never renumbered — both bundles' contracts forbid it), its *Automation-tier criteria* section is
  the scope of the testability matrix, its *Acceptance criteria* table says what the dev bundle
  already proved with unit/integration tests, and its shipped commit SHA is cited in the analysis.

## Preconditions (check before delegating)

- [ ] `<slug>` is kebab-case (`[a-z0-9]+(-[a-z0-9]+)*`) — it becomes a directory segment in every
      artifact path; reject spaces, uppercase, and `/`
- [ ] At least one document/URL is supplied after the slug
- [ ] Every local path exists and is readable; every URL fetches successfully; every tracker key
      resolves (connector authorized, issue visible) — else STOP naming the key
- [ ] `change_type` is resolved (see Entry criteria below)

If any precondition fails, STOP and report exactly what is missing (bad slug, unreadable path,
dead URL, unknown `change_type`). Never write a partial analysis.

## Entry criteria (contract for `analyzing-docs`)

The analysis skill requires:

- `change_type: new_project | update_existing | add_feature`. If the user did not state it, infer:
  `<qa-root>/analysis/<slug>/` or `<qa-root>/plans/<slug>/` already containing artifacts implies
  `update_existing`; otherwise ask the user to choose before delegating — do not guess between
  `new_project` and `add_feature`.
- Raw inputs: the docs, OpenAPI specs, and URLs from `$ARGUMENTS`, passed through verbatim.

## Execution

Delegate to the `doc-analyst` agent (it invokes the `analyzing-docs` skill), passing `<slug>`,
`change_type`, the full input list, and — when one of the inputs is a dev handoff packet — the
instruction that its REQ ids are authoritative and its automation-tier list is the scope. The output artifact
`<qa-root>/analysis/<slug>/YYYY-MM-DD-analysis.md` must contain, at minimum:

1. **Requirements inventory** — every testable requirement with a stable `REQ-<NNN>` id. These ids
   feed the plan's `## Traceability (Requirement ↔ Case)` table and the `@req:<id>` tag, so they
   must never be renumbered on later re-runs (append new ids instead).
2. **Risk list** — ranked product/quality risks, each with impact, likelihood, and the REQ ids it
   touches.
3. **Testability matrix** — one row per test type (`unit`, `api`, `integration`, `e2e`,
   `security`, `performance`, `accessibility`): does it apply to this feature, is it enabled in §Test types, supporting
   evidence from the docs, and a suggested priority. Types disabled in the profile are marked
   `disabled` — never silently dropped.
4. **Open questions** — each tagged `blocking` or `non-blocking`. `/qa-plan` refuses to run while
   blocking questions are unresolved, so word them answerably.

## Done criteria (exit gate, per change_type)

- `new_project` — full inventory: every supplied doc mapped to at least one REQ id or explicitly
  marked out of scope; every enabled type assessed in the matrix.
- `update_existing` — a delta section listing changed/removed REQ ids against the previous
  analysis in `<qa-root>/analysis/<slug>/`, plus the impact on existing cases.
- `add_feature` — new REQ ids plus an impact list of existing modules/cases the addition touches.

Report back: the artifact path, REQ count, top 3 risks, which enabled types apply, and any
**blocking** open questions the user must resolve before `/qa-plan`.
