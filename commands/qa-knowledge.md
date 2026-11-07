---
description: Build or refresh the domain wiki (<qa-root>/wiki/) from raw docs in the inbox: compiled, indexed, cited.
argument-hint: [doc-paths…]
disable-model-invocation: true
---

Follow `qa-phase-protocol` (invoke the skill if it is not already in context); this file holds only what is specific to this command.

> Profile first, by section (`profile.mjs`) — `§Project` names the product and `§Domain knowledge`
> declares the corpus location. QA root defaults to `<qa-root>/` (profile-overridable).

Build or incrementally update the domain-knowledge wiki at `<qa-root>/wiki/`. This is a **support
phase**, runnable at any time — but most valuable BEFORE `/qa-analyze`, because analysis and
case design ground their domain lookups (glossary terms, personas, business rules `BR-###`)
in `<qa-root>/wiki/compiled/index.md` once it exists.

## Arguments

- **`$ARGUMENTS` (optional)** = document paths to ingest — they are copied into
  `<qa-root>/wiki/inbox/` first. With no arguments, whatever is already in `inbox/` (plus any
  converted-but-uncompiled `.tmp/` files) is processed.

## Preconditions (check before delegating)

- [ ] Something to process exists: files in `<qa-root>/wiki/inbox/`, paths in `$ARGUMENTS`
      (each must exist and be readable), or uncompiled files in `<qa-root>/wiki/.tmp/`
- [ ] For binary inputs (pdf/docx/xlsx…): `python3` is available for the bundled converter —
      if not, report which files are blocked and ask for markdown/text exports instead

If nothing is available to process, STOP and report: "nothing to ingest — drop documents into
`<qa-root>/wiki/inbox/` (or pass paths) and rerun `/qa-knowledge`". Never compile pages from memory.

## Execution

Delegate to the `doc-analyst` agent (it invokes the `building-domain-wiki` skill), passing the
resolved input list. The skill:

1. Converts `inbox/` files to markdown in `<qa-root>/wiki/.tmp/` (originals → `<qa-root>/wiki/archive/`,
   both immutable afterwards).
2. Compiles atomic, source-cited pages under `<qa-root>/wiki/compiled/` — glossary, personas,
   business rules (permanent `BR-###` ids), concepts, workflows, references — restructuring,
   never summarizing; contradictions between sources are flagged in
   `compiled/references/contradictions.md`, never silently resolved.
3. Regenerates `compiled/index.md` (the single retrieval entry point) and appends to
   `<qa-root>/wiki/CHANGELOG.md`.
4. For every `BR-###` minted or changed, upserts its `(BR, ?)` row in `<qa-root>/docs/impact-map.md` via
   `maintaining-impact-map` Mode A — module stays `?` until `/qa-impact` or a designer resolves it.

Re-runs are incremental and upsert existing pages — no duplicates, no renumbered BR ids.

## Done criteria (exit gate)

- `<qa-root>/wiki/inbox/` is empty OR every remaining file is reported skipped-with-reason.
- Every compiled page carries `sources:` frontmatter and is linked from `compiled/index.md`.
- `CHANGELOG.md` has a dated entry for this run.
- Every new/changed `BR-###` has an impact-map row (module `?` allowed).

Report back: files ingested / skipped (with reasons), pages created/updated per category, new
`BR-###` ids minted, contradictions flagged, and the pointer: "domain lookups in `/qa-analyze`
and `/qa-design` now resolve through `<qa-root>/wiki/compiled/index.md`".
