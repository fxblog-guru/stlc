---
name: building-domain-wiki
description: Use to build or refresh the wiki/ from inbox docs: atomic, source-cited pages for glossary, personas, BR-### rules (/qa-knowledge).
version: 1.0.0
---

# Building the Domain-Knowledge Wiki

> Profile first, by section (`profile.mjs`) — `§Project` names the product, `§Domain knowledge`
> declares where the corpus lives. QA root defaults to `<qa-root>/` (profile-overridable); all paths
> below are relative to it being `<qa-root>/`.

Turn scattered raw documents into ONE navigable, grounded knowledge base at `<qa-root>/wiki/` that
every other skill in this bundle can retrieve from deterministically. Philosophy: **restructure,
don't summarize** — and **compile, don't just retrieve**: the wiki is a librarian's card catalog
(atomic files + one index), not a vector database. Retrieval is agentic: a consumer opens
`compiled/index.md`, follows the link to the one atomic page that scopes its question, and reads
that page whole — tables intact, nothing chunked, nothing embedded.

This is a **testing-only** workflow: the wiki is read-only grounding for QA phases; it never
feeds implementation work, and application source is never modified.

---

## The wiki contract (fixed layout — consumers resolve these paths)

```
<qa-root>/wiki/
  inbox/            # 📥 users drop raw docs here (pdf, docx, xlsx, csv, md, txt, yaml, json…)
  .tmp/             # 🔄 converted markdown — IMMUTABLE; kept as searchable fallback evidence
  archive/          # 📦 original files moved here after conversion — IMMUTABLE source of truth
  compiled/         # 📚 the wiki itself — atomic pages, organized by category
    index.md        #    master index — the ONLY entry point consumers start from
    glossary/       #    one term per file
    personas/       #    one persona per file
    business-rules/ #    one rule per file, permanent BR-### ids
    concepts/       #    one entity/feature/module per file
    workflows/      #    one process per file
    references/     #    contradictions.md, past-bugs.md, external links
  WIKI-RULES.md     # compilation rules (ships with the workspace scaffold)
  CHANGELOG.md      # one dated entry per compile run
```

- **`archive/` and `.tmp/` are immutable** — never edit, never delete. `.tmp/` stays greppable
  so exact source wording can always be re-checked.
- **Atomic pages only** — one term / rule / persona / concept per file, kebab-case filename.
  Monolithic dumps are forbidden: they dilute retrieval scope.
- **Every page cites its sources** — frontmatter lists the `archive/` (or `.tmp/`) files each
  fact came from. A page that cannot cite a source does not get written.

## Entry criteria (verify before starting — STOP conditions)

1. **Something to ingest or compile**: files present in `<qa-root>/wiki/inbox/`, unprocessed files in
   `<qa-root>/wiki/.tmp/` (converted but never compiled), or document paths named by the user (copy
   them into `inbox/` first). None of the three → STOP: report "nothing to ingest — drop
   documents into `<qa-root>/wiki/inbox/` and rerun `/qa-knowledge`". Never compile from memory or
   from the product name alone.
2. **Scaffold**: if `<qa-root>/wiki/` or any contract folder above is missing, create it (plus
   `compiled/index.md`, `WIKI-RULES.md`, `CHANGELOG.md` seeds from the workspace scaffold) and
   log that in the summary — a missing scaffold is self-healed, not a STOP.

---

## Step 1 — Convert (`inbox/` → `.tmp/` + `archive/`)

Run the bundled converter (requires `python3`; parses xlsx/csv/json natively with optional
`pandas`/`pypdf`, doc/docx via macOS `textutil`, chunks large files, mirrors inbox subfolders):

```bash
python3 .claude/skills/building-domain-wiki/scripts/raw_to_md_converter.py   # wiki root defaults to <qa-root>/wiki
```

Then verify: every inbox file either (a) has ≥1 converted `.md` in `.tmp/` and its original
moved to `archive/`, or (b) is listed by name in the summary as **skipped — unsupported or
unparseable** with the reason. A skipped file is a reported gap, NEVER silently dropped and
NEVER hand-fabricated from its filename. `.md` inbox files are copied to `.tmp/` verbatim.

If `python3` is unavailable, convert nothing: ask the user to supply markdown/text exports and
list the blocked binaries.

## Step 2 — Compile (`.tmp/` → `compiled/`) — restructure, don't summarize

Read every unprocessed `.tmp/` file end-to-end, then write atomic pages:

- **DO NOT** compress details away: exact limits, error codes, role names, state values,
  step-by-step edge cases, and full data tables are the payload — carry them whole, as markdown
  tables / lists / code blocks.
