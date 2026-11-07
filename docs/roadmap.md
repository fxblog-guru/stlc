# agentic-fx-qa — review and roadmap

Written for: the maintainer deciding what the next three releases of this bundle contain, and the
QA engineers who will adopt or contribute to it once it is public.

Reviewed on 2026-10-04 against three things: the sibling bundle `agentic-fx-dev` (`sdlc/`, 1.0.0,
the more recent design), the field (ISO/IEC/IEEE 29119-3 test documentation, the 2026 crop of
report hubs, the metrics literature), and the bundle's own files, measured by script rather than
read. Where this document and `CONTRACTS.md` disagree, the contract is right and this document
has a bug.

---

## 0. The verdict in one screen

The bundle is **complete as a testing method** and **unfinished as a product**. Eight test types,
a full lead layer, a lint that can fail, a shipped shared layer and a report hub seam are more
than any comparable agentic QA kit offers today. What stops it from being published as-is is not
testing content; it is the things `agentic-fx-dev` learned after this bundle was written:

| # | Finding | Why it matters now | Section |
|---|---|---|---|
| 1 | The three artifacts `sdlc` reads (`*-report.md`, `*-signoff.md`, `DEF-*.md`) have **no byte-exact contract** for the parts it parses — "every gate line passes" is matched against prose | the dev → QA → deploy loop can break silently on a wording change | §3.1 |
| 2 | Always-on description listing is **21,281 chars** (the dev bundle budgets 8,000); commands lack `disable-model-invocation`; one agent preloads 9 skills | Claude Code truncates the listing, so skills stop triggering — and nobody sees it happen | §3.2 |
| 3 | No `VERSION`, `CHANGELOG`, `LICENSE`, `CONTRIBUTING`, `SECURITY`; README and CLI docs disagree on counts and on the install command | the minimum for a public repository | §6 |
| 4 | The amber gates (`/qa-review`, `/qa-env`) write findings but **no verdict front matter, no hashes, no staleness** — a case edited after `READY` stays `READY` | the one property that made the dev bundle's gates trustworthy is missing here | §3.3 |
| 5 | There is **no improvement loop** — the "recall": nothing turns an escaped defect into a permanent new check with proof that the check works | the bundle plateaus at what its first author knew | §5 |

Everything else in this document is either an addon (new test types, new seams) or polish.

---

## 1. Method

- Read both bundles end to end: contracts, profiles, every command, the orchestrator and reporter
  agents, the reporting, metrics, sign-off, execution and review skills, the lint, the self-check,
  the CI templates, the installer's registry.
- Measured the bundle by script: description lengths, word counts, preloads, dangling references,
  `§` citations, README counts (results in §3.2).
- Read the uncommitted working-tree change that teaches `/qa-analyze` to accept the dev handoff
  packet (three files; it is correct and should ship as the first commit of the next version).
- Searched the field for what a test completion report, a report hub and a metrics set are
  expected to contain in 2026 (sources at the end).

---

## 2. What this bundle already does better — do not break these

| Strength | Where | Keep because |
|---|---|---|
| **One traceability table as the product**, with column ownership per phase | `CONTRACTS §3` | it is the clearest source-of-truth rule in either bundle; `sdlc` has nothing as crisp |
| **Honest counting**: `not evaluable` ≠ `pass`, quarantined printed not hidden, `@manual` counted as manual | `reporting-results`, `§12` | this is exactly what report hubs sell as "flaky detection" and most teams fake |
| **Defects end with evidence** — `CLOSED` only with a Resolution, `fixed` only from a verification run | `§13` | makes MTTR a real number |
| **Escape analysis with phase and type missed**, a ledger, and a backfill cell | `§13`, `ESCAPES.md` | this *is* the raw material of the improvement loop (§5) — half of the recall mechanism already exists |
| **Scope guards on security and performance** — environment authorization is a hard block, CI cannot authorize | `§9.5`, CI templates | the kind of rule that keeps a public tool from being misused |
| **Unit and mobile bridges** with `HANDOFF.md`, `propose` by default, production paths never written | `§11`, `§15` | the right answer to "QA writes tests into the dev repo" |
| **A lint that is mutation-tested**: `selfcheck.sh` proves 33 violations are rejected | `tests/` | the dev bundle's test plan credits this pattern; it caught real drift there |
| **Report hub seam** that never fails a run (`VERDICT_URL` unset is a supported state) | `publishing-to-verdict` | "uploading is reporting" is the correct boundary |
| **Eight types with a design skill and a generating skill each**, heuristics in sibling reference files | `skills/` | the content depth is the moat; nothing in §3 touches it |

