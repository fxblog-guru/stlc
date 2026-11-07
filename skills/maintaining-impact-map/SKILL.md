---
name: maintaining-impact-map
description: Use to upsert docs/impact-map.md (BR ↔ module ↔ endpoint/screen ↔ TC) and write a story’s impact note (/qa-impact).
version: 1.0.0
---

# Maintaining the Impact Map

> Profile first, by section (`profile.mjs`) — `§Domain knowledge` (wiki location), `§Code knowledge`
> (Code KB per layer; impact-map path, default `<qa-root>/docs/impact-map.md`). QA root defaults to `<qa-root>/`.

The traceability table answers "which case covers REQ-x". The impact map answers the question
that comes **before** it: *a story says "add X" — which business rules does X touch, which modules
and endpoints implement them, and which existing cases must run again?* It is the join between
the wiki (`BR-###`), the code (module / endpoint / screen), and the cases (`TC-###`).

## The contract (CONTRACTS §10 — byte-exact)

```markdown
# Impact map

| BR | Module | Endpoint / Screen | TC | Last verified | Notes |
|---|---|---|---|---|---|
| BR-012 | job-scheduling | backend:src/Controllers/JobsController.cs#Create @ a1b2c3d · screen Job form | TC-E2E-JOBS-001, TC-API-JOBS-004 | 2026-09-13 | maxDuration ≤ 8h |
| BR-044 | ? | ? | — | — | minted 2026-09-13 from archive/sprint-42-stories.md |
```

- **Row identity = `(BR, Module)`.** One BR implemented in two modules = two rows.
- `BR` ∈ `BR-NNN` (wiki-owned id) · `Module` = a plan module folder name, or `?` ·
  `Endpoint / Screen` = `grounding-in-code` citation(s) and/or `screen <name>`, or `?` ·
  `TC` = comma-separated `TC-<TYPE>-<MODULE>-<NNN>` or `—` · `Last verified` = `YYYY-MM-DD` on
  which a human or `/qa-impact` confirmed the row against code, or `—`.
- **Column ownership**: `BR`/`Module` rows minted by `building-domain-wiki` (module `?`) and
  resolved here · `Endpoint / Screen` from `grounding-in-code` citations only · `TC` APPENDED by
  the designing-* skills through Mode A · `Last verified` written only by Mode B or a human.
  Rows are never deleted; a retired BR gets `Notes: deprecated per <analysis file>`.
- Missing file → create it from the scaffold seed (heading + header row, zero data rows) and say so.
- `npm run qa:lint` (from `<qa-root>/`) checks heading, columns, `BR-NNN`, TC ids, and the date shape.

## Mode A — Upsert rows (called by other skills; one line of chat output)

Input: one or more of `BR-###`, `module` (or `?`), an `Endpoint / Screen` citation (or `?`),
TC ids to append, a note.

1. Find the row `(BR, Module)`. Not found → if a row `(BR, ?)` exists and `module` is now known,
   **promote** it (replace `?`; no duplicate row, then move it to its sorted position); else
   **insert** the new row at its sorted position — rows are ordered by BR number, then Module
   (CONTRACTS §10). Never append at the end: two branches appending both edit the last line and
   conflict; two branches inserting at different BRs merge cleanly. `qa:lint` errors on order.
2. `TC`: union of existing ids + new ids, deduplicated, original order kept; `—` → first id.
3. `Endpoint / Screen`: fill only from a `grounding-in-code` citation — never from memory, and
   never overwrite a cited value with `?`.
4. Never touch `Last verified` in Mode A. Never renumber or delete rows; the only reorder is putting a row into sorted position.
5. Report one line: `impact-map: +N rows, M rows updated (BR-…)`.

## Mode B — Impact note (`/qa-impact <slug> [docs…]`)

Input: the story / change request (paths or pasted text) and, when they exist, the latest
`<qa-root>/analysis/<slug>/YYYY-MM-DD-analysis.md` and the plan's traceability table. No story and no
analysis → STOP: "nothing to assess — pass the story or run `/qa-analyze <slug>` first".

