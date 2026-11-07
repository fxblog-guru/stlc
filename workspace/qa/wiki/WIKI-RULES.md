# Wiki compilation rules — <qa-root>/wiki/

Rules every agent follows when touching this wiki (built/updated by `/qa-knowledge`, skill
`building-domain-wiki` — if this file and the skill ever disagree, the skill wins).

## Layout (fixed contract)

| Path | Purpose | Mutability |
|---|---|---|
| `inbox/` | drop raw docs here (pdf, docx, xlsx, csv, md, txt, yaml, json…) | staging |
| `.tmp/` | converted markdown — searchable fallback for exact source wording | **immutable** |
| `archive/` | originals after conversion — permanent source of truth | **immutable** |
| `compiled/` | the wiki: atomic pages by category + `index.md` | upsert only |
| `CHANGELOG.md` | one dated entry per compile run | append only |

## Principles

1. **Never edit `archive/` or `.tmp/`** — they are immutable source documents.
2. **Atomic pages only** — one term / rule / persona / concept / workflow per file,
   kebab-case filename. No monolithic dumps.
3. **Restructure, don't summarize** — keep exact limits, error codes, roles, state values,
   and full tables; drop only boilerplate and formatting noise.
4. **Every fact cites its source** — frontmatter `sources:` lists the `archive/` (or `.tmp/`)
   file(s) it came from. No source → no page.
5. **Business rules get permanent ids** — `business-rules/br-<NNN>-<short-desc>.md`, H1
   `# BR-<NNN> — <rule>`; never renumber, reuse, or backfill.
6. **Flag contradictions** — sources that disagree go to `compiled/references/contradictions.md`;
   never silently pick a side.
7. **The index is the entry point** — every page is linked from `compiled/index.md`;
   an unlinked page is invisible to retrieval.
8. **Upsert, never duplicate** — recompiles update existing pages in place.
9. **Wikilinks** — relate pages with `[[page-name]]`.

## Page frontmatter template

```markdown
---
title: <page title>
category: glossary | persona | business-rule | concept | workflow | reference
sources:
  - archive/<original file>
updated: YYYY-MM-DD
status: draft | reviewed
---
```

## How consumers retrieve (agentic RAG — no vector DB)

1. Open `compiled/index.md`; follow the link(s) scoping the question; read those pages whole.
2. Cite the page path + its `sources:` entry in any artifact that uses the fact.
3. Grep `.tmp/` only to re-check exact source wording.
4. Not in the wiki → report the gap; never guess from silence.