---

## 3. Gap analysis against `agentic-fx-dev`

The dev bundle was written four weeks later by the same hands, after a live shakedown found twenty
defects in its own design (`sdlc/docs/test-plan.md §7`). Most of what follows is importing those
lessons; the rest is the dev → QA interface.

### 3.1 The interface: three artifacts, no contract (blocks the loop)

`sdlc` reads, read-only, at G10 and G11:

| It reads | It needs from the file | What the file guarantees today |
|---|---|---|
| latest `<qa-root>/reports/<slug>/YYYY-MM-DD-report.md` | one verdict per quality gate, all `pass`; a date after the shipped SHA's G8 run | a section called **Quality gates** with target/actual/verdict rows in free shape; the date is the filename (day resolution) |
| `<qa-root>/reports/release/<id>/YYYY-MM-DD-signoff.md` | `GO` / `NO-GO` / `CONDITIONAL GO` | the recommendation line is prose: "QA recommends…" |
| `<qa-root>/defects/<slug>/DEF-*.md` | `Origin`, `Status`, `Resolution` | **byte-exact and lint-checked** — this one is fine |

Two of three are parsed from prose by a model, on the deploy gate. That worked in the shakedown and
will break the first time a reporter rewords a cell. The fix is small and belongs in this bundle:

- **Add `CONTRACTS §16 — Report and sign-off contract`.** Report front matter
  (`slug`, `date`, `shipped_sha`, `runs: [...]`, `overall: pass | fail | not evaluable`), a
  `## Quality gates` table with byte-exact columns `| Gate | Target | Actual | Verdict |` and
  `Verdict ∈ pass | fail | not evaluable`; sign-off front matter with `recommendation: GO | NO-GO |
  CONDITIONAL GO` and a `## Conditions` table. Lint both (`lint-qa.mjs` section 11).
- **Carry the shipped SHA.** The handoff packet names the merged commit; `/qa-analyze` already
  cites it (working-tree change). Carry it through plan → run → report so G10 compares SHAs, not
  a filename date against a run timestamp.
- **Close the fix loop.** The packet's *What changed* names the `DEF-<slug>-NNN` ids a fix
  resolves. `/qa-defect --verify` should read them from the packet and verify exactly those,
  rather than every OPEN defect whose case happens to pass.
- **Tell `sdlc` what changed.** Once §16 exists, the dev bundle's `dev-reviewing-deployment` row
  22 should cite it instead of "every gate line". That edit is theirs; this document only asks
  for it.

Also worth fixing on the way: `CONTRACTS.md` has §15 before §14, and no `schema:` front matter
(the dev contract carries `bundle:` and `schema: 1`). Add `contracts.mjs`-style slicing
(`node <qa-root>/scripts/shared/contracts.mjs 3 7 13`) so agents stop reading a 3,800-word file whole.

### 3.2 Context budget (silent failure, fix first)

Measured on 2026-10-04:

| Surface | This bundle | Dev bundle budget | Consequence |
|---|---|---|---|
| all skill + agent descriptions together | **21,281 chars** | 8,000 | Claude Code shares roughly 1% of context across every skill description; past the budget the tail is **dropped silently** and those skills stop triggering |
| longest skill description | 775 chars (`grounding-in-code`); 30 of 38 over 300 | 200 | each is a paragraph, not a trigger line |
| longest agent description | 567 chars (`unit-test-engineer`) | 220 | same |
| commands with `disable-model-invocation: true` | **0 of 25** | all | command descriptions (up to 292 chars) sit in the model's listing although commands are user-invoked |
| `qa-reporter` preloaded skills | **9** | 2 | nine full skill files are injected on every spawn — the reporter is the most-spawned agent |
| longest command | `/qa-run` 1,085 words | 750 stage / 1,100 other | borderline; the shared protocol belongs in one resident skill (below) |

