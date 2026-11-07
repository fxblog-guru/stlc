---
description: Take stock of a suite that existed before stlc: cases from every tool, duplicates, weak steps, script links.
argument-hint: "--source <name>=<export> [--source …] [--scripts <dir> …]"
disable-model-invocation: true
---

Follow `qa-phase-protocol` (invoke the skill if it is not already in context); this file holds only what is specific to this command.

> Profile first, by section (`profile.mjs`): `§Project`, `§Test management`. QA root defaults to
> `<qa-root>/` (profile-overridable).

The first command on a project that **already has tests**. A new project starts at `/qa-analyze`;
an existing one starts here, because adding or improving cases on a suite nobody has counted is
guesswork. Read-only over every source: nothing is pushed, edited or deleted in any tool.

## Preconditions (check before importing)

- [ ] The user has named **every** place cases live (Jira/Xray/Zephyr, Azure DevOps, TestRail,
      spreadsheets). Ask; companies usually have more than one.
- [ ] One CSV or JSON export per place under `<qa-root>/imported/exports/`. Missing → hand over
      `importing-existing-suite/references/export-recipes.md` and STOP.

## Execution

Invoke the `importing-existing-suite` skill. It runs `npm run qa:import` (arguments passed through)
and writes, per CONTRACTS §29:

- `<qa-root>/imported/inventory.jsonl`: one normalised case per line, with its source and id, its steps,
  its flags, and the scripts that reference it.
- `<qa-root>/reports/import/YYYY-MM-DD-import.md`: totals by source and by module, exact and near
  duplicates, step-quality flags, automation links and orphan scripts.

## Done criteria

Report back:
- the report path, then cases per source, unique cases and duplicates;
- linked cases / unique cases and the orphan-script count (or `not measured`);
- the three modules with the most flags;
- the order of work: dedupe in the tools, then `/qa-flaky` and `/qa-regression` on what exists,
  then `/qa-impact` and `/qa-design` per feature, which promotes imported cases (§29).