### Step 1 — Business rules touched
Extract the story's domain terms and actions; resolve each through `<qa-root>/wiki/compiled/index.md`
(index → atomic page, read whole, cite page + `sources:`). Collect the `BR-###` set and personas.
Terms the wiki does not know → **gap** (candidate `Q-###`), never inferred. Add REQ→BR links from
the analysis when it exists.

### Step 2 — Modules & code touched
For each BR: read its impact-map rows → modules, endpoints, screens. For rows with `?`, and for
every module the story names, invoke `grounding-in-code`: confirm the endpoint/component at HEAD,
cite `<layer>:<path>#<symbol> @ <sha>`, and (tier 3) `git log -n 10 -- <path>` to list recent
changes. A module still unknown after that stays `?` and becomes a gap.

**Change-based cross-check (when a base and a head are known** — the plan header's `**Shipped SHA:**`,
the handoff packet's commit, or the user's `--base`/`--head`): run
`node scripts/shared/changed-modules.mjs --base <ref> --head <sha> --repo <§Source repos path>` from
`<qa-root>/`. Every module it prints joins the touched set (`From` = `diff`); every `UNMAPPED` path is a
gap (`module-no-TC` or a missing impact-map row) — the code changed somewhere the map cannot place,
which is exactly where a regression hides. Never drop an UNMAPPED path silently.

### Step 3 — Existing cases to re-verify
Union of: `TC` cells of every row touched in Step 2; traceability rows of **every slug's** plan
whose `Module` is a touched module; cases tagged `@defect:` for those modules (past bugs); the
`cases` list of `changed-modules.mjs` when it ran. Drop `@deprecated:` cases (they are never
re-verified). List each with its owning slug (the case's `**Feature:**`), current `Status` /
`Last run`. A TC id in the map with no case file → report it, keep the id. This section is what
`/qa-plan` imports as `re-verify:<owning-slug>` rows (CONTRACTS §3) — a case owned by `<slug>`
itself is not a re-verify row (it is already in the table).

### Step 4 — Gaps & questions
BRs with module `?` · touched modules with zero TC · terms missing from the wiki · code that
contradicts a BR (`CON-###` candidate). Each gap is phrased as a question with the assumption QA
proceeds on — `/qa-clarify` ingests this section verbatim.

### Step 5 — Write the note and upsert the map
`<qa-root>/analysis/<slug>/YYYY-MM-DD-impact.md` with headings **byte-exact, in this order**:

```markdown
# Impact — <slug> (<date>)
**Inputs:** <story paths / analysis path / plan path>
## 1. Business rules touched
| BR | Statement (short) | Persona(s) | Source page |
## 2. Modules & code touched
| Module | Endpoint / Screen (cited @ sha) | Recent change (commit · date) | From |
## 3. Existing cases to re-verify
| TC | Feature | Type | Module | Priority | Status | Why |
## 4. Gaps & questions
| # | Kind (BR-no-module · module-no-TC · term-not-in-wiki · code-vs-BR) | Question | Assumption |
## 5. Impact map delta
| BR | Module | Change (new row · ? resolved · TC appended · verified) |
```

Then Mode A for every row confirmed or created here, and set `Last verified` = today **only** on
rows whose endpoint/screen was confirmed in code in Step 2. Re-running on the same day upserts
the same note file (no twins).

## Exit criteria (measurable)

- [ ] Every `BR-###` in the note exists in the wiki with a cited page; none invented.
- [ ] Every endpoint/screen in §2 carries a `grounding-in-code` citation, or is `?` and listed in §4.
- [ ] Every TC id in §3 exists as a case file, or is flagged.
- [ ] `<qa-root>/docs/impact-map.md` passes `npm run qa:lint`; no row deleted; `Last verified` only where code was checked.
- [ ] One-line chat summary: BRs touched, modules touched, cases to re-verify, gaps → recommended
      next command (`/qa-clarify` when §4 is non-empty, else `/qa-plan` / `/qa-design`).

Do NOT mint REQ ids, design cases, or edit the traceability table here — the note is INPUT to
`/qa-analyze`, `/qa-plan`, and `/qa-design`, not a replacement for them.