The dev bundle fixed this with three moves that transfer directly:

1. **One-line trigger descriptions** ("Use when…"), 200/220 chars, and `disable-model-invocation`
   on every command. Move the paragraph into the skill body's first section.
2. **A `qa-phase-protocol` skill** loaded once per session — profile read, QA-root resolution,
   traceability location by content, the never-fabricate rule, the summary-only-to-chat rule,
   the `> **Project setup required:**` callout. Every command and skill repeats these today
   (the same ~120 words appear in 38 skills). Commands then carry deltas only.
3. **`qa-reporter` invokes skills by name** instead of preloading nine; keep at most
   `executing-tests` and `reporting-results` preloaded.

### 3.3 Gates with a log, a hash and a stale state

`/qa-review` and `/qa-env` are gates (they block `/qa-script` and `/qa-run`) but their output is a
findings table with a verdict sentence. Compared with a dev gate log (`DEV-CONTRACTS §5`):

| Property | Dev gate log | `/qa-review` today |
|---|---|---|
| verdict in front matter, vocabulary fixed | yes | prose line |
| hash of every input and output judged | yes → `STALE` when anything moves | no — edit a case after `READY` and the review still says `READY` |
| reviewer isolated from the author (paths only) | yes, by protocol | partially — `test-planner` reviews `case-designer`'s work, good; nothing stops the orchestrator pasting content |
| attempt numbering, per-finding resolution map | yes | no |
| a human override is named and written | yes | no |

Recommendation, in two steps so it stays cheap:

- **v1.2:** give `<qa-root>/reviews/<slug>/*.md` and `<qa-root>/runs/env-checks/**/readiness.md` the dev log's
  front matter — `verdict`, `inputs[]`/`outputs[]` with `sha256`, `attempt`, `override`. Reuse
  `sdlc/workspace/dev/scripts/lib/doc.mjs` (body-only hashing, CRLF-normalised) rather than
  writing a second implementation. `qa:lint` then marks a review `STALE` when a case it judged
  has changed, and `/qa-script` refuses on `STALE` as it refuses on `REVISE FIRST`.
- **v1.3:** a derived **`<qa-root>/state.json`** built by script (phase reached per slug, counts, gate
  posture, quarantine expiries, verifiable defects, review staleness) — the thing `/qa-status` and
  the orchestrator re-derive from markdown today, differently each time. Wire the three hooks the
  dev bundle has: `PostToolUse` → `lint-qa.mjs --file`, `Stop` → rebuild state, `SessionStart` →
  print the board. `settings.json` has `"hooks": {}` today.

### 3.4 The bundle does not lint itself

`selfcheck.sh` proves the *artifact* lint works. Nothing checks the *bundle*: names, sizes,
descriptions, dangling skill references, `§` citations, README counts. The dev bundle's
`tests/bundle.test.mjs` does all of that in 240 lines and caught eleven skills the contract named
that did not exist. Port it (`node --test "tests/*.test.mjs"`), with budgets at the top, and put it in
`.gitlab-ci.yml` beside `selfcheck`. The 2026-10-04 measurement in §3.2 is what its first run
will print.

### 3.5 Permissions and refusals

`settings.json` has `"ask": []`. The dev bundle asks before `git push`, `gh pr create`, migrations
and deploys. The equivalents here are the writes the contract already says must be confirmed
(`§9.9`): the ADO push script, Jira creation through the MCP, `verdict upload` when it would
create a project, and — new — any runner pointed at an environment whose `§Environments` row says
no. Put those patterns in `permissions.ask` so the harness enforces what the prose promises.

### 3.6 Smaller imports from the dev bundle

