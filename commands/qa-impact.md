---
description: What a story touches before planning: BRs, modules and code at a commit, cases to re-verify, gaps.
argument-hint: <slug> [story-or-doc-paths…] [--base <ref> --head <sha>]
disable-model-invocation: true
---

Follow `qa-phase-protocol` (invoke the skill if it is not already in context); this file holds only what is specific to this command.

> Profile first, by section (`profile.mjs`) — `§Domain knowledge` (wiki), `§Code knowledge` (Code KB
> per layer, impact-map path). QA root defaults to `<qa-root>/` (profile-overridable).

Answer, with evidence, the question a QA asks the moment a story lands: **"adding this touches
what, and what must I re-verify?"** for feature `<slug>` (first token of `$ARGUMENTS`). A lead-layer
command: run it when the story arrives (before or alongside `/qa-analyze`), and again when scope
changes. Its output is INPUT to `/qa-analyze`, `/qa-plan`, and `/qa-design` — it mints nothing.

## Arguments

- `<slug>` — the feature slug (required).
- Remaining tokens — story / change-request paths (md, pdf, docx…) or URLs — including a dev
  handoff packet `dev/release/<slug>/qa-handoff.md`. Optional when
  `<qa-root>/analysis/<slug>/YYYY-MM-DD-analysis.md` already exists (the note is then built from it).
- `--base <ref> --head <sha>` — change-based selection: the skill runs
  `node scripts/shared/changed-modules.mjs --base <ref> --head <sha> --repo <§Source repos path>`
  and folds the modules, cases and UNMAPPED paths into §2–§4. Default when absent: the packet's
  commit range, else skipped (say so).

## Preconditions (check before delegating)

- [ ] A story/doc path was given OR an analysis exists for `<slug>`. Neither → STOP:
      "nothing to assess — pass the story or run `/qa-analyze <slug>` first".
- [ ] `<qa-root>/wiki/compiled/index.md` exists — without it §1 of the note can only list gaps; warn and
      recommend `/qa-knowledge` first (proceed, do not stop).
- [ ] `<qa-root>/docs/impact-map.md` exists — missing → the skill creates it from the seed and says so.

## Execution

Delegate to the `doc-analyst` agent, which invokes `maintaining-impact-map` **Mode B** (using
`grounding-in-code` for every code fact). Pass: the slug, the story paths, the latest analysis
and plan paths when present, the `§Code knowledge` table, and today's date.

## Output contract (verify before reporting)

- `<qa-root>/analysis/<slug>/YYYY-MM-DD-impact.md` with the five byte-exact headings
  `## 1. Business rules touched` · `## 2. Modules & code touched` · `## 3. Existing cases to re-verify`
  · `## 4. Gaps & questions` · `## 5. Impact map delta`.
- Every endpoint/screen in §2 is cited `<layer>:<path>#<symbol> @ <short-sha>` or marked `?` and
  listed in §4. Every BR in §1 cites a wiki page. Nothing inferred from silence.
- `<qa-root>/docs/impact-map.md` upserted (rows added / `?` resolved / TC untouched / `Last verified`
  only where code was confirmed) and passing `npm run qa:lint`.

## Done criteria

Report: BRs touched (ids), modules touched (with the `?` count and the diff-mapped ones), cases to
re-verify (count, P0/P1 count, owning slugs — these become `re-verify` rows at `/qa-plan`), UNMAPPED
changed paths, gaps (count by kind), impact-map delta, and the next command — `/qa-clarify <slug>` when
§4 is non-empty, otherwise `/qa-analyze <slug>` (no analysis yet) or `/qa-plan <slug>`.
