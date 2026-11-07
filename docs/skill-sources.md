# Skill provenance

The skills in this bundle were written for it, inside agentic-fx, against `CONTRACTS.md`. On
2026-10-04 the public skill ecosystem was surveyed for anything worth adopting. This file records
what was looked at, what was taken, what was changed, and what was deliberately left — so a future
upstream change can be diffed against a known starting point rather than guessed at, and so nobody
re-evaluates the same repository from scratch.

The reading rule for every source below: **take domain content** — a heuristic, a failure mode
somebody hit, a scoring rubric, a checklist row — and **leave the output paths, the approval
loops and the severity vocabularies**, which this bundle answers differently on purpose
(traceability table as source of truth, byte-exact ids and tokens, a gate that never grades itself).

## Surveyed on 2026-10-04

| Source | Stars | Licence | Verdict |
|---|---|---|---|
| [petrkindlmann/qa-skills](https://github.com/petrkindlmann/qa-skills) — 50 QA skills, `SKILL.md` + `references/` | 159 | MIT | **adapted** (7 skills, below) |
| [obra/superpowers](https://github.com/obra/superpowers) — methodology skills | 295k | MIT | **adapted** (2 skills) |
| [microsoft/playwright-cli](https://github.com/microsoft/playwright-cli) + its agent skill | — | Apache-2.0 | **depended on**, not vendored |
| Playwright test agents (planner · generator · healer, `npx playwright init-agents`) | — | Apache-2.0 | read, **not adopted** — ideas folded into `/qa-heal` |
| [anthropics/skills](https://github.com/anthropics/skills) `webapp-testing` | — | Apache-2.0 | **idea only** |
| [trailofbits/skills](https://github.com/trailofbits/skills) `property-based-testing` | — | see repo | **idea only** (nine property patterns) |
| [PramodDutta/qaskills](https://github.com/PramodDutta/qaskills) — directory + installer | 230 | MIT | not adopted — a catalogue, not content |
| [lackeyjb/playwright-skill](https://github.com/lackeyjb/playwright-skill) | 3.2k | MIT | not adopted — ad-hoc automation, visible browser; `playwright-cli` covers the need |
| [Jeffallan/claude-skills](https://github.com/Jeffallan/claude-skills) `playwright-expert` | 10.7k | MIT | not adopted — its rules (role-first locators, no `waitForTimeout`, POM, isolation) are already enforced here by `eslint.config.mjs` and `generating-e2e-script` |
| [wshobson/agents](https://github.com/wshobson/agents) `test-automator`, `security-auditor`, `accessibility-expert` | — | not stated | not adopted — 200–500-line persona prompts; this bundle's agents are role + contract, and preload budgets forbid the size |
| [davila7/claude-code-templates](https://github.com/davila7/claude-code-templates) `k6-load-testing` | — | MIT | not adopted — `generating-perf-script` already holds the same k6 shapes (smoke/load/stress/spike/soak, thresholds as SLOs, SharedArray pools) |
| secondsky `mutation-testing` (Stryker / mutmut) | — | — | **candidate** — the page was unreachable; the idea is recorded under *Not yet* |

## Adapted

### From `petrkindlmann/qa-skills` (MIT, read at `main` on 2026-10-04)

| This bundle | From | Kept | Changed |
|---|---|---|---|
| `running-retrospectives` (`/qa-retro`) | `quality-postmortem` | the three-dimension bug-pattern categorisation (root cause × test level that should have caught it × prevention opportunity); "single incidents are anecdotes, three similar bugs are a pattern"; the 5-whys stop rule ("the developer didn't write a test" is not a root cause); 1–3 actions each with owner, deadline and verification; closed-loop review at the next retro | inputs are this bundle's ledgers and digests (`ESCAPES.md`, failure digests, quarantine, review findings, estimate vs actual), never memory; every action is mapped to a **mechanism** that exists here (`/qa-improve`, a profile threshold, a backfill command, a `§Estimation baselines` tune) or recorded as *not preventable*; output at `qa/reports/retro/YYYY-MM-DD-retro.md`; a human picks the actions — the skill describes |
| `improving-checks` (`/qa-improve`) | `quality-postmortem` (closed-loop idea) + the dev bundle's `/sdlc-improve` | a check is earned by a real failure and traceable to it | this bundle's gates are the design skills' published minimums and `reviewing-cases`' depth table, so the row lands there; two fixtures under `tests/fixture/` and a `selfcheck.sh` line prove the check fires and does not fire on everything; `origin:` per row so `/qa-metrics` can report checks that never fired |
| `healing-e2e-script` | `test-reliability` + `selector-drift-recovery` | the 0–5 locator **stability score** (role + name unique on page = 4; region-scoped = 3; CSS class / nth-child ≤ 1), the rule that nothing below 3 is auto-applied, a screenshot per healed locator, line-anchored edits never bulk string replace, pruning tests for deleted features; the flake-kind decision tree (timing · data · environment · order · time-sensitive · visual · external) | the 14-day quarantine is not adopted — `CONTRACTS §12` grants ≤30 days, profile-tunable; "confidence-scored auto-repair" is capped by this bundle's rule that healing never changes what the test proves; the bulk (10+) mode is `/qa-heal --bulk`, still per-spec evidence |
| `executing-tests` | `test-reliability` | the flake-kind vocabulary as a *detail* under the canonical `FLAKY` token | the four `§5` triage tokens stay byte-exact; the kind is an extra `flake-kind:` line in `failures.md`, read by `/qa-quarantine` for the Reason cell |
| `PROJECT-PROFILE §Browsers & devices` + the browser-matrix gate | `cross-browser-testing` | analytics-tiered matrix (P0 > 10 % traffic on every run · P1 3–10 % nightly · P2 1–3 % weekly), "bundled WebKit ≠ Safari", assert user outcomes not rendering, a known-divergences log | tiers are a `Tier` column on the existing table; the gate is "every P0 e2e case passes on every gate-tier project", reported per project like the mobile device matrix |
| *pack: visual* (planned, `docs/testing-coverage-map.md`) | `visual-testing` | mask or freeze dynamic content, ratio tolerance not pixel-perfect, baselines generated in the CI container, review before `--update-snapshots`, Git LFS | a type pack with `@visual` cases inside the e2e tier; a baseline update is a finding to review, never silent |
| *pack: resilience* (planned) | `chaos-engineering` | hypothesis written before injection, steady state first, blast radius and abort < 30 s, staging before production, the three starter experiments (slow DB · third-party 500s · cache down), findings → tickets → re-run | the injection tool is declared per project in the profile (Toxiproxy shipped as the example); production runs need a named human, like `§Environments` authorization |

### From `obra/superpowers` (MIT, read at `main` on 2026-10-04)

| This bundle | From | Kept | Changed |
|---|---|---|---|
| `qa-phase-protocol` | `verification-before-completion` | "no completion claim without fresh verification evidence": identify the command that proves the claim, run it, read the output, then claim — with the evidence | bound to this bundle's artifacts: the `✓ Wrote <path>` summary line is written only after the file exists; a gate verdict is printed only with the number that decided it; "should pass" never appears in a report |
| `healing-e2e-script` | `systematic-debugging` | root cause before any fix; reproduce first; one variable at a time; **three failed attempts → stop and question the premise** | the premise here is the triage class: after three heals the failure is re-triaged as `FUNCTIONAL` or `SETUP/ENV` and routed, never healed a fourth time |

### From `mobile-next/mobile-mcp` (Apache-2.0, read at `main` on 2026-10-16) — ideas only, no code

An MCP server that drives iOS/Android apps for an agent: accessibility tree first, screenshot
fallback, device logs and crash reports as tools (`mobile_list_elements_on_screen`,
`mobile_get_device_logs`, `mobile_list_crashes`, …). It is an **optional** tool for the agent, never a
dependency of a run: Maestro stays the runner, because it writes JUnit a case can be traced through.

| This bundle | Idea | Changed |
|---|---|---|
| `running-exploratory-sessions` (`/qa-explore --agent` on mobile) | read the element tree, act on an element, read again; screenshot only when the tree cannot show it | the device-reality sets of `designing-mobile-cases` replace the web UI risk classes; mobile-mcp when connected, else `maestro hierarchy` + `adb`; a twice-reproduced candidate may leave a Maestro flow **seed** beside the sheet (CONTRACTS §14), never a script |
| `healing-mobile-flow` (`/qa-heal` on a `.yaml`) | the live element tree as the check for a re-resolved element | the score and three-attempt stop are `healing-e2e-script`'s; ids are written only to the kit's element map |
| `run-maestro.mjs` + `lib/device-log.mjs` | device logs and crash reports as evidence | Android log cleared before and read after every run; crashes of the app id only, into `results.json` `crashes`, `FUNCTIONAL` (CONTRACTS §15) |

Not taken: cloud device reservation (their commercial service), `/mobile-mirror` (kitty/Ghostty only),
mobile-mcp as a runner (no JUnit, no traceability), and coordinate taps (score 0–1 in the heal table).

### From `Releaseworthy/agentic-qa` (MIT, read at `main` 54794e7 on 2026-10-18) — code adapted for three features

A public sample of an agentic QA service: Claude agents test a demo shop (ShopLite) with seeded
defects, a hybrid RAG vault (ChromaDB + Neo4j) and deterministic guards in `qa/`. stlc already had
seeded defects (`tests/demo-app/server.mjs`, `DEMO_BUG`) and a wider type range; three things were
missing and are taken:

| This bundle | From | Kept | Changed |
|---|---|---|---|
| `heal-guard.mjs` (`npm run qa:heal-guard`, CONTRACTS §23) | `qa/heal-guard.ts` | the finding kinds (removed · weakened · suppressed · expected · data · contract · maintenance); assertions read from the TypeScript AST; the exact → partial → presence strength scale; the guard walk (try/catch, `.catch()`, if, ternary, logical operators, switch, after return/throw); each suppression counted as written; `test.fail` only on an open defect | Node + `typescript` instead of Bun; evidence is the **mirrored case file** (an expected value or datum may move only to a literal the case states, matched as a token) or a quoted human, instead of their vault documents' git timestamps; locator arguments are maintenance, not data; a spec deleted while its case lives is `removed`; wired into `healing-e2e-script` Step 5 and `/qa-flaky` |
| `flaky.mjs` (`npm run qa:flaky`) + `hunting-flaky-tests` (`/qa-flaky`) | `qa/flaky.ts` + `flaky-hunt` | `--repeat-each` with `--retries=0`; stable / flaky / broken; a runner-reported flaky test counts as a failure; distinct first error lines; the symptom → cause table; prove with the same run | Case IDs instead of titles; JUnit fallback; `stability.md` in the run folder; broken cases go to §5 triage, still-flaky ones to `/qa-quarantine` (§12) |
| `learnings.mjs` (`npm run qa:learn`) + `learning-from-runs` (`/qa-learn`) | `.claude/rules/self-improve.md`, `/learn`, `qa/knowledge-guard.ts` | at most three lessons per pass; duplicates first (update, never a second file); provisional → established on a second source or a human; human edits as the strongest signal; a lesson enters only through a gate; the writer never judges its own lesson | no vector store, no graph, no MCP: lessons are markdown files with `applies_to`, recalled by type / module / skill like the wiki; the harvest of repeated signals across `failures.md`, `stability.md` and blocked heal-guard reports is new here |

Not taken: the RAG vault and its eval (ChromaDB + Neo4j are infrastructure an installable bundle
cannot assume), the ShopLite app, the Bun runtime, the Claude Agent SDK runner and the GitHub
Actions / Azure workflows (stlc ships its own CI templates).

### From `thedotmack/claude-mem` (Apache-2.0, read on 2026-10-19) — one idea, no code

A persistent memory for coding agents: lifecycle hooks capture observations, an LLM compresses them,
SQLite FTS5 + Chroma serve them back through MCP tools in three layers — search returns ids
(~50–100 tokens a hit), timeline adds context, details fetch the full record only for the ids kept.

| This bundle | Idea | Changed |
|---|---|---|
| `qa:learn recall` + `qa:learn show` (CONTRACTS §23) | filter on an index before fetching bodies | the index is the lesson's own `probe` and title, ranked by `applies_to` terms matched; no store, no embeddings, no hooks |

Not taken: the hooks and automatic capture (a lesson must be earned and gated, never logged), the
LLM compression, SQLite/Chroma, the MCP server and the Bun runtime.

### From `vostride/agent-qa` (FSL, read on 2026-10-20) — one idea, no code

`packages/core/src/memory/security-scanner.ts` refuses a memory observation that carries an injection
phrase, a curl/wget with a secret variable, a read of `.env` or `~/.ssh`, or an invisible character.

| This bundle | Idea | Changed |
|---|---|---|
| `lib/lesson-scan.mjs` + `qa:learn` check / recall / show / audit / harvest (CONTRACTS §23) | scan memory before it can reach a prompt | written fresh; widened to credential shapes, bidi isolates and tag characters, chat-role markers, PowerShell; every field scanned and named; findings never echo the payload; recall withholds rather than fails |

Not taken: any code (the licence is not open source), the observation store.

### From `cloudflare/security-audit-skill` (MIT, read at `main` on 2026-10-17) — domain content only

A source-first security *audit* for an agent: recon → coverage ledger → isolated hunters → fresh
verifiers → `findings.json` validated by schema → report. Its attack-class companions (web/auth,
client-side, data isolation, messaging, AI/LLM, mobile/IPC, resource exhaustion) are the best
public catalogue of where real boundary failures hide.

| This bundle | Idea | Changed |
|---|---|---|
| `designing-security-cases` → `references/security-heuristics.md` | the attack-class catalogue; "a candidate needs a crossed boundary and a concrete result"; "a missing header is not a finding alone"; "a guardrail prompt is not a security boundary"; unseen deployment controls → `needs_validation`; the critical/high/medium/low severity anchors | rewritten as black-box cases that prove the defense holds on the team's own app in an authorized environment; `needs_validation` → `COVERAGE-GAP`; severity anchors → `CONTRACTS §7` priority; resource exhaustion limited to proving a limit exists, with a request ceiling |

Not taken: the audit workflow itself (hunter/verifier waves, coverage ledger, `findings.json` and its
validators) — it audits source for vulnerabilities and writes no test case, so it belongs to a
code-review tool, not a QA bundle; memory-safety, supply-chain and cloud/IaC companions (no black-box
case on the app under test); the sandbox and artifact-promotion procedure (we never run target code
outside the project's own test runner).

### From `promptfoo/promptfoo` red-team (MIT, read at `main` b49d55d on 2026-10-20) — ideas only

An LLM red-teaming engine: plugins generate adversarial prompts per risk, strategies rewrite them
(encodings, multi-turn attackers), and an LLM grader scores each answer. Read
`src/redteam/strategies/` (crescendo, goat, base64, homoglyph, leetspeak, otherEncodings) and
`src/redteam/plugins/` (agentic/memoryPoisoning, crossSessionLeak, excessiveAgency, reasoningDos,
asciiSmuggling, indirectPromptInjection, rbac, bola, bfla, toolDiscovery). No code was run or copied.

| This bundle | Idea | Changed |
|---|---|---|
| `designing-security-cases` → `references/security-heuristics.md` §8 adversarial variants | the attack classes: multi-turn escalation, encoding/obfuscation (base64, leetspeak, homoglyph, Unicode tag smuggling), indirect injection, memory poisoning, cross-session leak, excessive agency, reasoning DoS; the "marker string present → fail" oracle | written as black-box cases on the team's own app; oracles are a seeded marker or a tool/audit read-back, never an LLM judge; each class anchored to `CONTRACTS §7` priority; cost probes bounded by a stated ceiling |

Not taken: the generators and the LLM-as-grader rubrics (a case's Expected must be deterministic),
the adaptive attacker loops (GOAT, crescendo's backtracking — a designed case is a fixed script),
harmful-content and jailbreak-for-harm plugins (content policy, not a boundary of the app under test),
and the provider/eval runtime.

## Depended on, not vendored

**`playwright-cli`** (Microsoft, Apache-2.0; `playwright-cli install --skills` puts its skill at
`.claude/skills/playwright-cli`). It drives a real browser from the shell and returns a **snapshot
with element refs**, so an agent can verify a locator against the live DOM without reading the
page into context. Three skills use it **when it is installed** and degrade without it:

- `generating-e2e-script` and `generating-a11y-script` — snapshot the screen a case names and
  confirm every locator in the registry → `data-testid` → role hierarchy resolves to exactly one
  element before writing it. Absent: the element registry alone, as today.
- `healing-e2e-script` — replay the failing step, snapshot, score candidate locators (above),
  patch, re-run; stop after three attempts. Absent: the static pre-flight plus a registry
  cross-check, as today.
- `running-exploratory-sessions` — a charter can be driven live and its notes timestamped from
  the snapshots. Absent: the human tester's notes, as today.

It is a dependency rather than a copy for the same reasons the dev bundle gives for
`diagram-design`: it is actively maintained, larger than this bundle, and needs no adaptation —
the caller decides where results go.

## Read, deliberately not adopted

**Playwright test agents** (`planner`, `generator`, `healer`, installed by
`npx playwright init-agents --loop=claude`). They explore a live app and write `specs/*.md` plans,
`tests/*.spec.ts` and self-heal. Three things conflict: they write outside `qa/` at paths the
contract does not know; the planner's numbered scenarios are not `TC-<TYPE>-<MODULE>-<NNN>` cases
with `REQ` traceability, so nothing downstream could find them; and the healer re-runs "until it
passes or guardrails stop the loop", which is the retry-to-green `§5` forbids. What was taken is
the healer's loop shape — replay → inspect → patch → re-run — with this bundle's stop rule, and
the planner's habit of exploring the running app before writing, which `playwright-cli` gives us
without a second agent set.

**`anthropics/skills` `webapp-testing`.** Two habits were taken as ideas: *reconnaissance then
action* (wait for the app to settle, inspect, pick the selector, then act), which is the order the
generating skills now follow when `playwright-cli` is present; and `with_server.py`'s
start-the-app-first stance, which `/qa-env` states for `local` environments. Its Python scripts
were not vendored — this bundle's runners are Node and Playwright Test.

**`trailofbits` `property-based-testing`.** The nine property patterns (round-trip, inverse,
oracle, idempotence, invariant, easy-to-verify, commutativity, associativity, identity) and the two
ways a property test proves nothing (tautology, vacuity) are added to
`qa-phase-protocol/references/test-design-techniques.md` as a `property` technique the test
matrix may name. The library choice (fast-check, Hypothesis) follows `§Unit testing`'s framework.

## Not yet

**Mutation testing as a run, not a spot check.** `reviewing-unit-tests` does "mutation-sensitivity
spot checks" by reading; a `Mutation command` column in `§Unit testing` (Stryker for Vitest/Jest,
mutmut for pytest, Stryker.NET for xUnit) would let `/qa-unit-audit` run it and report surviving
mutants per module. Recorded here so the next pass starts from the design, not the search.

## Keeping this current

```bash
git clone --depth 50 https://github.com/petrkindlmann/qa-skills /tmp/qa-skills
cd /tmp/qa-skills && git log -1 --format=%H   # record the sha here when you re-read
git diff <recorded-sha>..HEAD -- skills/quality-postmortem skills/test-reliability \
  skills/selector-drift-recovery skills/cross-browser-testing skills/visual-testing skills/chaos-engineering
```

Read the diff for domain content. When you pull something in, note the date and sha in the
affected skill's own header and in the table above.