| Dev bundle has | Here | Do |
|---|---|---|
| strict templates with front matter for every artifact (`_templates/`, 26 of them) | **done in 2.1:** one `<qa-root>/_templates/` folder (21 formats) and CONTRACTS §2.1 front matter; metrics and retro are still shaped by skill prose | add the five missing templates; the lint matches headings byte-exact |
| `docs/flows.md` — seven diagrams down to a single hash | two Mermaid diagrams in the README | a `docs/flows.md` with the run → triage → defect/heal/quarantine → report → sign-off → `sdlc` G10 loop drawn once |
| `docs/benchmark.md` against five frameworks | none | for a public repo: compare with Testmo, ReportPortal, Allure TestOps (hubs — different category, say so) and with agentic QA kits; be honest about harness lock-in |
| `/sdlc-ask` + `DEC-NNN` ledger an agent may never answer | `/qa-clarify` + `Q-NNN` with "the assumption QA proceeds on" | keep; add the dev rule in words: an **agent** may not downgrade a `blocking` question to an assumption — only a named human |
| `--reaffirm` for cosmetic upstream edits | n/a until §3.3 | after §3.3: `/qa-review --reaffirm` on a case diff |

---

## 4. Gap analysis against the field

### 4.1 The report, against ISO/IEC/IEEE 29119-3

The standard's Test Completion Report (also "test summary report") expects, beyond results:
**deviations from the plan**, **residual risks**, **lessons learned**, **reusable assets**, and the
**metrics** collected. Mapping to `reporting-results`:

| 29119-3 expects | `/qa-report` today | Add |
|---|---|---|
| summary of testing performed, per scope | per-type table, gates, findings — strong | — |
| deviations from the test plan | not a section | `## Deviations from plan` — types planned but not run, cases designed but never scripted, SLOs relaxed (with who said so) |
| residual risk | implicit in "Gaps & recommendations" | `## Residual risk` in business terms, the same sentence the sign-off's executive summary needs |
| lessons learned | in `/qa-signoff` only | leave in sign-off; feed `/qa-retro` (§5) |
| reusable test assets | — | the regression suite manifest already is one; cite it |
| metrics | trend vs previous report | add the feature's DDP and flake count (§4.3) |

### 4.2 Result management: what a hub does that local files cannot, and the gap between them

The 2026 hubs (ReportPortal, Allure TestOps, Testmo, and the ones built on Playwright traces) all
converge on the same four things: **per-test history across runs**, **flakiness as a score not a
retry count**, **failure clustering**, and **gates evaluated server-side**. `verdict` covers all four
and this bundle already uploads to it. The remaining problem is that **CI runs and pipeline runs
never meet**:

- `<qa-root>/ci/*` writes to `runs/ci/<pipeline>-<job>/` and uploads to the hub; `/qa-run` writes to
  `runs/<type>/<slug>/<run-id>/` and updates traceability. A nightly regression that fails in CI
  changes nothing in the table a sign-off reads.
- Recommendation: **`/qa-ingest`** (`scripts/shared/ingest-run.mjs`) — turn any `junit.xml` or
  `results.json` (CI artifact or hub export) into a run folder with `summary.md` and
  `failures.md`, map results to Case IDs by the `TC-…` marker every spec carries, update the run
  columns, and triage as `executing-tests` does. Idempotent on `(source, run-id)`. This is the
  "results management" piece the request named; without it the traceability table only knows
  about runs a person started in Claude Code.
- `/qa-report` should cite the hub run URL (`.verdict-run.json`) per run folder — the skill says so;
  make the report template carry a column for it.

### 4.3 Metrics: name the recall

The literature settles on **Defect Detection Percentage** (DDP, also "test recall") as the one
effectiveness number: defects found by testing ÷ all defects found in the period, with escaped
defects as the complement. Published bands: below 10% escape rate is excellent, 10–20% good,
20–40% concerning, above 40% a broken process. `tracking-metrics` already computes the escape rate
from `ESCAPES.md` and `Origin: INTERNAL` defects. Rename and surface it:

- **DDP (test recall)** as the headline KPI of `/qa-metrics`, with the band it falls in and the
  window stated; per type (`Type missed`) and per phase (`Phase missed`) beneath it.
- **Change Failure Rate linkage**: DORA's CFR is the deploy-side view of the same thing. When the
  dev bundle is installed, `/qa-metrics` may read `dev/deployment/<slug>/runs/*/deploy-run.md`
  (read-only, `DEV-CONTRACTS §9` permits reads of `<qa-root>/**` the other way; ask for the symmetric
  read) and print rollbacks beside escapes. Not measurable without it — say so, as the skill does.
