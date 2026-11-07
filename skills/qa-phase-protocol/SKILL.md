---
name: qa-phase-protocol
description: The protocol every /qa-* command runs: profile first, contracts by section, locate by content, never fabricate, evidence first.
user-invocable: false
version: 1.0.0
---

# Phase protocol

Every `/qa-<phase>` command runs this protocol. The command file holds only what differs for its
phase: the artifact, the agent it delegates to, its own preconditions and refusals. Where a command
and this file disagree, the command wins; where either disagrees with `CONTRACTS.md`, the contract
wins. `§N` means a section of `CONTRACTS.md`; print one with
`node <qa-root>/scripts/shared/contracts.mjs N` rather than reading the whole file.

## 1. Before anything — in this order, stop at the first failure

1. Print the profile sections this phase needs — `node <qa-root>/scripts/shared/profile.mjs "<Section>" …`,
   never a full Read. A `placeholder:` line it prints for a section this phase needs is a project
   setup error: stop with `> **Project setup required:**` naming the section. Never guess a value.
   A type disabled in `§Test types` is out of scope everywhere — skipped and said, never an error.
2. Resolve the QA root (`§Project → QA root`, default `<qa-root>/`). Every path below is relative to it.
3. Read the contract sections the command cites, by number. When an artifact on disk disagrees
   with the contract, the artifact is wrong.
4. Resolve `<slug>` (`[a-z0-9]+(-[a-z0-9]+)*`) and the upstream artifacts the phase needs. A
   missing upstream is a stop that names the command producing it, not a reason to improvise.
5. Authoring phases: `qa:learn -- recall --skill <skill>`, `show` the relevant hits, pass their
   paths to the author. Never to a reviewer. See `references/recall.md`.

## 2. Locate by content, never by filename

Cases are found through the plan's `## Traceability (Requirement ↔ Case)` table, or by grepping
`**Feature:** <slug>` under `<qa-root>/cases/`. Never glob `<slug>.md`. Scripts mirror cases 1:1 by
basename. Case ids, `REQ` ids and defect ids are permanent: never renumbered, reused or renamed —
supersede instead.

## 3. The traceability table has owners (§3)

Planner creates it empty · designers **append** rows · generators flip `Scripted` · execution fills
`Last run` / `Status` / `Report` · reports and gates **read only**. Touch no column you do not own.
Upsert, never duplicate: re-running a phase updates its artifacts in place.

Every artifact starts from its file in `<qa-root>/_templates/`, never from memory. When the template opens
with front matter (§2.1), fill it: `authored_by` is your skill, `reviewed_by` stays `pending` until a
review runs, and `updated` changes on every rewrite.

## 4. Never fabricate

No invented `REQ` id, locator, endpoint, number, run id, TMS id or SHA. A fact about the code
carries a `<layer>:<path>#<symbol> @ <sha>` citation (`grounding-in-code`) or is a gap. Wiki,
Code KB and impact-map silence are gaps. A gate without data is `not evaluable`, never `pass`.

## 5. Evidence before claims

No completion claim without fresh evidence from this run:

- `✓ Wrote <path>` is printed only after the file exists at that path.
- A verdict (`pass` / `fail` / `READY` / `GO`…) is printed with the number or row that decided it.
- "should pass", "probably", "looks correct" never appear.
- Where the artifact is linted (`qa:lint`) or compiled (`heal:check`), run it and quote the last
  line before saying done. A green claim over a red command is the one unrecoverable failure.

## 6. Runs never fix; generators never run

Execution belongs to `/qa-run` with its run folder (`§2`): no run without evidence. A failure is
triaged with one of the four `§5` tokens and routed — `FUNCTIONAL` → `/qa-defect`, `SCRIPT` →
`/qa-heal` or regen, `SETUP/ENV` → the named fix, `FLAKY` → `/qa-quarantine` once the budget is
met. Never retry to green, never skip, never weaken an assertion.

Script comments (generators, `/qa-heal`): `references/script-comments.md`. Verdicts: `references/verdict-integrity.md`.

## 7. Scope guards

- Application source is read-only grounding (`§9.6`). The `unit` and `mobile` types write **test
  files only**, under the declared test dirs, only in Write mode `apply`; staged otherwise.
- Security and performance run only against the app in `§Application under test`, only on an
  environment whose `§Environments` row says yes. CI never authorizes an environment.
- Nothing is written to a tracker or TMS without the user's explicit yes on the exact list
  (`§9.9`). Reads are free and cited. The dev bundle's `qa-handoff.md` is read, never edited.
- Credentials are named, never echoed.

## 8. How a phase ends

Print **only** the skill's summary block: artifacts written, counts, verdicts with evidence,
gaps, and **one** next command — never "do you want me to…?".
Offer a choice only where a human decision exists (two to four options, recommended first). Clarifications a human must answer go to the sheet (`/qa-clarify`); an
agent never downgrades a `blocking` question to an assumption.

## 9. Delegation hygiene (orchestrator)

Specialists are stateless. Every dispatch carries the slug, the plan path, the enabled types or
`--type` filter, the environment from `§Environments`, and the paths of the upstream artifacts to
read — paths, not pasted contents. After a specialist returns, verify the artifact exists at the
contract path and the table changed as required; a missing or malformed artifact is not done.

**Spend.** Dispatch only enabled, requested types that have work (an unscripted row, a REQ with no
case); a type with none is reported as `nothing to do`, not spawned. One phase per session: state
is on disk, so `/clear` between phases is free. A specialist invokes the one skill for its type — none is preloaded.

Unattended (`autonomy.mjs mode` ≠ `off`): follow `references/autonomy.md`.

## 10. Language (§8)

Prose follows `§Project → Artifact language`; structural tokens — headings, ids, table columns,
tags, status and triage tokens — stay English and byte-exact, because `qa:lint` and the dev
bundle's gates match them literally.