- **DO** delete noise: boilerplate, CSS/HTML junk, legal footers, page headers.
- **Split by concern**: e.g. `.tmp/loans-brd_pages_1_to_15.md` may yield
  `business-rules/br-012-loan-approval-limit.md`, `concepts/cash-loan.md`, and
  `glossary/disbursement.md` — never one `loans-brd.md`.

Every compiled page starts with this frontmatter (`WIKI-RULES.md` carries the same template):

```markdown
---
title: <page title>
category: glossary | persona | business-rule | concept | workflow | reference
sources:
  - archive/<original file>          # or .tmp/<file> when the source arrived as markdown
updated: YYYY-MM-DD
status: draft | reviewed
---
```

Category-specific rules:

- **business-rules/** — filename `br-<NNN>-<short-desc>.md`; H1 `# BR-<NNN> — <rule>`. BR ids
  are permanent: never renumber, reuse, or backfill — mint the next free id. State the rule
  verifiably (subject, trigger, outcome) exactly as REQ statements are phrased in `analyzing-docs`.
- **glossary/** — `<term>.md`: definition, context of use, aliases, `[[links]]` to related pages.
- **personas/** — `<persona>.md`: role, goals, permissions, the modules they touch.
- **concepts/** & **workflows/** — overview, details (tables preserved), related pages, source table.
- **references/contradictions.md** — whenever two sources disagree, append
  `| topic | source A says | source B says | status |`. Contradictions are flagged, never
  silently resolved; `analyzing-docs` escalates them as CON-### entries.

**Upsert, never duplicate**: match candidates against existing compiled pages by title/BR
statement; update the page (and its `sources:` + `updated:`) instead of minting a sibling.

## Step 3 — Index + changelog

Regenerate `compiled/index.md`: every page linked under its category heading with a one-line
hook — this file is the retrieval entry point, so a page missing from the index is invisible.
Append one dated entry to `CHANGELOG.md`: files ingested, pages created/updated, contradictions
flagged.

**Impact-map hook**: for every `BR-###` minted or whose statement changed in this run, invoke
`maintaining-impact-map` (Mode A) to upsert the row `| BR-### | ? | ? | — | — | minted <date> from
<archive file> |` in `<qa-root>/docs/impact-map.md`. The module stays `?` until `/qa-impact` or a designer
resolves it — never fill a module from memory.

## Step 4 — Incremental runs

Re-running `/qa-knowledge` processes only what changed: new inbox files (Step 1), `.tmp/` files
newer than their compiled pages or never compiled. Touched pages get their cross-references and
index entries refreshed. Never rebuild unchanged pages — `updated:` dates are evidence of review.

---

## How consumers retrieve (the agentic-RAG contract, for reference)

`analyzing-docs`, `designing-*`, and the agents resolve domain lookups in this order once
`<qa-root>/wiki/compiled/index.md` exists (per PROJECT-PROFILE `§Domain knowledge`):

1. Open `compiled/index.md`, follow the link(s) scoping the question, read those atomic pages whole.
2. Cite what was used — page path + its `sources:` entry (e.g. "BR-012 per
   `<qa-root>/wiki/compiled/business-rules/br-012-loan-approval-limit.md` ← `archive/loans-brd.pdf`").
3. Fall back to grepping `.tmp/` only for exact source wording; `.tmp/` is evidence, not truth.
4. Not in the wiki → say so (gap/question) — never guess from the wiki's silence.

## Exit criteria (measurable — verify before handoff)

- [ ] `inbox/` is empty OR every remaining file is reported as skipped-with-reason.
- [ ] Every compiled page has frontmatter with ≥1 `sources:` entry and appears in `compiled/index.md`.
- [ ] Every business rule has a permanent, collision-free `BR-<NNN>` id.
- [ ] Contradictions between sources are logged in `references/contradictions.md` — zero silent resolutions.
- [ ] `CHANGELOG.md` has a dated entry for this run.
- [ ] Every `BR-###` minted or changed this run has a `(BR, ?)` row in `<qa-root>/docs/impact-map.md`.
- [ ] `archive/` and `.tmp/` untouched except by the converter (adds only).

## Done checklist

- [ ] Chat summary given: files ingested, skipped (with reasons), pages created/updated per
      category, new BR ids, contradictions flagged.
- [ ] Handoff offered: "Wiki updated — `<qa-root>/wiki/compiled/index.md`. `/qa-analyze` and
      `/qa-design` will now ground domain lookups in it automatically."

Do NOT extract REQ ids, design cases, or write anything under `<qa-root>/analysis/`, `<qa-root>/plans/`,
`<qa-root>/cases/` here — the wiki is grounding INPUT for those phases (`/qa-analyze` onward), not a
substitute for them.