- **Flake score per test** stays in the hub; locally print "flaky in n of last N runs" from
  `failures.md`, which the skill already does.

### 4.4 Test types nobody covers yet

The sdlc-side review listed three. Checked against this bundle's profile:

| Type | Status here | Shape of the addon (§7) |
|---|---|---|
| **resilience / chaos** — a dependency is slow, down or returns garbage; does the product degrade as the architecture claims | none; the dev bundle's threat model and `architecture.md` describe failure modes on paper | design skill from the failure-mode list; k6 or Playwright against a fault-injected env (Toxiproxy for seams, Chaos Mesh or Gremlin where the platform has it); gate = every declared failure mode has a case and the observed behaviour matches the design |
| **disaster recovery** — backup restores, RTO/RPO met | none | mostly a run-book drill: an exploratory-sheet variant with measured TTD/TTE/RTA against RTO/RPO, evidence attached; a `@manual`-heavy type with a `## Recovery objectives` section |
| **localization / i18n** | none | pseudo-localisation pass plus a locale matrix on the existing e2e journeys (Playwright `locale` and `timezoneId` per project); cases for truncation, RTL, date/number/currency formats, untranslated keys |
| **browser matrix** | present — `§Browsers & devices`, `PW_PROJECTS`, five projects in `playwright.config.ts` | what is missing is a **gate**: "every P0 e2e case passes on every gate-tier project", reported per project like the mobile device matrix |
| **visual regression** | none | cheapest addon: `toHaveScreenshot` cases inside e2e with a `@visual` tag and a baseline-review step; a finding, never a silent update of the baseline |
| **contract / consumer-driven** | `api` covers contract drift against OpenAPI | Schemathesis or Pact as an alternative tool in the Tool column, not a new type |

---

## 5. The recall: an improvement loop that proves itself

"Recall" has two meanings here and the bundle should have both.

**Recall as a metric** is §4.3: DDP, trended, by phase and type missed. Half of it exists.

**Recall as a loop** is what the dev bundle calls `§17` and `/sdlc-improve`: a failure that reached
production becomes a permanent check, with a fixture that proves the check fires and a fixture
that proves it does not fire on everything. This bundle has the intake (`/qa-escape` names the
phase and the type that missed) but **nothing that changes the method afterwards**. The backfill
cell in `ESCAPES.md` adds one case; it never adds a rule.

Two commands close it:

### `/qa-retro <release-id | sprint>`

Reads only what exists: `ESCAPES.md` rows in the window, every report's failure digest, the
quarantine ledger, review findings by class (GAP / DEPTH / VAGUE …), MTTR, and the estimate vs
actual from `/qa-estimate`. Writes `<qa-root>/reports/retro/YYYY-MM-DD-retro.md`: the three largest
leaks with their evidence, and **one action per leak mapped to a mechanism** — a `/qa-improve` row,
a profile threshold, a `§Estimation baselines` tune, a backfill command, or "not preventable,
recorded". Observations describe; a human picks the actions, exactly as `/qa-metrics` already
behaves.

### `/qa-improve <skill> "<check>"`

Adds one row to a design skill's minimums or `reviewing-cases`' depth table, **plus two fixtures
under `tests/fixture/`** — one case the new check must flag, one it must leave alone — and the
`selfcheck.sh` line that proves both. Refuses without a traceable origin (a `DEF-…` id, a retro,
a `CR`), refuses a check that grades quality instead of deciding a fact, and warns past ~25 rows.
Each row carries `origin:` so `/qa-metrics` can report **checks that never fired across N
features** — candidates for retirement. That last line is the recall check on the recall loop
itself: a checklist that only grows is one nobody reads.

Both reuse the dev bundle's command text almost verbatim (`sdlc/commands/sdlc-improve.md`); the
difference is where fixtures live and that this bundle's gates are the design-skill minimums.

---

## 6. Public-readiness checklist

Minimum for a public repository, in the order to do them:

