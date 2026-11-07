---
name: importing-existing-suite
description: Use when a project already has tests: inventory exports and scripts, duplicates, weak steps (/qa-import).
version: 1.0.0
---

# Importing an existing suite

> Profile first, by section (`profile.mjs`): `§Project` (QA root, artifact language), `§Test
> management` (which source is the project's own TMS). QA root defaults to `<qa-root>/`.

## Prime directive: take stock before you add
A company that already runs thousands of cases does not need more cases first. It needs to know
what it has: what repeats, what no reader could execute, which scripts prove which case, which
scripts prove nothing anyone wrote down. Every later command (`/qa-coverage`, `/qa-regression`,
`/qa-design`) is guesswork on a suite nobody has counted. This skill counts it, and changes nothing:
the sources stay where they are, and no case is rewritten here.

## Action
Produce `<qa-root>/imported/inventory.jsonl` and `<qa-root>/reports/import/YYYY-MM-DD-import.md`
(CONTRACTS §29), then a short reading of the report for the QA lead.

## Inputs: resolve before importing (STOP conditions)
1. **One export per tool.** Cases often live in several places at once (Jira with Xray or Zephyr,
   Azure DevOps Test Plans, TestRail, spreadsheets). Ask the user for every place, then one CSV or
   JSON export from each. How to export from each tool: [`references/export-recipes.md`](references/export-recipes.md).
   No export → STOP and hand them the recipe; never scrape a TMS UI and never ask for a token here.
2. **A name per source**, lowercase-kebab (`jira`, `ado`, `testrail`, `excel-billing`). It prefixes
   ids that the export lacks, and it names the source in the report.
3. **Script folders** (optional): the directories of existing automated tests, in this repo or a
   checked-out sibling. Without them automation is `not measured`, never 0 %.

## Procedure
1. Put the exports under `<qa-root>/imported/exports/` (gitignored: exports can carry customer
   data). Check each one's header row against `ALIASES` in `scripts/shared/import-suite.mjs`. A
   tool that names a column differently gets the header renamed in the export, never a guessed mapping.
2. Run from the QA root:
   `npm run qa:import -- --source jira=imported/exports/jira.csv --source ado=imported/exports/ado.json --scripts ../tests`
3. Read the report top-down and write the reading (below). The script refuses an export it cannot
   read (no id or title column); fix the export, never the script's aliases for one file.
4. Settle with the lead what happens to each duplicate group. Retiring a duplicate happens in the
   source tool by its owner. This skill never deletes or edits a source case.

## The reading: what the lead gets in chat
- Totals: cases per source, unique cases, exact and near duplicates.
- The three modules with the most flagged cases, and the dominant flag in each.
- Automation: linked cases / unique cases, orphan scripts. Say plainly that a link is evidence a
  script names the case, not proof that it tests what the case says.
- The order of work for an existing suite, with the command for each step:
  1. **Dedupe** (owners, in the source tools).
  2. **Measure the scripts that exist**: `/qa-flaky` on the linked scripts, then `/qa-regression`
     to curate `@smoke` / `@regression` from run evidence and `/qa-run-plan` for the standard sets.
  3. **Grow only where a feature lands**: `/qa-impact <slug>`, then `/qa-design`, which promotes the
     module's imported cases (CONTRACTS §29) and designs only the gaps.

## Promotion (done by `/qa-design`, defined here)
An imported case becomes a §7 case only when a feature touches its module. The designer rewrites
it in the case template and passes `qa:lint` like any other case. Its `## Grounding` cites
`- ticket: <source>:<id> § imported`, and its traceability row is the feature's. When the source is
the project's §Test management TMS, the source id is a real work-item id, so the case carries
`@tms:<id>` and `/qa-publish` updates that item instead of creating a twin. A case from any other
source keeps its id in Grounding only. Promoting a whole suite in one go is refused: 4,000 rewrites
nobody reviews is worse than 4,000 cases nobody reads.

## Done criteria
- [ ] Every place the user named has a source in the report, or a line saying why not
- [ ] The report and inventory exist; `imported/exports/` is gitignored
- [ ] The reading was given, with the order of work and its commands
- [ ] No source case was edited, and nothing was written under `cases/`
