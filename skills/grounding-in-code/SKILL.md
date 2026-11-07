---
name: grounding-in-code
description: Use when a skill needs a real-code fact (endpoint, payload, locator): Code KB or read-only grep, cited <layer>:<path>#<symbol> @ <sha>.
version: 1.0.0
---

# Grounding in Code

> Profile first, by section (`profile.mjs`) — `§Code knowledge` lists the Code KB per layer
> (repo path, `rag.toml`, MCP server name, enabled); `§Application under test → Source repos`
> lists raw read-only checkouts for the grep fallback. QA root defaults to `<qa-root>/`.

Turn a code question into a **cited fact or a reported gap**. The Code KB is derived data owned
by each application repo's CI (`rag ingest` / `rag eval` run there); this skill only reads. It
never modifies, builds, or executes application source, and never ingests.

## Scope guardrail

- Read-only, always: `Read`, `Grep`, `Glob`, MCP `search`/`read_document`,
  `python3 -m rag search|status`, `git log|rev-parse|show`. Nothing else touches a repo.
- Only repos named in `§Code knowledge` or `§Source repos`. A path outside them is out of scope — say so.
- Code shows **current behaviour, not intent**. A code fact that contradicts a BRD/BR is a
  `CON-###` for the PM (analyzing-docs), never a reason to bend a case to match the code.

## Resolution order — stop at the first tier that answers, record the tier

| Tier | Source | How | Available when |
|---|---|---|---|
| 1 | **Code KB via MCP** | server `<project>-<layer>`: `search(query, top_k)` → `read_document(path)` | the server is registered in Claude Code (`/mcp` lists it) and the agent may call MCP tools |
| 2 | **Code KB via CLI** | `cd <repo path> && python3 -m rag search "<query>" --top-k 8 --format json` → `Read` the cited file | the agent has `Bash` and `§Code knowledge` marks the layer enabled |
| 3 | **Raw source grep** | `Grep`/`Glob` under the layer's repo path (or `§Source repos`): controllers, routes, DTOs, validators, components | always (slow, unranked — write "tier 3" next to the citation) |
| 4 | Nothing resolves | write the calling skill's gap token (`// UNRESOLVED`, `COVERAGE-GAP`, `?`) and list it in the report | — |

Never skip to guessing. Never open the running app to "find" an endpoint or selector.

## Query patterns — BM25 rewards exact identifiers

| You need | Ask the Code KB | Then confirm in the file |
|---|---|---|
| Endpoint for an action | `"POST /api/jobs"` · `JobsController Create route` | HTTP verb + route attribute/decorator, auth attribute |
| Validation rule / limit | `maxDuration validate` · `MaxLength(` · the field name | the exact bound, error code/message, where it is enforced (DTO vs service) |
| Enum / state values | `enum JobStatus` · the state name from the BR | the full value list |
| Locator | `data-testid="job-save"` · the component name from the screen | the attribute and the component file (frontend layer) |
| What changed / when | tier 3 only: `git -C <repo> log -n 10 --format='%h %ad %s' --date=short -- <path>` | commit, date, message — for `/qa-heal` and `/qa-impact` |
| Who calls this module | `import … from '<module>'` · `<ServiceName>(` | callers list → impact-map `Module` candidates |

Decompose compound questions ("the endpoint AND its validation") into one search each.

## Verify before citing — a search hit is a candidate, not a fact

1. `Read` the file at the cited path; confirm the symbol/attribute is present **at HEAD**.
2. Record the commit: `git -C <repo path> rev-parse --short HEAD`.
3. If the hit and the file disagree (renamed, removed): the **file wins**; run
   `python3 -m rag status` in the repo and report
   `> **Project setup required:** Code KB <layer> is stale (built <date>) — the repo's CI must re-ingest`.
   Do not ingest yourself.

## Citation format (CONTRACTS §10 — byte-exact shape)

```
<layer>:<path>#<symbol-or-heading> @ <short-sha>
backend:src/Controllers/JobsController.cs#Create @ a1b2c3d
frontend:src/components/JobForm.tsx#data-testid=job-save @ 9f8e7d6
```

Where it lands: a case's `## Data` (designing-*), the spec's header comment (generating-*), the
heal report (healing-e2e-script), `## 2. Modules & code touched` of an impact note, the
`Endpoint / Screen` cell of `<qa-root>/docs/impact-map.md`. A code fact without this citation is a gap.

## Degrade gracefully

- No `§Code knowledge` table, or the layer is `no` → start at tier 3.
- No `§Source repos` either → tier 4 immediately; report once per run:
  `> **Project setup required:** declare §Code knowledge (rag-kit index per repo) or §Source repos for code grounding.`
- The agent has no `Bash` (case-designer) → tiers 1 and 3 only.

## Done — ALL must be true

- [ ] Every code fact used carries `<layer>:<path>#<symbol> @ <sha>` and was confirmed in the file at HEAD.
- [ ] Every unresolved question is a named gap in the calling skill's convention — nothing inferred.
- [ ] Zero writes, builds, runs, or ingests against any application repo.
- [ ] Staleness (KB vs file disagreement) reported as a project-setup item, with the file as truth.