1. `LICENSE` (MIT, matching the dev bundle), `VERSION` (`1.0.0` — this is the first release),
   `CHANGELOG.md` (Keep a Changelog; the eight commits in `git log` are the entries),
   `SECURITY.md` (no telemetry, no network of its own except the hub and TMS the profile names,
   scope guard on security/perf), `CONTRIBUTING.md` (naming, budgets, where a change goes, how to
   add a type — the §7 addon contract).
2. One install story. README says `pip install git+…cli-afx`; `docs/user-guide.md §2` says
   `npm i -g @agentic-fx/cli-afx`. The CLI README counts 24 commands and 37 skills; this README
   says 25 and 38 (the files say 25 and 38). The bundle self-lint (§3.4) checks counts forever.
3. Remove `skills/building-domain-wiki/scripts/__pycache__/` and add `__pycache__/` to a root
   `.gitignore` (there is none; the dev bundle has one).
4. English only, which the repository already is; keep the `Artifact language` switch for teams.
5. A worked example a stranger can run in ten minutes: `tests/fixture/qa` is already a complete
   mini-workspace (`orders`) — document it as the demo, with the `/qa-report orders` and
   `/qa-status` output it produces.
6. `docs/flows.md` and `docs/benchmark.md` (§3.6).
7. Pipeline badge and the `node --test "tests/*.test.mjs"` + `selfcheck` jobs green on the default branch.

---

## 7. Addons: make a test type a pack

Today a type is spread across nine places (profile row, `§1` stem, `§7` sections, a design skill,
a generating skill, a runner script, a `lint-qa.mjs` branch, a `reporting-results` step, a CLI
`RUNNER_BY_TYPE` entry). Adding resilience, DR and i18n the same way triples the surface. Define
the pack once and make the three new types the first packs:

```
types/<type>/
  TYPE.md              # stem, profile row, §7 sections, gate row, tool column — the contract slice
  designing-<type>-cases/SKILL.md
  generating-<type>-script/SKILL.md
  runner.sh | runner.mjs   # becomes test:<type>
  lint.mjs             # the type's §7 section check, loaded by lint-qa.mjs
  report.md            # the step reporting-results appends for this type
  fixture/             # one case, one script, one run folder — selfcheck uses them
```

`afx addon add resilience` copies the pack into `.claude/skills/` and `<qa-root>/`, appends the profile
row disabled, merges the runner into `package.json`, and `afx doctor` learns the toolchain from
`TYPE.md`. The same seam serves non-type addons: a notification adapter (Slack/Teams come free via
`verdict`, say so), a second TMS, an alternative hub.

Order of packs by value for effort: **visual** (an afternoon, pure Playwright) → **i18n** (two
days, reuses e2e journeys) → **browser-matrix gate** (a day, reporting only) → **resilience**
(a week, needs an injection tool decision — `DEC`) → **DR** (a week, mostly templates and a drill
sheet).

---

## 8. Roadmap

| Version | Theme | Contents | Effort | Unblocks |
|---|---|---|---|---|
| **1.0.0** | first release | commit the working tree (`/qa-analyze` reads the handoff packet); §6 items 1–4 | S | publishing; `sdlc` 1.0.0 loop works end to end |
| **1.1.0** | the interface | `CONTRACTS §16` report + sign-off contract, `shipped_sha` carried through, `/qa-defect --verify` reads the packet's DEF ids, lint section 11, five missing templates, `contracts.mjs` slicer, §14/§15 order | M | the dev bundle can parse rather than read |
| **1.2.0** | budget and gates | trigger-line descriptions, `disable-model-invocation`, `qa-phase-protocol`, reporter preloads 2, `tests/bundle.test.mjs`, review/env logs with front matter + hashes + `STALE`, `permissions.ask` | M | skills trigger reliably; a gate means *this version* passed |
| **1.3.0** | state and recall | `<qa-root>/state.json` + hooks, `/qa-ingest`, DDP headline in `/qa-metrics`, `/qa-retro`, `/qa-improve` with fixtures and never-fired reporting, report `## Deviations` + `## Residual risk` | L | CI runs reach traceability; the method learns |
| **2.0.0** | packs | the `types/<type>/` contract, `afx addon`, visual + i18n + browser-matrix gate + resilience + DR packs, `docs/flows.md`, `docs/benchmark.md` | L | "comprehensive" in the sense the sdlc review used |

`1.0.0` and `1.1.0` are the ones to do before anyone outside the team installs it; `1.2.0` before
it is used on a second project; the rest in the order teams ask.

---

## 9. Decisions only a human can make

Batched, with a recommended default first:

| # | Question | Options | Recommended |
|---|---|---|---|
| D1 | Freeze the report and sign-off contract (§3.1) now, so `sdlc` 1.0.0 can cite it? | yes in 1.1.0 · later with the gate-log work · never (keep prose) | **yes in 1.1.0** |
| D2 | Adopt the dev bundle's gate-log shape (hashes, `STALE`) for `/qa-review` and `/qa-env`? | full (1.2.0) · front matter only, no hashes · keep as is | **full** — reuse `lib/doc.mjs`, do not reimplement |
| D3 | Licence | MIT (as `sdlc`) · Apache-2.0 · proprietary | **MIT** |
| D4 | First addon pack | visual · i18n · resilience · DR | **visual then i18n** |
| D5 | Resilience injection tool the pack standardises on | Toxiproxy · Chaos Mesh · Gremlin · "declared per project in the profile" | **declared per project**, Toxiproxy as the shipped example |
| D6 | Ask the dev bundle for a symmetric read (`dev/deployment/**` from `/qa-metrics`) for CFR? | yes · no, keep the boundary one-way | **yes**, read-only, stated in both §9s |
| D7 | Repository name on publish | `stlc` (current) · `agentic-fx-qa` (what every file calls it) | **`agentic-fx-qa`**; the CLI was renamed `afx` on 2026-10-04 (`stlc` stays as a deprecated alias), so nothing else needs the `stlc` name |

---

## Sources

- ISO/IEC/IEEE 29119-3 test documentation, test completion report contents:
  [microTOOL summary](https://www.microtool.de/en/document-management/test-documentation-with-iso-iec-ieee-29119-32021/),
  [ISO OBP 29119-3](https://www.iso.org/obp/ui#iso:std:iso-iec-ieee:29119:-3:ed-1:en),
  [IEEE SA 29119-3](https://standards.ieee.org/ieee/29119-3/7499/)
- Report hubs in 2026 (history, flake scores, gates):
  [ReportPortal vs Allure](https://medium.com/@sarah.thoma.456/reportportal-vs-allure-report-a-comprehensive-comparison-5eb0d153ce73),
  [Allure TestOps alternatives](https://testdino.com/alternatives/allure-testops-alternatives),
  [Test reporting tools 2026](https://getautonoma.com/blog/test-reporting-tools),
  [Test observability tools](https://qualflare.com/blog/best-test-observability-tools/)
- Metrics — DDP, escaped defects, bands, DORA linkage:
  [Tricentis quality metrics](https://www.tricentis.com/learn/software-quality-metric),
  [PractiTest test effectiveness](https://www.practitest.com/resource-center/blog/test-effectiveness-metrics/),
  [Plandek escaped defects](https://plandek.com/blog/escaped-defects),
  [DevStats escaped defects benchmarks](https://www.devstats.com/glossary/escaped-defects),
  [DORA metrics in testing](https://www.testresults.io/academy/dora-metrics-in-software-testing-how-to-measure-testing-without-slowing-delivery)
- Resilience and DR testing:
  [Harness DR testing](https://developer.harness.io/resilience-testing/disaster-recovery-testing/get-started),
  [Gremlin DR with chaos engineering](https://www.gremlin.com/community/tutorials/testing-disaster-recovery-with-chaos-engineering),
  [DR testing checklist](https://www.mydatapath.com/blog/disaster-recovery-testing-checklist-it-teams/)
- The sibling bundle: `sdlc/DEV-CONTRACTS.md` §4–5, §9, §11, §17; `sdlc/docs/test-plan.md` §7;
  `sdlc/tests/bundle.test.mjs`; `sdlc/docs/benchmark.md`.
